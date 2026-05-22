// Required-env validation for the Web service.
//
// The Web service expects the same S3/pipeline env vars as the Worker so
// both sides of the platform read identical configuration (Requirements
// 10.2, 10.4). On Next.js server start we run `assertRequiredEnvVars` from
// `instrumentation.ts` and throw a descriptive error when any are missing,
// preventing the app from silently running with incomplete configuration.

/**
 * Env vars the Web service cannot start without. Matches the Worker's
 * `REQUIRED_ENV_VARS` list so both services share the same contract.
 *
 * `PORT` and `HOSTNAME` are intentionally excluded -- Next.js assigns
 * defaults when they are unset.
 */
export const REQUIRED_ENV_VARS = [
  "S3_BUCKET",
  "S3_ENDPOINT",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "KARET_SESSION_SECRET",
] as const;

/** Minimal environment shape the check reads from. Parameterizing lets tests
 * inject a fixture without mutating `process.env`. */
type EnvSource = Record<string, string | undefined>;

/**
 * Return every required env var that is unset or set to an empty string,
 * preserving the order of `REQUIRED_ENV_VARS`.
 */
export function missingRequiredEnvVars(
  env: EnvSource = process.env,
  required: readonly string[] = REQUIRED_ENV_VARS,
): string[] {
  return required.filter((name) => {
    const value = env[name];
    return value === undefined || value.length === 0;
  });
}

/**
 * Throw with a descriptive message when any required env var is missing.
 *
 * Called at Web server startup from `instrumentation.ts`. When running in the
 * Edge runtime or browser this is a no-op -- env-var assertions only make
 * sense in Node.js where the app actually reads `process.env` to talk to S3.
 */
export function assertRequiredEnvVars(
  env: EnvSource = process.env,
  required: readonly string[] = REQUIRED_ENV_VARS,
): void {
  const missing = missingRequiredEnvVars(env, required);
  if (missing.length === 0) return;
  throw new Error(
    `karet: missing required environment variable(s): ${missing.join(", ")}. ` +
      `Set them before starting the server (see docker-compose.yaml).`,
  );
}
