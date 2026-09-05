import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "@/lib/services/ui-settings";

describe("sanitizeSettings", () => {
  it("passes through a valid document", () => {
    expect(
      sanitizeSettings({
        displayName: "Joey Shi",
        workspaceName: "home",
        starred: ["finance", "fitness"],
      }),
    ).toEqual({
      displayName: "Joey Shi",
      workspaceName: "home",
      starred: ["finance", "fitness"],
    });
  });

  it("defaults missing or wrong-typed fields", () => {
    expect(sanitizeSettings(null)).toEqual({
      displayName: "",
      workspaceName: "",
      starred: [],
    });
    expect(sanitizeSettings({ displayName: 42, starred: "finance" })).toEqual({
      displayName: "",
      workspaceName: "",
      starred: [],
    });
  });

  it("trims, caps length, dedupes, and drops invalid slugs", () => {
    const out = sanitizeSettings({
      displayName: `  ${"x".repeat(80)}  `,
      starred: ["finance", "finance", "Bad Slug", "../evil", "ok-2"],
    });
    expect(out.displayName).toHaveLength(64);
    expect(out.starred).toEqual(["finance", "ok-2"]);
  });
});
