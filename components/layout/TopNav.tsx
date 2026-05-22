"use client";

// Top navigation bar shown on every pipeline page.
//
// Layout:
//   [Karet logo] [Pipeline pill ▾] | [Graph] [Jobs] [Tables] [Dashboards ▾] ... [Settings ▾] [Account]
//
// The pipeline pill on the left is a switcher: clicking it shows every
// pipeline in the bucket so users can hop between them without going
// back to the home page. Rename / Delete / Export move into the
// Settings dropdown so the chrome stays calm and destructive actions
// stop being permanently visible.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  KaretLogo,
  IconChevronDown,
  IconDownload,
  IconExternal,
  IconSettings,
  IconTrash,
} from "@/components/icons";
import { sanitizeSlug } from "@/lib/config/slug";
import Modal from "@/components/ui/Modal";
import UserMenu from "@/components/layout/UserMenu";

const NAV_HEIGHT_PX = 52;

/** Exported so pages can offset full-viewport content (e.g. the graph canvas). */
export const TOP_NAV_HEIGHT_PX = NAV_HEIGHT_PX;

export default function TopNav({ pipeline }: { pipeline: string }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [dashboards, setDashboards] = useState<string[]>([]);
  const [pipelines, setPipelines] = useState<string[]>([]);
  const [dashOpen, setDashOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const dashRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const base = `/p/${pipeline}`;

  // Load dashboards for the current pipeline.
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
        // Silent -- the nav stays useful even if the list can't load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline]);

  // Load the full pipeline list lazily -- only when the switcher opens.
  useEffect(() => {
    if (!pipelineOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pipelines");
        if (!res.ok) return;
        const body = (await res.json()) as { pipelines?: string[] };
        if (!cancelled && Array.isArray(body.pipelines)) {
          setPipelines(body.pipelines);
        }
      } catch {
        // Silent.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipelineOpen]);

  // Generic close-on-outside / close-on-Escape handler for any open menu.
  useEffect(() => {
    const anyOpen = dashOpen || pipelineOpen || settingsOpen;
    if (!anyOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (dashOpen && !dashRef.current?.contains(t)) setDashOpen(false);
      if (pipelineOpen && !pipelineRef.current?.contains(t)) setPipelineOpen(false);
      if (settingsOpen && !settingsRef.current?.contains(t)) setSettingsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDashOpen(false);
        setPipelineOpen(false);
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [dashOpen, pipelineOpen, settingsOpen]);

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-[13.5px] transition-colors ${
      active
        ? "text-[color:var(--color-carrot-deep)] bg-[color:var(--color-carrot-soft)]"
        : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
    }`;

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <nav
      data-testid="top-nav"
      className="sticky top-0 z-20 flex items-center gap-1 border-b border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 sm:px-5"
      style={{ height: NAV_HEIGHT_PX }}
    >
      <Link
        href="/"
        className="mr-3 flex items-center gap-2 text-[15px] font-semibold tracking-[-0.005em] text-[color:var(--color-ink)]"
      >
        <KaretLogo size={20} />
        Karet
      </Link>

      {/* Pipeline switcher pill */}
      <div ref={pipelineRef} className="relative mr-3">
        <button
          type="button"
          onClick={() => setPipelineOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-rule)] bg-[color:var(--color-surface-2)] py-[3px] pl-1 pr-2.5 text-[11.5px] text-[color:var(--color-ink-2)] hover:border-[color:var(--color-ink-4)]"
          aria-haspopup="menu"
          aria-expanded={pipelineOpen}
          data-testid="top-nav-pipeline-pill"
          title="Switch pipeline"
        >
          <span
            className="rounded-full border border-[color:var(--color-rule)] bg-white px-1.5 py-[1px] text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]"
          >
            Pipeline
          </span>
          <span className="font-mono">{pipeline}</span>
          <IconChevronDown size={12} className="text-[color:var(--color-ink-4)]" />
        </button>
        {pipelineOpen ? (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1 min-w-[220px] rounded-md border border-[color:var(--color-rule)] bg-white py-1 shadow-md"
            data-testid="top-nav-pipeline-menu"
          >
            {pipelines.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[color:var(--color-ink-3)]">
                Loading…
              </div>
            ) : (
              pipelines.map((slug) => (
                <Link
                  key={slug}
                  href={`/p/${slug}/graph`}
                  onClick={() => setPipelineOpen(false)}
                  role="menuitem"
                  className={`block px-3 py-1.5 font-mono text-[12px] ${
                    slug === pipeline
                      ? "bg-[color:var(--color-carrot-soft)] text-[color:var(--color-carrot-deep)]"
                      : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                  }`}
                >
                  {slug}
                </Link>
              ))
            )}
            <div className="my-1 border-t border-[color:var(--color-rule)]" />
            <Link
              href="/"
              onClick={() => setPipelineOpen(false)}
              role="menuitem"
              className="block px-3 py-1.5 text-[12px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
            >
              All pipelines…
            </Link>
          </div>
        ) : null}
      </div>

      {/* Primary tabs */}
      <Link href={`${base}/graph`} className={tabClass(isActive(`${base}/graph`))}>
        Graph
      </Link>
      <Link href={`${base}/jobs`} className={tabClass(isActive(`${base}/jobs`))}>
        Jobs
      </Link>
      <Link href={`${base}/tables`} className={tabClass(isActive(`${base}/tables`))}>
        Tables
      </Link>

      <div ref={dashRef} className="relative">
        <button
          type="button"
          onClick={() => setDashOpen((o) => !o)}
          className={tabClass(isActive(`${base}/dashboards`))}
          aria-haspopup="menu"
          aria-expanded={dashOpen}
          data-testid="top-nav-dashboards-button"
        >
          Dashboards{" "}
          <IconChevronDown size={12} className="ml-0.5 inline align-[-1px] text-[color:var(--color-ink-4)]" />
        </button>
        {dashOpen ? (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1 min-w-[200px] rounded-md border border-[color:var(--color-rule)] bg-white py-1 shadow-md"
            data-testid="top-nav-dashboards-menu"
          >
            {dashboards.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[color:var(--color-ink-3)]">
                No dashboards yet
              </div>
            ) : (
              dashboards.map((name) => (
                <Link
                  key={name}
                  href={`${base}/dashboards/${name}`}
                  onClick={() => setDashOpen(false)}
                  role="menuitem"
                  className={`block px-3 py-1.5 text-[13px] ${
                    pathname === `${base}/dashboards/${name}`
                      ? "bg-[color:var(--color-carrot-soft)] text-[color:var(--color-carrot-deep)]"
                      : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                  }`}
                >
                  {name}
                </Link>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Settings dropdown -- holds Export, Rename, Delete, S3 console */}
        <div ref={settingsRef} className="relative">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            data-testid="top-nav-settings-button"
          >
            <IconSettings size={14} />
            Settings
          </button>
          {settingsOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-[200px] overflow-hidden rounded-md border border-[color:var(--color-rule)] bg-white py-1 shadow-md"
              data-testid="top-nav-settings-menu"
            >
              <a
                href={`/api/p/${pipeline}/export`}
                download
                onClick={() => setSettingsOpen(false)}
                className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                role="menuitem"
              >
                <span>Export pipeline</span>
                <IconDownload size={13} className="text-[color:var(--color-ink-4)]" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setRenameValue(pipeline);
                  setRenameError(null);
                  setRenameOpen(true);
                }}
                role="menuitem"
                data-testid="top-nav-rename-pipeline"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
              >
                Rename pipeline
              </button>
              {process.env.NEXT_PUBLIC_S3_CONSOLE_URL ? (
                <a
                  href={process.env.NEXT_PUBLIC_S3_CONSOLE_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setSettingsOpen(false)}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                  role="menuitem"
                  title="Open the S3 admin console"
                >
                  <span>S3 console</span>
                  <IconExternal size={13} className="text-[color:var(--color-ink-4)]" />
                </a>
              ) : null}
              <div className="my-1 border-t border-[color:var(--color-rule)]" />
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setDeleteConfirm("");
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                disabled={deleting}
                role="menuitem"
                data-testid="top-nav-delete-pipeline"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-[color:var(--color-rose-deep)] hover:bg-[color:var(--color-rose-soft)] disabled:opacity-50"
              >
                <span>Delete pipeline…</span>
                <IconTrash size={13} />
              </button>
            </div>
          ) : null}
        </div>

        <span className="mx-1 h-4 w-px bg-[color:var(--color-rule)]" aria-hidden />
        <UserMenu />
      </div>

      {deleteOpen ? (
        <Modal
          open={deleteOpen}
          onClose={() => {
            if (!deleting) setDeleteOpen(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (sanitizeSlug(deleteConfirm) !== pipeline) {
                setDeleteError(
                  `Type "${pipeline}" exactly to confirm deletion.`,
                );
                return;
              }
              setDeleting(true);
              setDeleteError(null);
              try {
                const res = await fetch(
                  `/api/pipelines/${encodeURIComponent(pipeline)}`,
                  { method: "DELETE" },
                );
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  setDeleteError(
                    `Delete failed: ${body.message ?? body.error ?? res.statusText}`,
                  );
                  return;
                }
                setDeleteOpen(false);
                router.push("/");
                router.refresh();
              } catch (err) {
                setDeleteError((err as Error).message);
              } finally {
                setDeleting(false);
              }
            }}
          >
            <h2 className="text-lg font-semibold text-[color:var(--color-rose-deep)]">
              Delete pipeline
            </h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              This permanently removes the config, dashboards, raw CSVs,
              Parquet output, and job history for{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[11px]">
                {pipeline}
              </code>
              . Cannot be undone.
            </p>

            <div className="mt-4 rounded-md border border-[color:var(--color-amber-soft)] bg-[color:var(--color-amber-soft)] px-3 py-2 text-xs text-[color:var(--color-amber-deep)]">
              Want a backup first?{" "}
              <a
                href={`/api/p/${pipeline}/export`}
                download
                className="font-medium underline"
              >
                Download a .zip
              </a>{" "}
              of this pipeline before deleting.
            </div>

            <label className="mt-4 block text-sm font-medium text-[color:var(--color-ink-2)]">
              Type{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[11px]">
                {pipeline}
              </code>{" "}
              to confirm
            </label>
            <input
              autoFocus
              type="text"
              data-testid="delete-pipeline-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-[color:var(--color-rule)] bg-white px-3 py-2 font-mono text-sm focus:border-[color:var(--color-rose-deep)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-rose-soft)]"
            />

            {deleteError ? (
              <p
                className="mt-3 text-sm text-[color:var(--color-rose-deep)]"
                role="alert"
              >
                {deleteError}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting || sanitizeSlug(deleteConfirm) !== pipeline}
                data-testid="delete-pipeline-submit"
                className="rounded-md bg-[color:var(--color-rose-deep)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete pipeline"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

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
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              The URL and S3 prefix change from{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[11px]">
                {pipeline}
              </code>{" "}
              to the new name. Existing links to the old URL will break.
            </p>

            <label className="mt-4 block text-sm font-medium text-[color:var(--color-ink-2)]">
              New name
            </label>
            <input
              autoFocus
              type="text"
              data-testid="rename-pipeline-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="mt-1 w-full rounded-md border border-[color:var(--color-rule)] bg-white px-3 py-2 text-sm focus:border-[color:var(--color-carrot)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
            />
            <p className="mt-1 text-xs text-[color:var(--color-ink-4)]">
              Will be saved as{" "}
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono">
                {sanitizeSlug(renameValue) || "…"}
              </code>
            </p>

            {renameError ? (
              <p
                className="mt-3 text-sm text-[color:var(--color-rose-deep)]"
                role="alert"
              >
                {renameError}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                disabled={renaming}
                className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renaming}
                data-testid="rename-pipeline-submit"
                className="rounded-md bg-[color:var(--color-carrot)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
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
