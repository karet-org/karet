// Better-auth owns /api/auth/*: sign-in, sign-out, session, and the endpoints
// its client calls. Karet's own auth routes are gone, along with the cookie
// signing they used to do by hand.

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
