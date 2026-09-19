// Better-auth owns /api/auth/*: sign-in, sign-out, session, and the endpoints its
// client calls. Karet's own auth routes are gone, along with the cookie signing
// they used to do by hand.
//
// The handlers resolve the auth instance per request rather than at module load,
// so `next build` — which imports every route to collect page data — does not
// need a database URL.

import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/auth";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
