// Next.js edge middleware — login wall.
//
// Behavior:
//   - Browser routes (anything except /login, public assets, /api/*): if no
//     valid session cookie, 302 to /login?next=<original-path>.
//   - /api/* (except /api/auth/*): require a valid session cookie OR a valid
//     `KARET_API_KEY` shared secret. Otherwise 401 JSON.
//   - /api/auth/* and /login are always reachable so the user can sign in.
//
// Session cookies are HMAC-signed. Verification uses Web Crypto so it works
// in the Edge runtime; password hashing (which needs Node `crypto.scrypt`)
// stays in the route handlers.

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  verifySession,
} from "@/lib/auth/session";

export const config = {
  // Run on every request except Next internals and static asset routes.
  // The redirect logic in `middleware()` then decides what to do.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|opengraph-image.svg|manifest.webmanifest).*)"],
};

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  // Webhooks from non-browser clients (e.g. RustFS object-event
  // notifications). The handler enforces its own shared-secret check.
  "/api/events/",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");

  const secret = process.env.KARET_SESSION_SECRET;
  if (!secret) {
    // Missing configuration — fail closed instead of silently letting
    // requests through. The startup check in `instrumentation.ts` should
    // have caught this; this is the belt-and-braces.
    if (isApi) {
      return NextResponse.json(
        { error: "server_misconfigured", message: "KARET_SESSION_SECRET is not set" },
        { status: 500 },
      );
    }
    return new NextResponse(
      "Server is misconfigured: KARET_SESSION_SECRET is not set.",
      { status: 500, headers: { "content-type": "text/plain" } },
    );
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(cookie, secret);
  if (session) return NextResponse.next();

  if (isApi) {
    const apiKey = process.env.KARET_API_KEY;
    if (apiKey && apiKey.length > 0) {
      const supplied =
        request.headers.get("x-api-key") ??
        extractBearer(request.headers.get("authorization"));
      if (supplied === apiKey) return NextResponse.next();
    }
    return NextResponse.json(
      { error: "unauthorized", message: "missing or invalid session" },
      { status: 401 },
    );
  }

  // Browser route — bounce to /login, preserving the original target.
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  // Don't loop /login → /login.
  if (pathname !== "/login") {
    loginUrl.searchParams.set(
      "next",
      pathname + (request.nextUrl.search || ""),
    );
  }
  return NextResponse.redirect(loginUrl);
}

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : null;
}
