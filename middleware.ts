// Next.js edge middleware — protects `/api/*` with a shared secret.
//
// Behavior:
//   - `KARET_API_KEY` unset/empty: middleware is a no-op (dev convenience).
//   - `KARET_API_KEY` set: request must carry `X-API-Key: <value>` or a
//     `Authorization: Bearer <value>` header, else 401.
//
// Next pages (dashboards, graph) are not guarded — this is an API-surface
// lock only. End-users reach dashboards via the browser; automated callers
// hitting the JSON API must present the key.

import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/api/:path*"],
};

export function middleware(request: NextRequest) {
  const expected = process.env.KARET_API_KEY;
  if (!expected) return NextResponse.next();

  const supplied =
    request.headers.get("x-api-key") ??
    extractBearer(request.headers.get("authorization"));

  if (supplied === expected) return NextResponse.next();

  return NextResponse.json(
    { error: "unauthorized", message: "missing or invalid API key" },
    { status: 401 },
  );
}

function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : null;
}
