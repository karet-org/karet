// Login wall: pages redirect to /login, `/api/*` gets 401 JSON, and only
// /login and /api/auth/* are reachable without a session.
//
// This is an optimistic gate, deliberately: it checks that a session cookie or
// the service token is present and nothing more. Whether that session is still
// valid, whose it is, and what they may do is decided by `withRole` in the
// route handler, which reads the session table. A stale cookie therefore gets
// past this line and is refused a few milliseconds later.

import { getSessionCookie } from "better-auth/cookies";
import { serviceTokenPrincipal } from "@/lib/auth/service-token";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

/** A response that refuses the request, or null to let it through. */
export function gate(request: Request): Response | null {
  const url = new URL(request.url);
  const { pathname } = url;
  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const isApi = pathname.startsWith("/api/");
  // Machine callers present the service token instead of a cookie.
  if (isApi && serviceTokenPrincipal(request.headers.get("authorization"))) return null;
  if (getSessionCookie(request)) return null;

  if (isApi) {
    return Response.json({ error: "unauthorized", message: "missing or invalid session" }, { status: 401 });
  }
  const login = new URL("/login", url);
  login.searchParams.set("next", pathname + url.search);
  return Response.redirect(login, 307);
}
