// The machine identity: `Authorization: Bearer $KARET_WORKER_TOKEN`.
//
// This is what non-browser callers use (the log shipper, cron). Before accounts
// existed they hand-minted a session cookie, which stops working once claims
// name a user.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serviceTokenPrincipal } from "../service-token";

describe("serviceTokenPrincipal", () => {
  let prior: string | undefined;

  beforeEach(() => {
    prior = process.env.KARET_WORKER_TOKEN;
    process.env.KARET_WORKER_TOKEN = "s3cret-worker-token";
  });
  afterEach(() => {
    if (prior === undefined) delete process.env.KARET_WORKER_TOKEN;
    else process.env.KARET_WORKER_TOKEN = prior;
  });

  it("accepts the configured token", () => {
    expect(serviceTokenPrincipal("Bearer s3cret-worker-token")).toEqual({
      username: "service",
      displayName: "service",
      userId: null,
      role: "admin",
      service: true,
    });
  });

  it("rejects a wrong token, a wrong scheme, and a missing header", () => {
    expect(serviceTokenPrincipal("Bearer wrong")).toBeNull();
    expect(serviceTokenPrincipal("Basic s3cret-worker-token")).toBeNull();
    expect(serviceTokenPrincipal("s3cret-worker-token")).toBeNull();
    expect(serviceTokenPrincipal(null)).toBeNull();
  });

  it("rejects a prefix of the token", () => {
    expect(serviceTokenPrincipal("Bearer s3cret")).toBeNull();
  });

  it("fails closed when no token is configured, so a blank header can't match", () => {
    delete process.env.KARET_WORKER_TOKEN;
    expect(serviceTokenPrincipal("Bearer ")).toBeNull();
    expect(serviceTokenPrincipal("Bearer anything")).toBeNull();
    process.env.KARET_WORKER_TOKEN = "";
    expect(serviceTokenPrincipal("Bearer ")).toBeNull();
  });
});
