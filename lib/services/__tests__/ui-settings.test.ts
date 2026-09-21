import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "@/lib/services/ui-settings";

describe("sanitizeSettings", () => {
  it("passes through a valid document", () => {
    expect(
      sanitizeSettings({
        workspaceName: "home",
        starred: ["finance", "fitness"],
      }),
    ).toEqual({
      workspaceName: "home",
      starred: ["finance", "fitness"],
    });
  });

  it("defaults missing or wrong-typed fields", () => {
    expect(sanitizeSettings(null)).toEqual({
      workspaceName: "",
      starred: [],
    });
    expect(sanitizeSettings({ workspaceName: 42, starred: "finance" })).toEqual({
      workspaceName: "",
      starred: [],
    });
  });

  it("trims, caps length, dedupes, and drops invalid slugs", () => {
    const out = sanitizeSettings({
      workspaceName: `  ${"x".repeat(80)}  `,
      starred: ["finance", "finance", "Bad Slug", "../evil", "ok-2"],
    });
    expect(out.workspaceName).toHaveLength(64);
    expect(out.starred).toEqual(["finance", "ok-2"]);
  });
});
