// The API routes: every server/api/**/route.ts, at the path its folders spell.
// A folder named [name] is a path parameter and [...name] matches the rest of
// the path. Each module exports a function per HTTP method, called with the
// request and a context holding the parameters.

type Context = { params: Promise<Record<string, string>> };
type Handler = (request: Request, context: Context) => Promise<Response> | Response;
type RouteModule = Partial<Record<(typeof METHODS)[number], Handler>>;

export const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

const modules = import.meta.glob<RouteModule>("./api/**/route.ts", { eager: true });

export interface Route {
  /** Hono path, e.g. `/api/p/:pipeline/tables`. */
  path: string;
  /** Name of a trailing [...name] segment, which Hono matches as `*`. */
  rest: string | null;
  module: RouteModule;
}

export function routePath(file: string): { path: string; rest: string | null } {
  const segments = file.replace(/^\.\//, "").replace(/\/route\.ts$/, "").split("/");
  let rest: string | null = null;
  const path = segments
    .map((s) => {
      const restMatch = /^\[\.\.\.(.+)\]$/.exec(s);
      if (restMatch) {
        rest = restMatch[1];
        return "*";
      }
      const param = /^\[(.+)\]$/.exec(s);
      return param ? `:${param[1]}` : s;
    })
    .join("/");
  return { path: `/${path}`, rest };
}

/** Routes with fixed segments before parameters, so `/a/new` wins over `/a/:id`. */
export const ROUTES: Route[] = Object.entries(modules)
  .map(([file, module]) => ({ ...routePath(file), module }))
  .sort((a, b) => specificity(b.path) - specificity(a.path) || a.path.localeCompare(b.path));

function specificity(path: string): number {
  return path.split("/").reduce((n, s) => n * 3 + (s === "*" ? 0 : s.startsWith(":") ? 1 : 2), 0);
}
