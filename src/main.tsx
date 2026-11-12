// The page app: routes, and the code for each page loaded when it is first
// opened. Every path but /login needs a session; the server redirects page
// requests without a session cookie, and the root loader catches a cookie
// whose session has ended.

import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";

import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, redirect, RouterProvider, useNavigation, type RouteObject } from "react-router";
import Home, { homeLoader } from "@/pages/Home";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import { railLoader } from "@/pages/Landing";
import PipelineLayout from "@/pages/pipeline/Layout";
import DashboardLayout, { dashboardLoader } from "@/pages/pipeline/dashboard/Layout";

/**
 * A page whose code loads when it is first opened. The router loads it as part
 * of the navigation, so the previous page stays until the new one can render.
 */
function page(load: () => Promise<{ default: ComponentType }>) {
  return async () => ({ Component: (await load()).default });
}

/** A bar across the top while a navigation loads code or data. */
function Root() {
  const busy = useNavigation().state !== "idle";
  return (
    <>
      {busy && <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-[color:var(--color-carrot)]" />}
      <Outlet />
    </>
  );
}

async function sessionLoader({ request }: { request: Request }) {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return null;
}

const routes: RouteObject[] = [
  { path: "/login", element: <Login /> },
  {
    id: "session",
    loader: sessionLoader,
    // Checked once on load; each API call is checked by the server anyway.
    shouldRevalidate: () => false,
    element: <Root />,
    // The first load waits for the session check and the page's code.
    HydrateFallback: () => null,
    children: [
      { index: true, loader: homeLoader, element: <Home /> },
      { path: "lake", loader: railLoader, lazy: page(() => import("@/pages/Lake")) },
      { path: "settings", loader: railLoader, lazy: page(() => import("@/pages/Settings")) },
      {
        path: "p/:pipeline",
        element: <PipelineLayout />,
        children: [
          { index: true, loader: ({ params }) => redirect(`/p/${params.pipeline}/graph`) },
          { path: "graph", lazy: page(() => import("@/pages/pipeline/Graph")) },
          { path: "jobs", lazy: page(() => import("@/pages/pipeline/Jobs")) },
          { path: "data", lazy: page(() => import("@/pages/pipeline/Data")) },
          { path: "search", lazy: page(() => import("@/pages/pipeline/Search")) },
          { path: "access", lazy: page(() => import("@/pages/pipeline/Access")) },
          { path: "history", lazy: page(() => import("@/pages/pipeline/History")) },
          {
            id: "dashboard",
            path: "dashboards/:name",
            loader: dashboardLoader,
            element: <DashboardLayout />,
            children: [
              { index: true, lazy: page(() => import("@/pages/pipeline/dashboard/View")) },
              { path: "edit", lazy: page(() => import("@/pages/pipeline/dashboard/Edit")) },
            ],
          },
          { path: "*", element: <NotFound /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(routes)} />
  </StrictMode>,
);
