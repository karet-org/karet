// The API: every route under /api, behind the login wall. Used by the
// production server (server/index.ts) and by the dev server through Vite.

import { Hono } from "hono";
import { gate } from "./auth-gate";
import { METHODS, ROUTES } from "./routes";
import { runWithRequest } from "@/lib/http/request-context";
import { assertRequiredEnvVars } from "@/lib/config/required-env";

assertRequiredEnvVars();

const app = new Hono();

app.use("/api/*", async (c, next) => {
  const refused = gate(c.req.raw);
  if (refused) return refused;
  await next();
});

for (const route of ROUTES) {
  for (const method of METHODS) {
    const handler = route.module[method];
    if (!handler) continue;
    app.on(method, route.path, (c) => {
      const params: Record<string, string> = { ...c.req.param() };
      if (route.rest) params[route.rest] = c.req.path.slice(route.path.length - 1);
      return runWithRequest(c.req.raw, () => handler(c.req.raw, { params: Promise.resolve(params) }));
    });
  }
}

app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
