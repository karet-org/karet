// Session cookies — HMAC-signed JSON payload.
//
// Cookie value: `<base64url(payload)>.<base64url(hmacSHA256(payload))>`
// Payload: `{ "u": "", "exp": <unix-seconds> }`. The `u` slot is kept for
// backwards-compatible verification of pre-migration cookies (which carry
// the legacy admin username). New cookies set it to the empty string —
// the app is single-admin and password-only.
//
// Stateless: no server-side session table. Uses Web Crypto (`globalThis.
// crypto.subtle`) so the same module works in both the Edge middleware
// and Node route handlers.

import { NextResponse } from "next/server";

export const SESSION_COOKIE = "karet_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days.

interface SessionPayload {
  u: string;
  exp: number;
}

export interface Session {
  username: string;
  expiresAt: number;
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
  username: string,
  secret: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: SessionPayload = { u: username, exp: expiresAt };
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

export async function verifySession(
  cookieValue: string | undefined,
  secret: string,
): Promise<Session | null> {
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

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  if (typeof parsed.u !== "string" || typeof parsed.exp !== "number") {
    return null;
  }
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return { username: parsed.u, expiresAt: parsed.exp };
}

/**
 * Build the `Set-Cookie` value for a fresh session. Secure flag is opt-in —
 * dev runs over plain HTTP; prod (deploy-aws.md) terminates TLS at the ALB.
 */
export function sessionCookieHeader(
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

/**
 * Sign a fresh session and return a `NextResponse` with `{ ok: true }` and
 * a `Set-Cookie` header attached. The cookie's `Secure` flag is derived
 * from `request.url`'s protocol so dev (HTTP) and prod (HTTPS via ALB)
 * both work.
 */
export async function issueSessionCookie(request: Request): Promise<NextResponse> {
  const { value, expiresAt } = await signSession("", getSessionSecret());
  const secure = new URL(request.url).protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookieHeader(value, expiresAt, { secure }));
  return res;
}

export function getSessionSecret(): string {
  const secret = process.env.KARET_SESSION_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error(
      "KARET_SESSION_SECRET is not set. Generate one with " +
        "`openssl rand -base64 48` and set it in the environment.",
    );
  }
  return secret;
}
