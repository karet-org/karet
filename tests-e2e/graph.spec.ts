// Data Flow Graph smoke test.
//
// Validates the happy paths for:
//   - Clicking a node opens the Node Detail Panel.
//   - Clicking Edit in the detail panel opens an inline editor
//     (Save / Cancel footer becomes visible).
//   - The graph supports pan and zoom (React Flow viewport transform
//     changes after wheel-zoom and drag-pan interactions).
//
// Prerequisite
// ------------
// Start the full stack from the repository root before running:
//
//     docker compose up -d
//
// Seed S3 with a valid Pipeline_Config under `config/pipeline.json` that
// contains at least one editable node (Source_Container, Lookup_Mapping,
// or Mapping). Then from `src/karet/` run:
//
//     npm run test:e2e

import { expect, test, type Locator, type Page } from "@playwright/test";

/** Read the `transform` style attribute of the React Flow viewport. */
async function readViewportTransform(page: Page): Promise<string> {
  const viewport = page.locator(".react-flow__viewport");
  await viewport.first().waitFor({ state: "attached" });
  return (
    (await viewport.first().evaluate((el) => el.getAttribute("style"))) ?? ""
  );
}

/** Locate the first editable graph node (source-container, lookup, or mapping). */
async function firstEditableNode(page: Page): Promise<Locator> {
  const selectors = [
    '.react-flow__node[data-node-type="source-container"]',
    '.react-flow__node[data-node-type="lookup-mapping"]',
    '.react-flow__node[data-node-type="mapping"]',
    // Fallback: generic React Flow node by class name.
    ".react-flow__node",
  ];
  for (const sel of selectors) {
    const locator = page.locator(sel).first();
    if ((await locator.count()) > 0) return locator;
  }
  throw new Error("No graph nodes rendered on /graph");
}

test.describe("Data Flow Graph smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/graph");
    // Wait for either the graph page to finish loading or an error to
    // surface. If an error surfaces we skip, the smoke test needs a
    // live backend.
    const graphPage = page.getByTestId("graph-page");
    const errorPanel = page.getByTestId("graph-error");
    await Promise.race([
      graphPage.waitFor({ state: "visible", timeout: 15_000 }),
      errorPanel.waitFor({ state: "visible", timeout: 15_000 }),
    ]);
    const errorVisible = await errorPanel.isVisible().catch(() => false);
    test.skip(
      errorVisible,
      "Graph page surfaced a load error, backend not ready; skipping.",
    );
  });

  test("clicking a node opens the Node Detail Panel", async ({
    page,
  }) => {
    const node = await firstEditableNode(page);
    await node.click();
    await expect(page.getByTestId("node-detail-panel")).toBeVisible();
  });

  test("clicking Edit opens the inline editor", async ({ page }) => {
    const node = await firstEditableNode(page);
    await node.click();

    const panel = page.getByTestId("node-detail-panel");
    await expect(panel).toBeVisible();

    const editButton = page.getByTestId("node-detail-panel-edit");
    // Edit is only rendered for editable node kinds, if the first node
    // we clicked was an analytic-table, fall back to clicking through
    // subsequent nodes until we find an editable one.
    if ((await editButton.count()) === 0) {
      const allNodes = page.locator(".react-flow__node");
      const total = await allNodes.count();
      for (let i = 0; i < total; i++) {
        await allNodes.nth(i).click();
        if ((await editButton.count()) > 0) break;
      }
    }
    await expect(editButton).toBeVisible();
    await editButton.click();

    // In edit mode the panel's Save/Cancel footer is rendered.
    await expect(page.getByTestId("node-detail-panel-cancel")).toBeVisible();
    await expect(page.getByTestId("node-detail-panel-save")).toBeVisible();
  });

  test("pan and zoom change the viewport transform", async ({
    page,
  }) => {
    const before = await readViewportTransform(page);

    // Zoom: dispatch a wheel event on the React Flow pane.
    const pane = page.locator(".react-flow__pane").first();
    await pane.hover();
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(250);

    const afterZoom = await readViewportTransform(page);
    expect(afterZoom).not.toEqual(before);

    // Pan: mouse-down on the pane, drag, release.
    const box = await pane.boundingBox();
    if (!box) throw new Error("Could not measure React Flow pane");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const afterPan = await readViewportTransform(page);
    expect(afterPan).not.toEqual(afterZoom);
  });
});
