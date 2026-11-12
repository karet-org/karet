// Better-auth owns /api/auth/*: sign-in, sign-out, session, and the endpoints its
// client calls. The auth instance is resolved per request, so importing this
// module does not need a database URL.

import { getAuth } from "@/lib/auth/auth";

export async function GET(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
