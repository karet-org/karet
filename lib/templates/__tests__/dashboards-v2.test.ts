import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { validateDashboardV2, templateV2 } from "@/lib/types/dashboard-v2";

describe("template dashboards", () => {
  it("every shipped dashboard YAML validates as v2", () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const [path, body] of Object.entries(template.rawFiles ?? {})) {
        if (!path.endsWith(".yaml")) continue;
        const result = validateDashboardV2(body);
        expect(result.ok, `${path}: ${!result.ok ? result.errors.join("; ") : ""}`).toBe(true);
      }
    }
  });

  it("the new-draft template validates except for empty panels", () => {
    const result = validateDashboardV2(templateV2("my-dash"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(['"panels" must be a non-empty list']);
    }
  });
});
