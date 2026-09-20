"use client";

// Accounts, for an admin. Create and delete without reaching for a terminal.
//
// Role changes and password resets are still `scripts/manage-users.mjs`.

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { CARD, Select, ghostButtonClass, primaryButtonClass } from "@/components/ui/controls";
import { useCan, useCurrentUser } from "@/lib/client/use-current-user";
import type { Role } from "@/lib/auth/roles";

interface Account {
  username: string;
  role: Role;
  createdAt: string;
  /** Provisioned from the environment, so it cannot be deleted from here. */
  bootstrap: boolean;
}

const ROLES: Role[] = ["viewer", "editor", "admin"];

const INPUT =
  "h-[34px] rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2.5 text-[12.5px] text-[color:var(--color-ink)] outline-none transition focus-visible:border-[color:var(--color-carrot)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-carrot-soft)]";

export default function UsersPanel() {
  const isAdmin = useCan("admin");
  const me = useCurrentUser();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [created, setCreated] = useState<string | null>(null);

  const [target, setTarget] = useState<Account | null>(null);
  const [owned, setOwned] = useState<string[] | null>(null);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setAccounts(body.users);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function create() {
    setPending("create");
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setCreated(body.user.username);
      setUsername("");
      setPassword("");
      setRole("viewer");
      await load({ quiet: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  /** Ask what the deletion costs before showing the confirmation. */
  async function askDelete(account: Account) {
    setTarget(account);
    setOwned(null);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(account.username)}`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (res.ok) setOwned(body.ownedPipelines ?? []);
    } catch {
      // Leave it null: the dialog just omits the pipeline note.
    }
  }

  async function confirmDelete() {
    if (!target) return;
    setPending(`delete:${target.username}`);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(target.username)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setTarget(null);
      await load({ quiet: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  if (!isAdmin) return null;

  return (
    <section className={`mt-6 max-w-[620px] ${CARD}`}>
      <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">People</h2>
      <p className="mt-1 max-w-[62ch] text-[12.5px] text-[color:var(--color-ink-3)]">
        Accounts on this instance. A new account signs in with the password you set here and
        sees pipelines at its role, or only the ones it is invited to.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-3 py-2 text-[12.5px] text-[color:var(--color-rose-deep)]"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-[12.5px] text-[color:var(--color-ink-4)]">Loading…</p>
      ) : (
        <table
          className="mt-4 w-full table-fixed border-collapse text-sm"
          data-testid="users-table"
        >
          {/* Fixed layout: adding or removing a row must not move the columns. */}
          <colgroup>
            <col className="w-[200px]" />
            <col className="w-[110px]" />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-[color:var(--color-rule)] text-left text-[11px] text-[color:var(--color-ink-3)]">
              <th className="pb-1.5 pr-3 font-medium">Account</th>
              <th className="pb-1.5 pr-3 font-medium">Role</th>
              <th className="pb-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const isMe = a.username === me?.username;
              return (
                <tr
                  key={a.username}
                  className="border-b border-[color:var(--color-rule-soft)] last:border-b-0"
                >
                  <td className="py-2 pr-3 font-medium text-[color:var(--color-ink)]">
                    {a.username}
                    {isMe ? (
                      <span className="ml-1.5 text-[11.5px] font-normal text-[color:var(--color-ink-4)]">
                        you
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-[12.5px] text-[color:var(--color-ink-2)]">
                    {a.role}
                  </td>
                  <td className="py-2 text-right">
                    {a.bootstrap || isMe ? (
                      <span
                        className="text-[11.5px] text-[color:var(--color-ink-4)]"
                        title={
                          a.bootstrap
                            ? "Provisioned from the environment and recreated on restart."
                            : "You cannot delete the account you are signed in as."
                        }
                      >
                        {a.bootstrap ? "From environment" : "Signed in"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending === `delete:${a.username}`}
                        onClick={() => void askDelete(a)}
                        data-testid={`delete-user-${a.username}`}
                        className={ghostButtonClass()}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="mt-5 border-t border-[color:var(--color-rule-soft)] pt-4">
        <p className="text-[12px] font-medium text-[color:var(--color-ink-2)]">Add an account</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            aria-label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="off"
            data-testid="new-user-username"
            className={`${INPUT} w-[170px]`}
          />
          <input
            aria-label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete="new-password"
            data-testid="new-user-password"
            className={`${INPUT} w-[170px]`}
          />
          <Select
            label="Role for the new account"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            data-testid="new-user-role"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={pending === "create" || !username.trim() || password.length === 0}
            onClick={() => void create()}
            data-testid="create-user"
            className={primaryButtonClass()}
          >
            {pending === "create" ? "Creating…" : "Create"}
          </button>
        </div>
        <p className="mt-2 text-[11.5px] text-[color:var(--color-ink-4)]">
          {created
            ? `${created} can sign in now. Tell them their password; it is not shown again.`
            : "3 to 32 letters, numbers, underscores or dots. Password at least 8 characters."}
        </p>
      </div>

      <Modal open={target !== null} onClose={() => (pending ? undefined : setTarget(null))}>
        <h2 className="text-lg font-semibold">Delete {target?.username}?</h2>
        <p className="mt-2 text-sm text-[color:var(--color-ink-2)]">
          Their sessions end immediately and their access to every pipeline goes with the
          account.
        </p>
        {owned && owned.length > 0 ? (
          <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">
            They own <span className="text-[color:var(--color-ink)]">{owned.join(", ")}</span>.
            {owned.length === 1 ? " It stays" : " Those stay"} but ends up without an owner, and
            any admin can hand {owned.length === 1 ? "it" : "them"} to somebody else.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => setTarget(null)}
            className={ghostButtonClass()}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void confirmDelete()}
            data-testid="confirm-delete-user"
            className={primaryButtonClass()}
          >
            {pending?.startsWith("delete:") ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
