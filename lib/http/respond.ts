// Turn an Outcome into a Response, once.
//
// The modules that hold rules return `Outcome`, which knows nothing about HTTP.
// Route handlers are adapters: they parse a request, call one function, and hand
// the result here. Keeping the mapping in its own module is what lets the rules be
// tested without a request.

import type { Outcome } from "@/lib/outcome";

export function respond<T>(
  outcome: Outcome<T>,
  ok: (value: T) => Response,
): Response {
  if (outcome.ok) return ok(outcome.value);
  return Response.json(
    { error: outcome.error, message: outcome.message },
    { status: outcome.status },
  );
}
