import { describe, expect, it } from "vitest";
import { ROUTES, routePath } from "../routes";
import { gate } from "../auth-gate";

describe("routePath", () => {
  it("turns folders into a Hono path", () => {
    expect(routePath("./api/p/[pipeline]/tables/[table]/rows/route.ts")).toEqual({
      path: "/api/p/:pipeline/tables/:table/rows",
      rest: null,
    });
    expect(routePath("./api/auth/[...all]/route.ts")).toEqual({ path: "/api/auth/*", rest: "all" });
  });
});

describe("ROUTES", () => {
  const paths = ROUTES.map((r) => r.path);

  it("has every route file", () => {
    expect(paths).toContain("/api/p/:pipeline/search/fields");
    expect(paths).toContain("/api/pipelines/overview");
    expect(paths.length).toBeGreaterThan(30);
  });

  it("puts a fixed segment before a parameter in the same place", () => {
    expect(paths.indexOf("/api/pipelines/import")).toBeLessThan(paths.indexOf("/api/pipelines/:slug"));
    expect(paths.indexOf("/api/pipelines/overview")).toBeLessThan(paths.indexOf("/api/pipelines/:slug"));
  });
});

describe("gate", () => {
  const req = (path: string, headers: Record<string, string> = {}) =>
    new Request(`http://karet.test${path}`, { headers });

  it("lets the login page and the auth API through", () => {
    expect(gate(req("/login"))).toBeNull();
    expect(gate(req("/api/auth/sign-in/username"))).toBeNull();
  });

  it("answers the API with 401 and pages with a redirect to login", async () => {
    const api = gate(req("/api/pipelines"))!;
    expect(api.status).toBe(401);
    expect(await api.json()).toMatchObject({ error: "unauthorized" });
    const page = gate(req("/p/demo/data?x=1"))!;
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://karet.test/login?next=%2Fp%2Fdemo%2Fdata%3Fx%3D1");
  });

  it("lets a request with a session cookie through", () => {
    expect(gate(req("/p/demo/data", { cookie: "better-auth.session_token=abc" }))).toBeNull();
  });
});
