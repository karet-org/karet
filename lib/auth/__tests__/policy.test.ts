// Authorization: what the policy table demands, and that every route actually
// goes through it.
//
// The coverage test is the important one. Getting a role check right in 21 route
// files is easy; remembering it in the 22nd, six months from now, is not. This
// turns "did I remember" into a failing test.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicRequest, requiredRole } from "../policy";
import { roleAtLeast } from "../roles";

describe("requiredRole", () => {
  it("lets a viewer read", () => {
    expect(requiredRole("GET", "/api/p/demo/tables")).toBe("viewer");
    expect(requiredRole("GET", "/api/p/demo/jobs")).toBe("viewer");
    expect(requiredRole("GET", "/api/pipelines")).toBe("viewer");
  });

  it("treats read-only POSTs as viewer work", () => {
    // Running a SELECT, drawing a dashboard and validating a draft write
    // nothing, so gating them on `editor` would make a viewer account useless.
    expect(requiredRole("POST", "/api/p/demo/query")).toBe("viewer");
    expect(requiredRole("POST", "/api/p/demo/dashboards/traffic/data")).toBe("viewer");
    expect(requiredRole("POST", "/api/p/demo/dashboards/traffic/validate")).toBe("viewer");
    expect(requiredRole("POST", "/api/p/demo/validate")).toBe("viewer");
  });

  it("needs an editor to change pipeline content", () => {
    expect(requiredRole("PUT", "/api/p/demo/config")).toBe("editor");
    expect(requiredRole("PUT", "/api/p/demo/dashboards/traffic")).toBe("editor");
    expect(requiredRole("DELETE", "/api/p/demo/dashboards/traffic")).toBe("editor");
    expect(requiredRole("POST", "/api/p/demo/dashboards/traffic/publish")).toBe("editor");
    expect(requiredRole("POST", "/api/p/demo/queries")).toBe("editor");
    expect(requiredRole("PUT", "/api/lake")).toBe("editor");
    expect(requiredRole("DELETE", "/api/lake")).toBe("editor");
    // Triggering a run costs compute and rewrites the warehouse.
    expect(requiredRole("POST", "/api/p/demo/jobs")).toBe("editor");
    expect(requiredRole("POST", "/api/pipelines")).toBe("editor");
    expect(requiredRole("POST", "/api/pipelines/import")).toBe("editor");
  });

  it("lets a viewer read table versions but only an editor restore one", () => {
    expect(requiredRole("GET", "/api/p/demo/tables/requests/versions")).toBe("viewer");
    expect(requiredRole("POST", "/api/p/demo/tables/requests/versions/3/restore")).toBe("editor");
    expect(requiredRole("GET", "/api/p/demo/config/history")).toBe("viewer");
    expect(requiredRole("GET", "/api/p/demo/config/history/2")).toBe("viewer");
    expect(requiredRole("POST", "/api/p/demo/config/history/2/revert")).toBe("editor");
  });

  it("needs an admin to manage accounts", () => {
    // Including the read: who else works here is not a viewer's business.
    expect(requiredRole("GET", "/api/users")).toBe("admin");
    expect(requiredRole("POST", "/api/users")).toBe("admin");
    expect(requiredRole("GET", "/api/users/erin")).toBe("admin");
    expect(requiredRole("DELETE", "/api/users/erin")).toBe("admin");
  });

  it("needs an admin to delete or rename a pipeline, or change settings", () => {
    expect(requiredRole("DELETE", "/api/pipelines/demo")).toBe("admin");
    expect(requiredRole("PATCH", "/api/pipelines/demo")).toBe("admin");
    expect(requiredRole("PUT", "/api/settings")).toBe("admin");
  });

  it("returns null only for the public auth endpoints", () => {
    expect(requiredRole("POST", "/api/auth/login")).toBeNull();
    expect(requiredRole("POST", "/api/auth/logout")).toBeNull();
    expect(requiredRole("GET", "/api/auth/me")).toBeNull();
    expect(isPublicRequest("POST", "/api/auth/login")).toBe(true);
    // Not public just because it starts with /api/auth.
    expect(isPublicRequest("DELETE", "/api/auth/users")).toBe(false);
  });

  it("demands admin for an unknown API route rather than waving it through", () => {
    expect(requiredRole("POST", "/api/something-new")).toBe("editor");
    expect(requiredRole("PROPFIND", "/api/something-new")).toBe("admin");
  });

  it("lets any signed-in role load a page", () => {
    expect(requiredRole("GET", "/p/demo/graph")).toBe("viewer");
    expect(requiredRole("GET", "/")).toBe("viewer");
  });
});

describe("role ordering", () => {
  it("ranks viewer below editor below admin", () => {
    expect(roleAtLeast("admin", "editor")).toBe(true);
    expect(roleAtLeast("editor", "editor")).toBe(true);
    expect(roleAtLeast("editor", "admin")).toBe(false);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
  });
});

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("every API route is guarded", () => {
  // The auth endpoints are the login wall itself: they must be reachable
  // without a session, and they do their own checking. `[...all]` is
  // better-auth's handler, which owns sign-in, sign-out and session reads.
  const EXEMPT = new Set([
    join("app", "api", "auth", "[...all]", "route.ts"),
    join("app", "api", "auth", "me", "route.ts"),
  ]);

  const files = routeFiles(join("app", "api"));

  it("finds the route files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.filter((f) => !EXEMPT.has(f)))("%s exports through withRole", (file) => {
    const src = readFileSync(file, "utf8");
    const methods = [...src.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)]
      .map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(
        src.includes(`export const ${method} = withRole(`),
        `${file} exports ${method} without withRole`,
      ).toBe(true);
    }
  });
});
