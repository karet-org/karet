// Pages: a React app built from index.html into dist/client.
// API: server/app.ts. In development the Vite server passes /api/* to it; for
// production, `vite build --ssr server/index.ts` bundles the server into
// dist/server, with node_modules left as imports (DuckDB is a native addon).

import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";
import nodeAdapter from "@hono/vite-dev-server/node";

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    react(),
    devServer({
      entry: "server/app.ts",
      adapter: nodeAdapter,
      // Everything but the API is the page app, which Vite serves.
      exclude: [/^(?!\/api\/).*/],
      injectClientScript: false,
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
  server: { port: 3000, host: "0.0.0.0" },
  build: isSsrBuild
    ? { outDir: "dist/server", copyPublicDir: false, emptyOutDir: true }
    : {
        outDir: "dist/client",
        emptyOutDir: true,
        // Kept so browser devtools show the original source of an error.
        sourcemap: true,
      },
}));
