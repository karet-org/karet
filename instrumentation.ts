// Next.js instrumentation hook: runs once at server start to assert every
// required env var is set, so the Web service fails fast with a clear error.
//
// Deliberately no database work here. Next compiles this file for the Edge
// runtime as well as Node, and Edge cannot bundle `pg`, so schema migrations and
// the bootstrap admin live in scripts/db-setup.mjs, which runs before the server.

import { assertRequiredEnvVars } from "./lib/config/required-env";

export async function register(): Promise<void> {
  // Node runtime only; the Edge runtime and browser never read these vars.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertRequiredEnvVars();
  }
}
