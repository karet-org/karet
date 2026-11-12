import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx", "**/*.property.test.ts"],
    // Playwright end-to-end tests live in `tests-e2e/` and use the
    // `.spec.ts` suffix. Exclude them from Vitest so `npm test` stays
    // fast and doesn't try to load `@playwright/test` into jsdom.
    exclude: ["node_modules/**", "dist/**", "tests-e2e/**"],
  },
  // The automatic JSX runtime, as the app build uses.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
