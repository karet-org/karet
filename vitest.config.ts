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
    exclude: ["node_modules/**", ".next/**", "tests-e2e/**"],
  },
  // The Next.js tsconfig has `"jsx": "preserve"` because Next performs the
  // final JSX transform in its own pipeline. Vitest/Vite use Oxc to parse
  // and transform source; we must opt into a runtime JSX transform here so
  // JSX in .tsx files doesn't pass through unchanged.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
