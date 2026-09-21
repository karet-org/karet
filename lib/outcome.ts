// A result a caller can act on: the value, or a refusal with the code, the
// sentence and the status an adapter should use.
//
// Modules that hold rules return one of these instead of constructing a Response,
// which is what lets the rules be tested without a request. `lib/http/respond.ts`
// maps one to a Response.

export interface Refusal {
  error: string;
  message: string;
  status: number;
}

export type Outcome<T> = { ok: true; value: T } | ({ ok: false } & Refusal);

export function refuse(error: string, message: string, status = 422): Outcome<never> {
  return { ok: false, error, message, status };
}
