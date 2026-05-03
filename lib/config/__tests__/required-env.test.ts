import { describe, it, expect } from "vitest";
import {
  REQUIRED_ENV_VARS,
  assertRequiredEnvVars,
  missingRequiredEnvVars,
} from "../required-env";

/**
 * Helper: build an env object where every required var is present and
 * non-empty. Tests then delete / blank out specific entries to simulate
 * misconfiguration.
 */
function completeEnv(): Record<string, string> {
  return Object.fromEntries(REQUIRED_ENV_VARS.map((name) => [name, "present"]));
}

describe("required-env", () => {
  it("missingRequiredEnvVars returns [] when every var is non-empty", () => {
    expect(missingRequiredEnvVars(completeEnv())).toEqual([]);
  });

  it("missingRequiredEnvVars lists undefined vars in declared order", () => {
    const env = completeEnv();
    delete env.S3_BUCKET;
    delete env.AWS_REGION;
    expect(missingRequiredEnvVars(env)).toEqual(["S3_BUCKET", "AWS_REGION"]);
  });

  it("missingRequiredEnvVars treats empty string as missing", () => {
    const env = completeEnv();
    env.S3_BUCKET = "";
    expect(missingRequiredEnvVars(env)).toEqual(["S3_BUCKET"]);
  });

  it("assertRequiredEnvVars is a no-op when every var is set", () => {
    expect(() => assertRequiredEnvVars(completeEnv())).not.toThrow();
  });

  it("assertRequiredEnvVars throws naming every missing var", () => {
    const env = completeEnv();
    delete env.S3_ENDPOINT;
    delete env.AWS_SECRET_ACCESS_KEY;
    expect(() => assertRequiredEnvVars(env)).toThrow(/S3_ENDPOINT/);
    expect(() => assertRequiredEnvVars(env)).toThrow(/AWS_SECRET_ACCESS_KEY/);
  });

  it("assertRequiredEnvVars message is descriptive", () => {
    const env = completeEnv();
    delete env.S3_BUCKET;
    let thrown: unknown;
    try {
      assertRequiredEnvVars(env);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("karet-web");
    expect(message).toContain("S3_BUCKET");
    expect(message).toContain("docker-compose.yaml");
  });
});
