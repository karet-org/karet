"use client";

// Dashboard config editor. Drafts publish through a validation gate;
// published configs validate on save.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import YamlEditor, { type EditorDiagnostic } from "@/components/dashboard/YamlEditor";
import { cachedJson } from "@/lib/client/fetch-cache";
import { nameToSlug } from "@/lib/config/name-to-slug";
import Modal from "@/components/ui/Modal";
import { TOPBAR_ACTIONS_ID } from "@/components/dashboard/DashboardTopBar";
import { validateDashboardV2Detailed } from "@/lib/types/dashboard-v2";
import { notifyDashboardsChanged } from "@/lib/client/dashboards-index";

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
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setActionsSlot(document.getElementById(TOPBAR_ACTIONS_ID));
  }, []);

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
        setSource(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline, name]);

  const structural = useMemo(
    () => (source === null ? null : validateDashboardV2Detailed(source)),
    [source],
  );

  // Warehouse schema for query completions (table slug -> columns).
  const [sqlSchema, setSqlSchema] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let cancelled = false;
    cachedJson<{ tables?: { name: string; schema: { name: string }[] }[] }>(
      `/api/p/${pipeline}/tables`,
      60_000,
    )
      .then((body) => {
        if (cancelled || !body.tables) return;
        const schema: Record<string, string[]> = {};
        for (const t of body.tables) schema[nameToSlug(t.name)] = t.schema.map((c) => c.name);
        setSqlSchema(schema);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pipeline]);

  // Server-side SQL + binding validation, debounced, once structure
  // passes. `checking` keeps Publish/Save disabled until the verdict.
  const [sqlErrors, setSqlErrors] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (source === null || !structural?.ok) {
      setSqlErrors(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/p/${pipeline}/dashboards/${name}/validate`, {
          method: "POST",
          body: source,
        });
        const gate = (await res.json()) as { ok?: boolean; errors?: string[] };
        setSqlErrors(gate.ok ? [] : (gate.errors ?? ["Validation failed"]));
      } catch {
        setSqlErrors(["Could not reach the validator"]);
      } finally {
        setChecking(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [source, structural, pipeline, name]);

  const validation = useMemo(() => {
    if (structural === null) return null;
    if (!structural.ok)
      return { ok: false as const, errors: structural.errors.map((e) => e.message) };
    if (checking || sqlErrors === null) return { ok: false as const, errors: [], pending: true };
    if (sqlErrors.length > 0) return { ok: false as const, errors: sqlErrors };
    return { ok: true as const, panelCount: structural.panelCount };
  }, [structural, checking, sqlErrors]);

  // Inline diagnostics: structural errors carry paths; server SQL errors
  // map to their panel or filter by index.
  const diagnostics = useMemo<EditorDiagnostic[]>(() => {
    if (structural === null) return [];
    if (!structural.ok) {
      return structural.errors.map((e) => ({ message: e.message, path: e.path }));
    }
    return (sqlErrors ?? []).map((message) => {
      const panel = message.match(/^panels\[(\d+)\]/);
      if (panel) {
        const i = Number(panel[1]);
        return { message, path: message.includes(" SQL:") ? ["panels", i, "query"] : ["panels", i] };
      }
      const filter = message.match(/^filters\[(\d+)\]/);
      if (filter) return { message, path: ["filters", Number(filter[1]), "options_sql"] };
      return { message, path: null };
    });
  }, [structural, sqlErrors]);

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
            notifyDashboardsChanged(pipeline);
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
          notifyDashboardsChanged(pipeline);
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
      notifyDashboardsChanged(pipeline);
      router.push(`/p/${pipeline}/graph`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <main className="flex h-[calc(100vh-94px)] flex-col md:h-[calc(100vh-46px)]" data-testid="dashboard-edit-page">
      {actionsSlot &&
        createPortal(
          <>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={busy || source === null || (!isDraft && !validation?.ok)}
              data-testid="dashboard-save"
              className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-50 ${
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
                className="rounded-md bg-[color:var(--color-carrot)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-45"
              >
                Publish
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
              data-testid="dashboard-delete"
              className="rounded-md border border-[color:var(--color-rule)] px-3.5 py-1.5 text-[12px] font-medium text-[color:var(--color-rose-deep)] hover:bg-[color:var(--color-rose-soft)] disabled:opacity-50"
            >
              Delete
            </button>
          </>,
          actionsSlot,
        )}

      {error && (
        <p role="alert" className="border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-rose-soft)] px-4 py-2 text-[12.5px] text-[color:var(--color-rose-deep)] sm:px-6">
          {error}
        </p>
      )}

      {source === null ? (
        <p className="px-6 py-8 text-sm text-[color:var(--color-ink-3)]">Loading…</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]">
            <YamlEditor
              value={source}
              onChange={setSource}
              diagnostics={diagnostics}
              sqlSchema={sqlSchema}
              ariaLabel="Dashboard config YAML"
            />
            <footer
              className="flex items-center gap-2 border-t border-[color:var(--color-rule-soft)] px-3.5 py-2 text-[11.5px]"
              data-testid="dashboard-validation"
            >
            {validation && "pending" in validation ? (
              <span className="inline-flex items-center gap-1.5 text-[color:var(--color-ink-3)]">
                <span className="skeleton h-3 w-3 rounded-full" aria-hidden />
                Checking SQL against the warehouse…
              </span>
            ) : validation?.ok ? (
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
                <span className="truncate">{validation?.errors[0] ?? ""}</span>
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
          </div>
        </div>
      )}

      {deleteOpen && (
        <Modal open={deleteOpen} onClose={() => !busy && setDeleteOpen(false)}>
          <h2 className="text-lg font-semibold text-[color:var(--color-rose-deep)]">
            Delete dashboard
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
            Removes{" "}
            <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[12px]">
              {name}.yaml
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
