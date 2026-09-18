// Stateless session cookies: `<base64url(claims)>.<base64url(hmacSHA256)>`.
// Web Crypto, so this module works in Edge middleware and Node handlers alike.
//
// The claims name the user (`sub`), their role, and a fingerprint of their
// credential (`cv`). Middleware verifies the signature and expiry only, which
// is all it can do at the edge without reading the user store; route handlers
// call `currentUser()`, which additionally checks the user still exists and
// that `cv` still matches, so a password change, a role change or a deleted
// account takes effect without waiting for the cookie to expire.

import { NextResponse } from "next/server";
import { credentialVersion, isRole, type Role } from "./roles";

export const SESSION_COOKIE = "karet_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days.

export interface SessionClaims {
  sub: string;
  role: Role;
  cv: string;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signSession(
  secret: string,
  claims: Omit<SessionClaims, "exp">,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: SessionClaims = { ...claims, exp: expiresAt };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes),
  );
  return {
    value: `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(sig)}`,
    expiresAt,
  };
}

/** The claims when `cookieValue` is a valid, non-expired session; null otherwise. */
export async function verifySession(
  cookieValue: string | undefined,
  secret: string,
): Promise<SessionClaims | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  let payloadBytes: Uint8Array<ArrayBuffer>;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    payloadBytes = base64UrlDecode(payloadB64);
    sigBytes = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  const key = await hmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes),
  );
  if (!timingSafeEqualBytes(sigBytes, expected)) return null;

  let parsed: SessionClaims;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (typeof parsed.sub !== "string" || parsed.sub.length === 0) return null;
  if (!isRole(parsed.role)) return null;
  if (typeof parsed.cv !== "string") return null;
  if (typeof parsed.exp !== "number") return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

/** `Set-Cookie` for a fresh session. Secure is opt-in: dev runs over plain
 * HTTP, prod terminates TLS at the ALB. */
function sessionCookieHeader(
  value: string,
  expiresAt: number,
  options: { secure: boolean },
): string {
  const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Build a `Set-Cookie` value that clears the session cookie. */
export function clearSessionCookieHeader(options: { secure: boolean }): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Sign a fresh session for `user`; the cookie's `Secure` flag follows `request.url`. */
export async function issueSessionCookie(
  request: Request,
  user: { username: string; role: Role; passwordHash: string },
): Promise<NextResponse> {
  const { value, expiresAt } = await signSession(getSessionSecret(), {
    sub: user.username,
    role: user.role,
    cv: await credentialVersion(user),
  });
  const secure = new URL(request.url).protocol === "https:";
  const res = NextResponse.json({
    ok: true,
    user: { username: user.username, role: user.role },
  });
  res.headers.set("Set-Cookie", sessionCookieHeader(value, expiresAt, { secure }));
  return res;
}

/**
 * Signing key material, or `null` when config is incomplete (callers fail
 * closed). Per-user credential fingerprints live in the claims, so this no
 * longer mixes in the admin hash: rotating one account's password must not sign
 * every other account out. Edge-safe.
 */
export function getSessionKeyMaterial(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = env.KARET_SESSION_SECRET;
  if (!secret || secret.length === 0) return null;
  return secret;
}

export function getSessionSecret(): string {
  const material = getSessionKeyMaterial();
  if (!material) {
    throw new Error(
      "KARET_SESSION_SECRET is not set. Generate it with `openssl rand -base64 48`.",
    );
  }
  return material;
}
