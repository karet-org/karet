// Edge middleware login wall: browser routes redirect to /login, `/api/*` gets
// 401 JSON, only /login and /api/auth/* are reachable unauthenticated. Session
// verification uses Web Crypto so it runs in the Edge runtime.

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  getSessionKeyMaterial,
  verifySession,
} from "@/lib/auth/session";

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

  const secret = getSessionKeyMaterial();
  if (!secret) {
    // Missing configuration: fail closed rather than letting requests through
    // (the startup check in `instrumentation.ts` should have caught this).
    if (isApi) {
      return NextResponse.json(
        {
          error: "server_misconfigured",
          message: "KARET_SESSION_SECRET / KARET_ADMIN_PASSWORD_HASH not set",
        },
        { status: 500 },
      );
    }
    return new NextResponse(
      "Server is misconfigured: session signing material is not set.",
      { status: 500, headers: { "content-type": "text/plain" } },
    );
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(cookie, secret)) return NextResponse.next();

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
