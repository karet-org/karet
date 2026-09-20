"use client";

// Your own account: what you are called, and your password.
//
// Every signed-in role sees this card. The workspace name below it is an admin
// setting; this is the part that is yours.

import { useEffect, useState } from "react";
import { CARD, ghostButtonClass, inputClass, primaryButtonClass } from "@/components/ui/controls";
import { notifyCurrentUserChanged, useCurrentUser } from "@/lib/client/use-current-user";
import { MAX_DISPLAY_NAME } from "@/lib/auth/account-rules";

export default function AccountPanel() {
  const me = useCurrentUser();

  const [displayName, setDisplayName] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changed, setChanged] = useState(false);

  // Seed once the session lands. A name equal to the username is a name nobody
  // has set, so the field shows empty and the placeholder carries the username.
  useEffect(() => {
    if (!me) return;
    setDisplayName(me.displayName === me.username ? "" : me.displayName);
  }, [me]);

  async function send(body: unknown, key: string): Promise<boolean> {
    setPending(key);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.message || parsed.error || `HTTP ${res.status}`);
      // Tell the rail rather than refreshing the route, which would remount this
      // card and take the "Saved" with it.
      notifyCurrentUserChanged();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function commitName() {
    const wanted = displayName.trim();
    const currentName = me && me.displayName === me.username ? "" : (me?.displayName ?? "");
    if (wanted === currentName) return;
    setSaved(false);
    if (await send({ displayName: wanted }, "name")) setSaved(true);
  }

  async function commitPassword() {
    setChanged(false);
    if (await send({ currentPassword: current, newPassword: next }, "password")) {
      setChanged(true);
      setChanging(false);
      setCurrent("");
      setNext("");
    }
  }

  return (
    <section className={`mt-6 ${CARD}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">Your account</h2>
        <span
          aria-live="polite"
          className="text-[11.5px] text-[color:var(--color-ink-4)]"
          data-testid="account-save-state"
        >
          {pending === "name" ? "Saving…" : saved ? "Saved" : ""}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-[color:var(--color-ink-3)]">
        {me ? `${me.username}, ${me.role}` : ""}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-3 py-2 text-[12.5px] text-[color:var(--color-rose-deep)]"
        >
          {error}
        </p>
      ) : null}

      <label className="mt-4 block">
        <span className="text-[12px] font-medium text-[color:var(--color-ink-2)]">Display name</span>
        <input
          type="text"
          maxLength={MAX_DISPLAY_NAME}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={() => void commitName()}
          placeholder={me?.username ?? ""}
          data-testid="account-display-name"
          className={inputClass("mt-1.5 block w-full max-w-[320px]")}
        />
        <span className="mt-1.5 block text-[11.5px] text-[color:var(--color-ink-4)]">
          Shown in the sidebar. Empty uses your username.
        </span>
      </label>

      <div className="mt-5 border-t border-[color:var(--color-rule-soft)] pt-4">
        {!changing ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setChanged(false);
                setChanging(true);
              }}
              data-testid="change-password"
              className={ghostButtonClass()}
            >
              Change password
            </button>
            {changed ? (
              <span className="text-[11.5px] text-[color:var(--color-ink-4)]" role="status">
                Password changed.
              </span>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="text-[12px] font-medium text-[color:var(--color-ink-2)]">
              Change password
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="current password"
                autoComplete="current-password"
                aria-label="Current password"
                data-testid="current-password"
                className={inputClass("w-[190px]")}
              />
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="new password"
                autoComplete="new-password"
                aria-label="New password"
                data-testid="next-password"
                className={inputClass("w-[190px]")}
              />
              <button
                type="button"
                disabled={pending === "password" || current.length === 0 || next.length < 8}
                onClick={() => void commitPassword()}
                data-testid="save-password"
                className={primaryButtonClass()}
              >
                {pending === "password" ? "Changing…" : "Change"}
              </button>
              <button
                type="button"
                disabled={pending === "password"}
                onClick={() => {
                  setChanging(false);
                  setCurrent("");
                  setNext("");
                  setError(null);
                }}
                className={ghostButtonClass()}
              >
                Cancel
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-[color:var(--color-ink-4)]">
              At least 8 characters. Changing it signs you out everywhere.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
