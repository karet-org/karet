// Edge middleware login wall: browser routes redirect to /login, `/api/*` gets
// 401 JSON, only /login and /api/auth/* are reachable unauthenticated. Session
// verification uses Web Crypto so it runs in the Edge runtime.
//
// This gate proves a request carries a validly signed, unexpired session (or the
// service token), and that the role in it clears the bar for the request. The
// claim is tamper-proof but can be stale, so `withRole` re-checks against the
// user store in the handler, where a demotion or deletion is visible.

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  getSessionKeyMaterial,
  verifySession,
} from "@/lib/auth/session";
import { serviceTokenPrincipal } from "@/lib/auth/service-token";
import { requiredRole } from "@/lib/auth/policy";
import { roleAtLeast } from "@/lib/auth/roles";

export const config = {
  // Every request except Next internals and static assets; `middleware()` decides.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|opengraph-image.svg|manifest.webmanifest).*)"],
};

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");

  // Machine callers present the service token instead of a cookie.
  if (isApi && serviceTokenPrincipal(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  const secret = getSessionKeyMaterial();
  if (!secret) {
    // Missing configuration: fail closed rather than letting requests through
    // (the startup check in `instrumentation.ts` should have caught this).
    if (isApi) {
      return NextResponse.json(
        { error: "server_misconfigured", message: "KARET_SESSION_SECRET is not set" },
        { status: 500 },
      );
    }
    return new NextResponse(
      "Server is misconfigured: session signing material is not set.",
      { status: 500, headers: { "content-type": "text/plain" } },
    );
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await verifySession(cookie, secret);
  if (claims) {
    const needed = requiredRole(request.method, pathname);
    if (!needed || roleAtLeast(claims.role, needed)) return NextResponse.next();
    if (isApi) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: `this action needs the ${needed} role; you are ${claims.role}`,
        },
        { status: 403 },
      );
    }
    // A page a role may not see is rare (pages are viewer-level); send them
    // home rather than to the login form, which they would sail through.
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  if (isApi) {
    return NextResponse.json(
      { error: "unauthorized", message: "missing or invalid session" },
      { status: 401 },
    );
  }

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
