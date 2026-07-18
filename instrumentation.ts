// Next.js instrumentation hook, runs once at server start before any
// request is served. See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// We use it to assert every required S3/pipeline env var is set so the
// Web service fails fast with a descriptive error instead of silently
// starting with incomplete configuration.
//
// The check runs in the Node.js runtime only; the Edge runtime and the
// browser don't read `process.env` to talk to S3, so there's nothing to
// assert there.

import { assertRequiredEnvVars } from "./lib/config/required-env";

export async function register(): Promise<void> {
  // `process.env.NEXT_RUNTIME` is set by Next.js to `"nodejs"` or `"edge"`.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertRequiredEnvVars();
  }
}
