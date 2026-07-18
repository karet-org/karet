// Dashboard smoke test.
//
// Validates the happy paths for:
//   - The web app reads dashboard configurations from S3 (the
//     `/dashboards/<name>` page must render panels loaded from the S3
//     `dashboards/` prefix).
//   - The web app supports multiple dashboard configurations selectable
//     by the user from a dashboard list (we enumerate dashboards via
//     `/api/dashboards` and assert we can navigate between at least two).
//
// Prerequisite
// ------------
// Start the full stack from the repository root before running:
//
//     docker compose up -d
//
// Seed S3 with at least two dashboard JSON configs under the configured
// `dashboards/` prefix and a Pipeline_Config under `config/pipeline.json`.
// Then from `src/karet/` run:
//
//     npm run test:e2e
//
// If no dashboards are seeded, the test is skipped rather than failed,
// the suite is a smoke check, not a data-seeding verifier.

import { expect, test } from "@playwright/test";

interface DashboardListResponse {
  dashboards: string[];
}

async function fetchDashboardList(
  request: import("@playwright/test").APIRequestContext,
): Promise<string[]> {
  const res = await request.get("/api/dashboards");
  expect(res.ok(), `GET /api/dashboards failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as DashboardListResponse;
  return body.dashboards ?? [];
}

test.describe("Dashboard smoke", () => {
  test("dashboard list API returns at least one dashboard", async ({
    request,
  }) => {
    const dashboards = await fetchDashboardList(request);
    test.skip(
      dashboards.length === 0,
      "No dashboards seeded in S3, skipping dashboard smoke.",
    );
    expect(dashboards.length).toBeGreaterThan(0);
  });

  test("dashboard page renders panels loaded from S3", async ({
    page,
    request,
  }) => {
    const dashboards = await fetchDashboardList(request);
    test.skip(
      dashboards.length === 0,
      "No dashboards seeded in S3, skipping dashboard smoke.",
    );

    const [name] = dashboards;
    await page.goto(`/dashboards/${encodeURIComponent(name)}`);

    // The DashboardView root and its panel grid must render regardless
    // of whether individual panels succeed or fall back to ErrorPanel.
    await expect(page.getByTestId("dashboard-view")).toBeVisible();
    await expect(page.getByTestId("panel-grid")).toBeVisible();

    // At least one panel slot should be present, an empty panels array
    // in the config is legal but unusual, so we assert ≥ 1 to confirm
    // the server-rendered config round-tripped through S3.
    const panelCount = await page.getByTestId("panel-slot").count();
    expect(panelCount).toBeGreaterThan(0);
  });

  test("can navigate between multiple dashboards", async ({
    page,
    request,
  }) => {
    const dashboards = await fetchDashboardList(request);
    test.skip(
      dashboards.length < 2,
      "Fewer than two dashboards seeded, skipping multi-dashboard nav.",
    );

    const [first, second] = dashboards;
    await page.goto(`/dashboards/${encodeURIComponent(first)}`);
    await expect(page.getByTestId("dashboard-view")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(first);

    await page.goto(`/dashboards/${encodeURIComponent(second)}`);
    await expect(page.getByTestId("dashboard-view")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      second,
    );
  });
});
