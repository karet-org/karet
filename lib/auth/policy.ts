// What role each request needs.
//
// One table, read by `withRole` in the route handler, where the database is
// reachable and a demotion, a deletion or a per-pipeline grant can be seen.
// Middleware only checks that a session cookie exists.
//
// Edge-safe: no Node built-ins, no S3.

import { type Role } from "./roles";

/** Requests that need no session at all. */
const PUBLIC = [
  { method: "POST", path: /^\/api\/auth\/(login|logout)$/ },
  { method: "GET", path: /^\/api\/auth\/me$/ },
];

interface Rule {
  /** Methods this rule covers. */
  methods: string[];
  path: RegExp;
  role: Role;
}

/**
 * First match wins, so put the narrow rules first. Anything unmatched falls
 * through to the default at the bottom of `requiredRole`, which is the
 * strictest sensible reading of an unknown route.
 */
const RULES: Rule[] = [
  // Reads that happen to be POSTs: running a SELECT, previewing a dashboard,
  // validating a draft. These write nothing, so a viewer may do them.
  { methods: ["POST"], path: /^\/api\/p\/[^/]+\/query$/, role: "viewer" },
  { methods: ["POST"], path: /^\/api\/p\/[^/]+\/dashboards\/[^/]+\/data$/, role: "viewer" },
  { methods: ["POST"], path: /^\/api\/p\/[^/]+\/dashboards\/[^/]+\/validate$/, role: "viewer" },
  { methods: ["POST"], path: /^\/api\/p\/[^/]+\/validate$/, role: "viewer" },

  // Who may use a pipeline is an admin decision about that pipeline: an editor
  // can change what it does, not who else can.
  { methods: ["GET"], path: /^\/api\/p\/[^/]+\/members$/, role: "admin" },
  { methods: ["PUT", "DELETE"], path: /^\/api\/p\/[^/]+\/members$/, role: "admin" },

  // Deleting or renaming a whole pipeline, and instance-wide settings.
  { methods: ["DELETE", "PATCH"], path: /^\/api\/pipelines\/[^/]+$/, role: "admin" },
  { methods: ["PUT", "POST", "DELETE"], path: /^\/api\/settings$/, role: "admin" },

  // Accounts. Reading the list is an admin matter too: who else works here is
  // not a viewer's business, and the list is only used by the admin screen.
  { methods: ["GET", "POST"], path: /^\/api\/users$/, role: "admin" },
  { methods: ["GET", "PATCH", "DELETE"], path: /^\/api\/users\/[^/]+$/, role: "admin" },

  // Creating and importing pipelines.
  { methods: ["POST"], path: /^\/api\/pipelines(\/import)?$/, role: "editor" },

  // Everything else that changes state: configs, dashboards, saved queries,
  // lake objects, triggering runs.
  { methods: ["POST", "PUT", "PATCH", "DELETE"], path: /^\/api\//, role: "editor" },

  // Reads.
  { methods: ["GET", "HEAD"], path: /^\/api\//, role: "viewer" },
];

export function isPublicRequest(method: string, pathname: string): boolean {
  return PUBLIC.some((p) => p.method === method && p.path.test(pathname));
}

/**
 * The role a request needs, or null when it is public. Non-API paths are pages,
 * which every signed-in role may load; the API calls they make are what carry
 * the privilege.
 */
export function requiredRole(method: string, pathname: string): Role | null {
  if (isPublicRequest(method, pathname)) return null;
  if (!pathname.startsWith("/api/")) return "viewer";
  for (const rule of RULES) {
    if (rule.methods.includes(method) && rule.path.test(pathname)) return rule.role;
  }
  // Unknown API route with an unusual method: demand the most privilege rather
  // than waving it through.
  return "admin";
}

/**
 * The pipeline a request addresses, or null for instance-wide routes.
 *
 * Here rather than in the guard so it stays a pure function of the path, with no
 * database or auth instance behind it.
 *
 * Two prefixes name one pipeline: `/api/p/<slug>/…` for everything inside it, and
 * `/api/pipelines/<slug>` for renaming and deleting the thing itself. Both resolve
 * here, or an owner is refused the two actions they most need on their own
 * pipeline while holding a lesser role elsewhere.
 */
export function pipelineFromPath(pathname: string): string | null {
  const scoped = /^\/api\/p\/([^/]+)(?:\/|$)/.exec(pathname);
  if (scoped) return decodeURIComponent(scoped[1]);
  // `import` is a sibling route under the same prefix, not a slug.
  const registry = /^\/api\/pipelines\/([^/]+)$/.exec(pathname);
  if (registry && registry[1] !== "import") return decodeURIComponent(registry[1]);
  return null;
}
