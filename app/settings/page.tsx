"use client";

// Workspace settings. Names are cosmetic (shown in the rail); auth stays
// password-only with no user table. Stored via /api/settings in S3.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KaretLogo } from "@/components/icons";

interface Settings {
  displayName: string;
  workspaceName: string;
  starred: string[];
}

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`GET /api/settings ${res.status}`);
        const body = (await res.json()) as Settings;
        if (!cancelled) setSettings(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSettings((await res.json()) as Settings);
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "mt-1.5 h-[38px] w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 text-sm text-[color:var(--color-ink)] outline-none transition focus:border-[color:var(--color-carrot)] focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]";

  return (
    <main className="mx-auto max-w-[520px] px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[13px] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
      >
        <KaretLogo size={20} />
        Back to pipelines
      </Link>
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">
        Settings
      </h1>

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
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block text-sm font-medium text-[color:var(--color-ink-2)]">
            Display name
            <input
              type="text"
              maxLength={64}
              value={settings.displayName}
              onChange={(e) =>
                setSettings({ ...settings, displayName: e.target.value })
              }
              placeholder="admin"
              className={inputCls}
            />
          </label>
          <p className="mt-1.5 text-[12px] text-[color:var(--color-ink-3)]">
            Shown in the sidebar. Purely cosmetic, login stays password-only.
          </p>

          <label className="mt-5 block text-sm font-medium text-[color:var(--color-ink-2)]">
            Workspace name
            <input
              type="text"
              maxLength={64}
              value={settings.workspaceName}
              onChange={(e) =>
                setSettings({ ...settings, workspaceName: e.target.value })
              }
              placeholder="workspace"
              className={inputCls}
            />
          </label>

          <div className="mt-7 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center rounded-md bg-[color:var(--color-carrot)] px-4 text-sm font-medium text-white transition hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="text-[13px] text-[color:var(--color-leaf-deep)]">
                Saved
              </span>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
