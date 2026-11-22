// Deleting a pipeline drops its lake tables through the worker first, and
// deletes nothing else when the worker refuses, so a pipeline is never left
// half deleted with its rows still readable.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: string[] = [];
const deleted: string[] = [];

vi.mock("@/lib/auth/guard", () => ({
  withRole: (handler: (r: Request, c: unknown, p: unknown) => Promise<Response>) => (r: Request, c: unknown) =>
    handler(r, c, { kind: "service" }),
}));
vi.mock("@/lib/config/s3-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/s3-client")>();
  return {
    ...actual,
    createS3Client: () => ({
      send: async (command: { constructor: { name: string } }) => {
        sent.push(command.constructor.name);
        return {};
      },
    }),
  };
});
vi.mock("@/lib/services/s3-helpers", () => ({ listAllObjectKeys: async () => ["pipelines/p-1/dashboards/a.yaml"] }));
vi.mock("@/lib/services/pipeline-store", () => ({
  deletePipeline: async (slug: string) => void deleted.push(slug),
  pipelineExists: async () => true,
  getLiveConfig: async () => null,
  renamePipeline: async () => undefined,
}));

const { DELETE } = await import("@/server/api/pipelines/[slug]/route");

function call() {
  return DELETE(new Request("http://x/api/pipelines/p-1", { method: "DELETE" }), {
    params: Promise.resolve({ slug: "p-1" }),
  });
}

beforeEach(() => {
  sent.length = 0;
  deleted.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("DELETE /api/pipelines/[slug]", () => {
  it("drops the lake tables, then deletes the objects and the registry row", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await call();
    expect(res.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/pipelines\/drop$/);
    expect(JSON.parse(String(init.body))).toEqual({ pipeline: "p-1" });
    expect(sent).toContain("DeleteObjectsCommand");
    expect(deleted).toEqual(["p-1"]);
  });

  it("deletes nothing while the pipeline is running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { kind: "pipeline_busy", message: "running" } }, { status: 409 })),
    );
    const res = await call();
    expect(res.status).toBe(409);
    expect(sent).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("deletes nothing when the worker cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const res = await call();
    expect(res.status).toBe(502);
    expect(sent).toEqual([]);
    expect(deleted).toEqual([]);
  });
});
