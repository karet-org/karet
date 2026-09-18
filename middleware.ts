// Edge login wall: browser routes redirect to /login, `/api/*` gets 401 JSON,
// and only /login and /api/auth/* are reachable without a session.
//
// This is an optimistic gate, deliberately. Sessions live in Postgres now, which
// Edge cannot reach, so middleware checks that a session cookie is present and
// nothing more. Whether that session is still valid, whose it is, and what they
// may do is decided by `withRole` in the route handler, where better-auth can
// query the session table. A stale cookie therefore gets past this line and is
// refused a few milliseconds later, which is the right trade: no database round
// trip on static assets, no authorization decided on unverified input.

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { serviceTokenPrincipal } from "@/lib/auth/service-token";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|opengraph-image.svg|manifest.webmanifest).*)"],
};

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

export function middleware(request: NextRequest) {
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

  if (getSessionCookie(request)) return NextResponse.next();

  if (isApi) {
    return NextResponse.json(
      { error: "unauthorized", message: "missing or invalid session" },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (pathname !== "/login") {
    loginUrl.searchParams.set("next", pathname + (request.nextUrl.search || ""));
  }
  return NextResponse.redirect(loginUrl);
}
