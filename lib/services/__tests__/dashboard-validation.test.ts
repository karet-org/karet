import { describe, expect, it } from "vitest";
import { validateDashboardConfig } from "@/lib/services/dashboard-validation";

const valid = {
  id: "spending-overview",
  name: "Spending overview",
  analytic_table_id: "transactions",
  filters: [{ kind: "date_range", column: "date" }],
  panels: [
    { kind: "bar", title: "Monthly spend", x: "month", value: "amount" },
    { kind: "doughnut", title: "By category", label: "category", value: "amount" },
  ],
};

describe("validateDashboardConfig", () => {
  it("accepts a valid config and counts panels", () => {
    const r = validateDashboardConfig(valid);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.panelCount).toBe(2);
  });

  it("rejects non-objects", () => {
    for (const bad of [null, [], "x", 42]) {
      expect(validateDashboardConfig(bad).ok).toBe(false);
    }
  });

  it("requires a slug id, a name, and at least one panel", () => {
    const r = validateDashboardConfig({ id: "Bad Id", name: "", panels: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/id/);
      expect(r.errors.join("\n")).toMatch(/name/);
      expect(r.errors.join("\n")).toMatch(/panels/);
    }
  });

  it("flags unknown panel kinds and filter kinds", () => {
    const r = validateDashboardConfig({
      ...valid,
      panels: [{ kind: "pie", title: "x" }],
      filters: [{ kind: "slider", column: "amount" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toMatch(/pie/);
      expect(r.errors.join("\n")).toMatch(/slider/);
    }
  });
});
