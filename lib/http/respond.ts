// Turn an Outcome into a Response, once.
//
// The modules that hold rules return `Outcome`, which knows nothing about HTTP.
// Route handlers are adapters: they parse a request, call one function, and hand
// the result here. Keeping the mapping in its own module is what lets the rules be
// tested without a request.

import { NextResponse } from "next/server";
import type { Outcome } from "@/lib/auth/account-admin";

export function respond<T>(
  outcome: Outcome<T>,
  ok: (value: T) => NextResponse,
): NextResponse {
  if (outcome.ok) return ok(outcome.value);
  return NextResponse.json(
    { error: outcome.error, message: outcome.message },
    { status: outcome.status },
  );
}
