"use client";

// Dashboard config editor. Drafts live here until saved, validated, and
// published; published dashboards can be edited and re-saved (validated
// on save). Invalid configs cannot be published.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import JsonEditor from "@/components/dashboard/JsonEditor";
import Modal from "@/components/ui/Modal";
import { validateDashboardConfig } from "@/lib/services/dashboard-validation";

export default function DashboardEditPage({
  params,
}: {
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = use(params);
  const router = useRouter();
  const base = `/p/${pipeline}/dashboards`;

  const [source, setSource] = useState<string | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/p/${pipeline}/dashboards/${name}?draft=1`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Load failed (${res.status})`);
        const body = await res.text();
        if (cancelled) return;
        setIsDraft(res.headers.get("X-Karet-Draft") === "1");
        // Pretty-print whatever came back so the editor starts formatted.
        try {
          setSource(JSON.stringify(JSON.parse(body), null, 2));
        } catch {
          setSource(body);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline, name]);

  const validation = useMemo(() => {
    if (source === null) return null;
    try {
      return validateDashboardConfig(JSON.parse(source));
    } catch (e) {
      return {
        ok: false as const,
        errors: [e instanceof Error ? e.message : "Invalid JSON"],
      };
    }
  }, [source]);

  const save = useCallback(
    async (publish: boolean) => {
      if (source === null) return;
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        if (isDraft) {
          const res = await fetch(
            `/api/p/${pipeline}/dashboards/${name}?draft=1`,
            { method: "PUT", body: source },
          );
          if (!res.ok) throw new Error(`Save failed (${res.status})`);
          if (publish) {
            const pub = await fetch(
              `/api/p/${pipeline}/dashboards/${name}/publish`,
              { method: "POST" },
            );
            const body = await pub.json().catch(() => ({}));
            if (!pub.ok) {
              throw new Error(
                Array.isArray(body.errors)
                  ? body.errors.join("; ")
                  : (body.message ?? `Publish failed (${pub.status})`),
              );
            }
            router.push(`${base}/${name}`);
            router.refresh();
            return;
          }
          setNotice("Draft saved");
        } else {
          const res = await fetch(`/api/p/${pipeline}/dashboards/${name}`, {
            method: "PUT",
            body: source,
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(
              Array.isArray(body.errors)
                ? body.errors.join("; ")
                : (body.message ?? `Save failed (${res.status})`),
            );
          }
          setNotice("Saved");
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [source, isDraft, pipeline, name, base, router],
  );

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/dashboards/${name}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      router.push(`/p/${pipeline}/graph`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <main className="flex h-[calc(100vh-48px)] flex-col md:h-screen" data-testid="dashboard-edit-page">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-[color:var(--color-rule-soft)] px-4 py-2.5 sm:px-6">
        <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">{name}</h1>
        {isDraft && (
          <span className="rounded-md bg-[color:var(--color-amber-soft)] px-2 py-[2px] text-[10px] font-semibold tracking-wide text-[color:var(--color-amber-deep)]">
            DRAFT
          </span>
        )}
        <span className="hidden text-[11.5px] text-[color:var(--color-ink-3)] sm:block">
          dashboards/{isDraft ? "drafts/" : ""}
          {name}.json
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!isDraft && (
            <Link
              href={`${base}/${name}`}
              className="rounded-md border border-[color:var(--color-rule)] px-3.5 py-1.5 text-[12.5px] font-medium text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
            >
              Preview
            </Link>
          )}
          <button
            type="button"
            onClick={() => save(false)}
            disabled={busy || source === null || (!isDraft && !validation?.ok)}
            data-testid="dashboard-save"
            className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-medium disabled:opacity-50 ${
              isDraft
                ? "border border-[color:var(--color-rule)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                : "bg-[color:var(--color-carrot)] text-white hover:bg-[color:var(--color-carrot-deep)]"
            }`}
          >
            {busy ? "Working…" : isDraft ? "Save draft" : "Save"}
          </button>
          {isDraft && (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={busy || !validation?.ok}
              data-testid="dashboard-publish"
              title={validation?.ok ? undefined : "Fix the config before publishing"}
              className="rounded-md bg-[color:var(--color-carrot)] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-45"
            >
              Publish
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
            aria-label="Delete dashboard"
            data-testid="dashboard-delete"
            className="rounded-md border border-[color:var(--color-rule)] px-2.5 py-1.5 text-[color:var(--color-rose-deep)] hover:bg-[color:var(--color-rose-soft)] disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M2.5 4.5h11M6.5 4.5v-2h3v2M4 4.5l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-9M6.5 7.5v4M9.5 7.5v4" />
            </svg>
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-rose-soft)] px-4 py-2 text-[12.5px] text-[color:var(--color-rose-deep)] sm:px-6">
          {error}
        </p>
      )}

      {source === null ? (
        <p className="px-6 py-8 text-sm text-[color:var(--color-ink-3)]">Loading…</p>
      ) : (
        <>
          <JsonEditor value={source} onChange={setSource} ariaLabel="Dashboard config JSON" />
          <footer
            className="flex items-center gap-2 border-t border-[color:var(--color-rule-soft)] px-4 py-2 text-[11.5px] sm:px-6"
            data-testid="dashboard-validation"
          >
            {validation?.ok ? (
              <span className="inline-flex items-center gap-1.5 text-[color:var(--color-leaf-deep)]">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="m3 8.5 3.5 3.5L13 5" />
                </svg>
                Valid config, {validation.panelCount} panel{validation.panelCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[color:var(--color-rose-deep)]">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
                <span className="truncate">{validation?.errors[0]}</span>
                {validation && validation.errors.length > 1 && (
                  <span className="shrink-0 text-[color:var(--color-ink-3)]">
                    +{validation.errors.length - 1} more
                  </span>
                )}
              </span>
            )}
            {notice && (
              <span className="ml-auto text-[color:var(--color-leaf-deep)]">{notice}</span>
            )}
          </footer>
        </>
      )}

      {deleteOpen && (
        <Modal open={deleteOpen} onClose={() => !busy && setDeleteOpen(false)}>
          <h2 className="text-lg font-semibold text-[color:var(--color-rose-deep)]">
            Delete dashboard
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
            Removes{" "}
            <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[12px]">
              {name}.json
            </code>{" "}
            {isDraft ? "(draft)" : "and its draft, if any,"} from S3. Cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              data-testid="dashboard-delete-confirm"
              className="rounded-md bg-[color:var(--color-rose-deep)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete dashboard"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
