// Required-env validation, run from `instrumentation.ts` at server start so the
// app fails fast instead of running with incomplete configuration.

/**
 * Env vars the Web service cannot start without; matches the Worker's
 * `REQUIRED_ENV_VARS` so both services share one contract. `PORT`/`HOSTNAME`
 * are excluded — Next.js defaults them.
 */
export const REQUIRED_ENV_VARS = [
  "S3_BUCKET_PIPELINES",
  "S3_BUCKET_LAKE",
  "S3_BUCKET_WAREHOUSE",
  "AWS_ENDPOINT_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "KARET_SESSION_SECRET",
  "KARET_WORKER_TOKEN",
  "KARET_ADMIN_PASSWORD_HASH",
  "REDIS_URL",
] as const;

/** Parameterized so tests can inject a fixture without mutating `process.env`. */
type EnvSource = Record<string, string | undefined>;

/** Required env vars that are unset or empty, in `REQUIRED_ENV_VARS` order. */
export function missingRequiredEnvVars(
  env: EnvSource = process.env,
  required: readonly string[] = REQUIRED_ENV_VARS,
): string[] {
  return required.filter((name) => {
    const value = env[name];
    return value === undefined || value.length === 0;
  });
}

/** Throw with a descriptive message when any required env var is missing. */
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
