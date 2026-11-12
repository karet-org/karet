// Production server: the API, the built pages from dist/client, and index.html
// for every other path, which the page router then reads.

import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import api from "./app";
import { gate } from "./auth-gate";

const CLIENT_DIR = "./dist/client";
const indexHtml = readFileSync(`${CLIENT_DIR}/index.html`, "utf8");

const app = new Hono();
// Server-sent events must reach the browser as they are written, so they are
// not compressed.
app.use("*", async (c, next) => (c.req.path.endsWith("/events") ? next() : compress()(c, next)));
app.route("/", api);

// Built files have a content hash in their name, so they can be cached for good.
app.use("/assets/*", async (c, next) => {
  await next();
  if (c.res.ok) c.header("Cache-Control", "public, max-age=31536000, immutable");
});
const files = serveStatic({ root: CLIENT_DIR, index: "" });
app.use("/*", (c, next) => (c.req.path === "/" ? next() : files(c, next)));
app.all("/assets/*", (c) => c.notFound());

app.get("*", (c) => {
  const refused = gate(c.req.raw);
  if (refused) return refused;
  return c.html(indexHtml, 200, { "Cache-Control": "no-cache" });
});

const port = Number(process.env.PORT) || 3000;
// HOSTNAME is not used: Docker sets it to the container name.
const hostname = process.env.HOST || "0.0.0.0";
serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`karet web listening on http://${hostname}:${port}`);
});
