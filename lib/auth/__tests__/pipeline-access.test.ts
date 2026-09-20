// Per-pipeline access resolution.
//
// These rules decide who can read your finance data, so they are pure functions
// with the reasoning pinned in tests rather than logic spread through routes.

import { describe, expect, it } from "vitest";
import { resolveEffectiveRole } from "../pipeline-access";
import { pipelineFromPath } from "../policy";

const viewer = { role: "viewer" as const, service: false };
const editor = { role: "editor" as const, service: false };
const admin = { role: "admin" as const, service: false };
const service = { role: "admin" as const, service: true };

describe("resolveEffectiveRole", () => {
  it("falls back to the instance role on an ordinary pipeline", () => {
    const open = { visibility: "instance" as const, memberRole: null };
    expect(resolveEffectiveRole(viewer, open)).toBe("viewer");
    expect(resolveEffectiveRole(editor, open)).toBe("editor");
  });

  it("lets a grant widen: a viewer who edits one pipeline", () => {
    expect(
      resolveEffectiveRole(viewer, { visibility: "instance", memberRole: "editor" }),
    ).toBe("editor");
  });

  it("lets a grant narrow: an editor who may only read this one", () => {
    // The reason this feature exists. A grant is the more specific statement, so
    // it wins over the instance role in both directions.
    expect(
      resolveEffectiveRole(editor, { visibility: "instance", memberRole: "viewer" }),
    ).toBe("viewer");
  });

  it("hides a members-only pipeline from non-members entirely", () => {
    const closed = { visibility: "members" as const, memberRole: null };
    expect(resolveEffectiveRole(viewer, closed)).toBeNull();
    expect(resolveEffectiveRole(editor, closed)).toBeNull();
  });

  it("admits members of a members-only pipeline at their granted role", () => {
    expect(
      resolveEffectiveRole(viewer, { visibility: "members", memberRole: "editor" }),
    ).toBe("editor");
    expect(
      resolveEffectiveRole(editor, { visibility: "members", memberRole: "viewer" }),
    ).toBe("viewer");
  });

  it("keeps instance admins admin everywhere", () => {
    // An access list that can lock the operator out of a pipeline is a way to
    // lose a pipeline.
    expect(resolveEffectiveRole(admin, { visibility: "members", memberRole: null })).toBe("admin");
    expect(resolveEffectiveRole(admin, { visibility: "members", memberRole: "viewer" })).toBe(
      "admin",
    );
  });

  it("treats the service token as admin, since nothing grants it membership", () => {
    expect(resolveEffectiveRole(service, { visibility: "members", memberRole: null })).toBe("admin");
  });
});

describe("pipelineFromPath", () => {
  it("finds the slug on pipeline-scoped routes", () => {
    expect(pipelineFromPath("/api/p/p-abc123/config")).toBe("p-abc123");
    expect(pipelineFromPath("/api/p/p-abc123/tables/requests/versions")).toBe("p-abc123");
    expect(pipelineFromPath("/api/p/p-abc123")).toBe("p-abc123");
  });

  it("returns null for instance-wide routes", () => {
    expect(pipelineFromPath("/api/pipelines")).toBeNull();
    expect(pipelineFromPath("/api/settings")).toBeNull();
    expect(pipelineFromPath("/api/lake")).toBeNull();
    // `/api/pipelines/<slug>` is instance-level on purpose: creating, deleting
    // and renaming are decisions about the instance's pipelines, not within one.
    expect(pipelineFromPath("/api/pipelines/p-abc123")).toBeNull();
  });

  it("decodes an escaped slug rather than comparing raw bytes", () => {
    expect(pipelineFromPath("/api/p/a%2Fb/config")).toBe("a/b");
  });
});
