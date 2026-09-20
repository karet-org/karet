"use client";

// Workspace settings; persists via /api/settings.
//
// Laid out like the pipeline Access page: a card with a heading, a sentence saying
// what it is for, and the shared controls. Saves on blur rather than behind a
// button, because it is one cosmetic string with nothing to validate against, and
// the rest of the page commits as you go.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { invalidateCached } from "@/lib/client/fetch-cache";
import { CARD, inputClass } from "@/components/ui/controls";

interface Settings {
  workspaceName: string;
  starred: string[];
}

export default function SettingsForm() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the server holds, so a blur that changed nothing writes nothing. */
  const persisted = useRef<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
        const body = (await res.json()) as Settings;
        if (!cancelled) {
          setSettings(body);
          persisted.current = body;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback(
    async (next: Settings) => {
      const before = persisted.current;
      if (before && before.workspaceName === next.workspaceName) return;
      setSaving(true);
      setSaved(false);
      setError(null);
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        const body = (await res.json()) as Settings;
        setSettings(body);
        persisted.current = body;
        setSaved(true);
        invalidateCached("/api/settings");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        // Put the fields back to what the server has, so the screen never shows a
        // value that was not stored.
        if (before) setSettings(before);
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  return (
    <section className={`mt-6 ${CARD}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">Workspace</h2>
        <span
          aria-live="polite"
          className="text-[11.5px] text-[color:var(--color-ink-4)]"
          data-testid="settings-save-state"
        >
          {saving ? "Saving…" : saved ? "Saved" : ""}
        </span>
      </div>
      <p className="mt-1 max-w-[62ch] text-[12.5px] text-[color:var(--color-ink-3)]">
        What this instance calls itself in the sidebar. Cosmetic, and saved as you leave the
        field. Who you are signed in as comes from your account.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-3 py-2 text-[12.5px] text-[color:var(--color-rose-deep)]"
        >
          {error}
        </p>
      ) : null}

      {!settings ? (
        <p className="mt-4 text-[12.5px] text-[color:var(--color-ink-4)]">Loading…</p>
      ) : (
        <div className="mt-4">
          <label className="block">
            <span className="text-[12px] font-medium text-[color:var(--color-ink-2)]">
              Workspace name
            </span>
            <input
              type="text"
              maxLength={64}
              value={settings.workspaceName}
              onChange={(e) => setSettings({ ...settings, workspaceName: e.target.value })}
              onBlur={() => void commit(settings)}
              placeholder="workspace"
              data-testid="settings-workspace-name"
              className={inputClass("mt-1.5 block w-full max-w-[320px]")}
            />
          </label>
        </div>
      )}
    </section>
  );
}
