// Dashboard layout regression tests.
//
// At 14 viewport widths from 400 to 1600px, asserts:
//   - no two panel slots horizontally overlap
//   - no panel extends past the viewport
//   - no chart canvas extends past its slot
//   - the grid never has an implicit `auto` track squashed below 18rem
//
// Auth: forge a session cookie via the workspace `.env` so we don't
// need the admin password.

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";

const DASHBOARD_PATH = "/p/spending/dashboards/spending_overview";

/** Mirror of `lib/auth/session.ts#signSession` using Node `crypto`. */
function signSession(secret: string, ttlSeconds = 3600): { value: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt }));
  const sig = createHmac("sha256", secret).update(payload).digest();
  const b64url = (b: Buffer) =>
    b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { value: `${b64url(payload)}.${b64url(sig)}`, expiresAt };
}

function loadSessionSecret(): string {
  // playwright cwd is src/karet; .env lives at the workspace root.
  const candidates = [
    resolve(process.cwd(), "..", "..", ".env"),
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), ".env"),
  ];
  for (const p of candidates) {
    try {
      const m = readFileSync(p, "utf-8").match(/^KARET_SESSION_SECRET=(.+)$/m);
      if (m) return m[1].trim();
    } catch {
      // try next
    }
  }
  throw new Error("KARET_SESSION_SECRET not found in any .env candidate.");
}

const VIEWPORT_WIDTHS = [
  1600, 1440, 1200, 1100, 1000, 950, 900, 850, 800, 750, 700, 600, 500, 400,
] as const;

const AUTO_FIT_MIN_PX = 288; // 18rem
const SQUASH_TOLERANCE_PX = 8;

test.describe("Spending dashboard layout: no panel overlap at narrow widths", () => {
  test.beforeEach(async ({ context }) => {
    const { value, expiresAt } = signSession(loadSessionSecret());
    await context.addCookies([
      {
        name: "karet_session",
        value,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        expires: expiresAt,
      },
    ]);
  });

  for (const width of VIEWPORT_WIDTHS) {
    test(`no overlap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(DASHBOARD_PATH, { waitUntil: "domcontentloaded" });
      await page.getByTestId("dashboard-view").waitFor({ state: "visible" });
      // Chart.js sizes its canvas after a layout pass; let it settle.
      await page.waitForTimeout(500);

      const panels = await page.getByTestId("panel-slot").evaluateAll((slots) =>
        slots.map((s) => {
          const r = s.getBoundingClientRect();
          return {
            title: s.getAttribute("data-panel-title") ?? "(unknown)",
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        }),
      );

      const gridTracks = await page.evaluate(() => {
        const grid = document.querySelector('[data-testid="panel-grid"]');
        if (!grid) return null;
        return getComputedStyle(grid)
          .gridTemplateColumns.split(" ")
          .map((t) => parseFloat(t))
          .filter((n) => !Number.isNaN(n));
      });

      const canvases = await page
        .locator('[data-testid="panel-slot"] canvas')
        .evaluateAll((els) =>
          els.map((c) => {
            const slot = c.closest('[data-testid="panel-slot"]') as HTMLElement | null;
            const cr = c.getBoundingClientRect();
            const sr = slot?.getBoundingClientRect();
            return {
              title: slot?.getAttribute("data-panel-title") ?? "(unknown)",
              canvas: { left: cr.left, right: cr.right, width: cr.width },
              slot: sr ? { left: sr.left, right: sr.right, width: sr.width } : null,
            };
          }),
        );

      // Screenshot for human review on failure.
      await page.screenshot({
        path: `test-results/layout-${width}.png`,
        fullPage: true,
      });

      const failures: string[] = [];

      // Pairwise panel overlap (1px tolerance for sub-pixel rounding).
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const a = panels[i];
          const b = panels[j];
          const xOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const yOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (xOverlap > 1 && yOverlap > 1) {
            failures.push(
              `"${a.title}" overlaps "${b.title}" by ${xOverlap.toFixed(1)}×${yOverlap.toFixed(1)}px`,
            );
          }
        }
      }

      // Panel extending past viewport.
      for (const p of panels) {
        if (p.right > width + 1) {
          failures.push(
            `"${p.title}" extends to x=${p.right.toFixed(0)} (viewport ${width})`,
          );
        }
      }

      // Canvas wider than its slot.
      for (const c of canvases) {
        if (!c.slot) continue;
        if (c.canvas.left < c.slot.left - 1 || c.canvas.right > c.slot.right + 1) {
          failures.push(
            `canvas in "${c.title}" (w=${c.canvas.width.toFixed(0)}) ` +
              `exceeds slot bounds (w=${c.slot.width.toFixed(0)})`,
          );
        }
      }

      // Implicit-column squash: any track narrower than the auto-fit
      // minimum when there are multiple tracks. A single track of any
      // width is the legitimate 1-column layout.
      if (gridTracks && gridTracks.length > 1) {
        for (const t of gridTracks) {
          if (t < AUTO_FIT_MIN_PX - SQUASH_TOLERANCE_PX) {
            failures.push(
              `grid track width ${t.toFixed(0)}px < auto-fit min 288px ` +
                `(tracks: ${gridTracks.map((x) => x.toFixed(0)).join(", ")})`,
            );
            break;
          }
        }
      }

      expect(
        failures,
        `Layout failures at ${width}px:\n  ${failures.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});
