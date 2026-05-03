"use client";

// Top navigation bar shown on every page via the root layout.
//
// Provides links to the home page, the data flow graph, and a
// dashboards menu populated from `/api/dashboards`. The active page is
// highlighted via `usePathname` so users always know where they are.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KaretLogo, IconChevronDown, IconDownload, IconExternal } from "@/components/icons";
import { sanitizeSlug } from "@/lib/config/slug";
import Modal from "@/components/ui/Modal";

const NAV_HEIGHT_PX = 48;

/** Exported so pages can offset full-viewport content (e.g. the graph canvas). */
export const TOP_NAV_HEIGHT_PX = NAV_HEIGHT_PX;

export default function TopNav({ pipeline }: { pipeline: string }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [dashboards, setDashboards] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const base = `/p/${pipeline}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/p/${pipeline}/dashboards`);
        if (!res.ok) return;
        const body = (await res.json()) as { dashboards?: string[] };
        if (!cancelled && Array.isArray(body.dashboards)) {
          setDashboards(body.dashboards);
        }
      } catch {
        // Silent — the nav stays useful even if the list can't load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline]);

  // Close the dashboards menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkClass = (href: string) =>
    `rounded px-3 py-1.5 text-sm transition-colors ${
      isActive(href)
        ? "bg-orange-100 text-orange-700"
        : "text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <nav
      data-testid="top-nav"
      className="sticky top-0 z-20 flex items-center gap-1 border-b border-gray-200 bg-white px-4"
      style={{ height: NAV_HEIGHT_PX }}
    >
      <Link
        href="/"
        className="mr-4 flex items-center gap-2 text-sm font-semibold text-gray-900"
      >
        <KaretLogo size={22} />
        Karet
      </Link>

      <Link href={`${base}/graph`} className={linkClass(`${base}/graph`)}>
        Graph
      </Link>
      <Link href={`${base}/jobs`} className={linkClass(`${base}/jobs`)}>
        Jobs
      </Link>
      <Link href={`${base}/tables`} className={linkClass(`${base}/tables`)}>
        Tables
      </Link>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className={linkClass(`${base}/dashboards`)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-testid="top-nav-dashboards-button"
        >
          Dashboards <IconChevronDown size={12} className="inline" />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
            data-testid="top-nav-dashboards-menu"
          >
            {dashboards.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">
                No dashboards found
              </div>
            ) : (
              dashboards.map((name) => (
                <Link
                  key={name}
                  href={`${base}/dashboards/${name}`}
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                  className={`block px-3 py-1.5 text-sm ${
                    pathname === `${base}/dashboards/${name}`
                      ? "bg-orange-50 text-orange-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {name}
                </Link>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
        <a
          href={`/api/p/${pipeline}/export`}
          className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-gray-600 hover:bg-gray-50 hover:text-gray-800"
          download
        >
          Export <IconDownload size={12} />
        </a>
        <button
          type="button"
          onClick={() => {
            setRenameValue(pipeline);
            setRenameError(null);
            setRenameOpen(true);
          }}
          data-testid="top-nav-rename-pipeline"
          title="Rename this pipeline (changes its URL)"
          className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-gray-600 hover:bg-gray-50 hover:text-gray-800"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = window.confirm(
              `Delete pipeline "${pipeline}"?\n\nThis permanently removes its config, dashboards, raw CSVs, Parquet output, and job history. Cannot be undone.`,
            );
            if (!ok) return;
            setDeleting(true);
            try {
              const res = await fetch(
                `/api/pipelines/${encodeURIComponent(pipeline)}`,
                { method: "DELETE" },
              );
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                alert(
                  `Delete failed: ${body.message ?? body.error ?? res.statusText}`,
                );
                return;
              }
              router.push("/");
              router.refresh();
            } finally {
              setDeleting(false);
            }
          }}
          disabled={deleting}
          data-testid="top-nav-delete-pipeline"
          title="Delete this pipeline and all its data"
          className="flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <a
          href="http://localhost:9001"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-gray-600"
          title="rustfs console"
        >
          S3 console <IconExternal size={12} />
        </a>
      </div>

      {renameOpen ? (
        <Modal
          open={renameOpen}
          onClose={() => {
            if (!renaming) setRenameOpen(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const newSlug = sanitizeSlug(renameValue);
              if (!newSlug) {
                setRenameError("Name is required");
                return;
              }
              if (newSlug === pipeline) {
                setRenameError("New name is the same as the current name");
                return;
              }
              setRenaming(true);
              setRenameError(null);
              try {
                const res = await fetch(
                  `/api/pipelines/${encodeURIComponent(pipeline)}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ newSlug }),
                  },
                );
                const data = await res.json().catch(() => ({}));
                if (res.status === 409) {
                  setRenameError(`Pipeline "${newSlug}" already exists`);
                  return;
                }
                if (!res.ok || !data.ok) {
                  setRenameError(
                    data.message ?? data.error ?? `Rename failed (${res.status})`,
                  );
                  return;
                }
                // Navigate to the new slug on the same sub-page.
                // `pathname` looks like `/p/<old>/graph`; swap the slug.
                const newPath = pathname.replace(
                  new RegExp(`^/p/${pipeline}(?=/|$)`),
                  `/p/${newSlug}`,
                );
                setRenameOpen(false);
                router.push(newPath);
                router.refresh();
              } catch (err) {
                setRenameError((err as Error).message);
              } finally {
                setRenaming(false);
              }
            }}
          >
            <h2 className="text-lg font-semibold">Rename pipeline</h2>
            <p className="mt-1 text-xs text-gray-500">
              The URL and S3 prefix change from{" "}
              <code className="rounded bg-gray-100 px-1 text-[11px]">
                {pipeline}
              </code>{" "}
              to the new name. Existing links to the old URL will break.
            </p>

            <label className="mt-4 block text-sm font-medium text-gray-700">
              New name
            </label>
            <input
              autoFocus
              type="text"
              data-testid="rename-pipeline-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              Will be saved as{" "}
              <code className="rounded bg-gray-100 px-1">
                {sanitizeSlug(renameValue) || "…"}
              </code>
            </p>

            {renameError ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {renameError}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                disabled={renaming}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renaming}
                data-testid="rename-pipeline-submit"
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {renaming ? "Renaming…" : "Rename"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </nav>
  );
}
