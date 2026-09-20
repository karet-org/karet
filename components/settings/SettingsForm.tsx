"use client";

// Workspace settings; persists via /api/settings.
//
// Saves on blur rather than behind a button. These are two independent cosmetic
// strings with nothing to validate against each other, and the rest of this page
// commits as you go, so a Save button here was ceremony in one corner of a screen
// that otherwise has none.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { invalidateCached } from "@/lib/client/fetch-cache";

interface Settings {
  displayName: string;
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
      if (
        before &&
        before.displayName === next.displayName &&
        before.workspaceName === next.workspaceName
      ) {
        return;
      }
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
        // Put the field back to what the server has, so the screen never shows a
        // value that was not stored.
        if (before) setSettings(before);
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  const inputCls =
    "mt-1.5 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-ink)] outline-none transition focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]";

  return (
    <div className="max-w-[520px]">
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-[color:var(--color-rose-soft)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
        >
          {error}
        </div>
      )}

      {!settings ? (
        <p className="mt-6 text-sm text-[color:var(--color-ink-3)]">Loading…</p>
      ) : (
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="settings-display-name"
              className="block text-sm font-medium text-[color:var(--color-ink-2)]"
            >
              Display name
            </label>
            <span
              aria-live="polite"
              className="text-[12px] text-[color:var(--color-ink-4)]"
              data-testid="settings-save-state"
            >
              {saving ? "Saving…" : saved ? "Saved" : ""}
            </span>
          </div>
          <input
            id="settings-display-name"
            type="text"
            maxLength={64}
            value={settings.displayName}
            onChange={(e) => setSettings({ ...settings, displayName: e.target.value })}
            onBlur={() => void commit(settings)}
            placeholder="admin"
            data-testid="settings-display-name"
            className={inputCls}
          />
          <p className="mt-1.5 text-[12px] text-[color:var(--color-ink-3)]">
            Shown in the sidebar. Purely cosmetic, login stays password-only.
          </p>

          <label
            htmlFor="settings-workspace-name"
            className="mt-5 block text-sm font-medium text-[color:var(--color-ink-2)]"
          >
            Workspace name
          </label>
          <input
            id="settings-workspace-name"
            type="text"
            maxLength={64}
            value={settings.workspaceName}
            onChange={(e) => setSettings({ ...settings, workspaceName: e.target.value })}
            onBlur={() => void commit(settings)}
            placeholder="workspace"
            data-testid="settings-workspace-name"
            className={inputCls}
          />
        </div>
      )}
    </div>
  );
}
