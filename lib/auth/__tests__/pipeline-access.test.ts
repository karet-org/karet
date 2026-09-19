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
    const open = { visibility: "instance" as const, memberRole: null, isOwner: false };
    expect(resolveEffectiveRole(viewer, open)).toBe("viewer");
    expect(resolveEffectiveRole(editor, open)).toBe("editor");
  });

  it("lets a grant widen: a viewer who edits one pipeline", () => {
    expect(
      resolveEffectiveRole(viewer, { visibility: "instance", memberRole: "editor", isOwner: false }),
    ).toBe("editor");
  });

  it("lets a grant narrow: an editor who may only read this one", () => {
    // The reason this feature exists. A grant is the more specific statement, so
    // it wins over the instance role in both directions.
    expect(
      resolveEffectiveRole(editor, { visibility: "instance", memberRole: "viewer", isOwner: false }),
    ).toBe("viewer");
  });

  it("hides a members-only pipeline from non-members entirely", () => {
    const closed = { visibility: "members" as const, memberRole: null, isOwner: false };
    expect(resolveEffectiveRole(viewer, closed)).toBeNull();
    expect(resolveEffectiveRole(editor, closed)).toBeNull();
  });

  it("admits members of a members-only pipeline at their granted role", () => {
    expect(
      resolveEffectiveRole(viewer, { visibility: "members", memberRole: "editor", isOwner: false }),
    ).toBe("editor");
    expect(
      resolveEffectiveRole(editor, { visibility: "members", memberRole: "viewer", isOwner: false }),
    ).toBe("viewer");
  });

  it("keeps instance admins admin everywhere", () => {
    // An access list that can lock the operator out of a pipeline is a way to
    // lose a pipeline.
    expect(resolveEffectiveRole(admin, { visibility: "members", memberRole: null, isOwner: false })).toBe("admin");
    expect(resolveEffectiveRole(admin, { visibility: "members", memberRole: "viewer", isOwner: false })).toBe(
      "admin",
    );
  });

  it("keeps the owner admin on their own pipeline, whatever the list says", () => {
    // Their access is read from `owner_id`, so it cannot be revoked or narrowed
    // by an edit to the member list, including their own. Handing the pipeline to
    // somebody else is the way it ends.
    const mine = { visibility: "members" as const, isOwner: true };
    expect(resolveEffectiveRole(viewer, { ...mine, memberRole: null })).toBe("admin");
    expect(resolveEffectiveRole(editor, { ...mine, memberRole: "viewer" })).toBe("admin");
    expect(
      resolveEffectiveRole(viewer, { visibility: "instance", memberRole: null, isOwner: true }),
    ).toBe("admin");
  });

  it("treats the service token as admin, since nothing grants it membership", () => {
    expect(resolveEffectiveRole(service, { visibility: "members", memberRole: null, isOwner: false })).toBe("admin");
  });
});

describe("pipelineFromPath", () => {
  it("finds the slug on pipeline-scoped routes", () => {
    expect(pipelineFromPath("/api/p/p-abc123/config")).toBe("p-abc123");
    expect(pipelineFromPath("/api/p/p-abc123/tables/requests/versions")).toBe("p-abc123");
    expect(pipelineFromPath("/api/p/p-abc123")).toBe("p-abc123");
  });

  it("finds the slug on the registry routes too", () => {
    // Renaming and deleting used to resolve instance-wide, on the reading that
    // they are decisions about the instance's pipelines rather than within one.
    // Members-only-by-default retired that: every pipeline now has a creator who
    // is admin on it and an editor elsewhere, and "admin here but may not rename
    // it" is not a distinction anyone can hold in their head.
    expect(pipelineFromPath("/api/pipelines/p-abc123")).toBe("p-abc123");
  });

  it("returns null for instance-wide routes", () => {
    expect(pipelineFromPath("/api/pipelines")).toBeNull();
    expect(pipelineFromPath("/api/settings")).toBeNull();
    expect(pipelineFromPath("/api/lake")).toBeNull();
    // A sibling route under the same prefix, not a pipeline called "import".
    expect(pipelineFromPath("/api/pipelines/import")).toBeNull();
  });

  it("decodes an escaped slug rather than comparing raw bytes", () => {
    expect(pipelineFromPath("/api/p/a%2Fb/config")).toBe("a/b");
  });
});
