// Stateless session cookies: `<base64url({exp})>.<base64url(hmacSHA256)>`; a valid
// HMAC over a fresh `exp` is the whole authorization signal (single-admin app).
// Web Crypto, so this module works in Edge middleware and Node handlers alike.

import { NextResponse } from "next/server";

export const SESSION_COOKIE = "karet_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days.

interface SessionPayload {
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
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: SessionPayload = { exp: expiresAt };
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

/** True iff `cookieValue` is a valid, non-expired session signed by `secret`. */
export async function verifySession(
  cookieValue: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot < 0) return false;
  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  let payloadBytes: Uint8Array<ArrayBuffer>;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    payloadBytes = base64UrlDecode(payloadB64);
    sigBytes = base64UrlDecode(sigB64);
  } catch {
    return false;
  }

  const key = await hmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes),
  );
  if (!timingSafeEqualBytes(sigBytes, expected)) return false;

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return false;
  }
  if (typeof parsed.exp !== "number") return false;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return false;
  return true;
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

/** Sign a fresh session; the cookie's `Secure` flag follows `request.url`'s protocol. */
export async function issueSessionCookie(request: Request): Promise<NextResponse> {
  const { value, expiresAt } = await signSession(getSessionSecret());
  const secure = new URL(request.url).protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookieHeader(value, expiresAt, { secure }));
  return res;
}

/**
 * Signing key material, or `null` when config is incomplete (callers fail
 * closed). Derived from the session secret AND the admin password hash, so
 * rotating the password invalidates every outstanding session. Edge-safe.
 */
export function getSessionKeyMaterial(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secret = env.KARET_SESSION_SECRET;
  const adminHash = env.KARET_ADMIN_PASSWORD_HASH;
  if (!secret || secret.length === 0) return null;
  if (!adminHash || adminHash.length === 0) return null;
  return `${secret}\n${adminHash}`;
}

export function getSessionSecret(): string {
  const material = getSessionKeyMaterial();
  if (!material) {
    throw new Error(
      "KARET_SESSION_SECRET / KARET_ADMIN_PASSWORD_HASH are not both set. " +
        "Generate the secret with `openssl rand -base64 48` and the hash " +
        "with `npm run hash-password`.",
    );
  }
  return material;
}
