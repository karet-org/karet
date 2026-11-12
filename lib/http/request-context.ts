// The request being handled, for code that needs its headers without having
// the Request passed down: currentPrincipal() reads the session cookie and the
// bearer token from here. The server runs each API request inside
// runWithRequest.
//
// Node runtime only.

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<Request>();

export function runWithRequest<T>(request: Request, fn: () => T): T {
  return store.run(request, fn);
}

/** Headers of the request being handled. Throws outside a request. */
export function requestHeaders(): Headers {
  const request = store.getStore();
  if (!request) throw new Error("requestHeaders() called outside a request");
  return request.headers;
}
