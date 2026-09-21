"use client";

// Accounts, for an admin: create, change a role, reset a password, delete.

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import {
  CARD,
  Select,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
} from "@/components/ui/controls";
import { useCan, useCurrentUser } from "@/lib/client/use-current-user";
import { passwordProblem, usernameProblem } from "@/lib/auth/account-rules";
import { ROLES, type Role } from "@/lib/auth/roles";

interface Account {
  username: string;
  /** What they call themselves; equals the username when unset. */
  displayName: string;
  role: Role;
  createdAt: string;
  /** Provisioned from the environment, so it cannot be deleted from here. */
  bootstrap: boolean;
}

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

  const [resetting, setResetting] = useState<Account | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetDone, setResetDone] = useState<string | null>(null);

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

  async function changeRole(account: Account, role: Role) {
    setPending(`role:${account.username}`);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(account.username)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setAccounts((current) =>
        current.map((a) => (a.username === account.username ? { ...a, role } : a)),
      );
    } catch (err) {
      setError((err as Error).message);
      // Reload so the select shows the role the server still holds.
      await load({ quiet: true });
    } finally {
      setPending(null);
    }
  }

  async function resetPassword() {
    if (!resetting) return;
    setPending(`password:${resetting.username}`);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(resetting.username)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setResetDone(resetting.username);
      setResetting(null);
      setNewPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  /** Ask what the deletion costs, so the confirmation can say. */
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
    <section className={`mt-5 ${CARD}`}>
      <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">People</h2>
      <p className="mt-1 max-w-[62ch] text-[12.5px] text-[color:var(--color-ink-3)]">
        Who can sign in, and what they can do across every pipeline. Changing a role signs that
        person out. Access to one pipeline is set on that pipeline.
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
            <col />
            <col className="w-[130px]" />
            <col className="w-[230px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[color:var(--color-rule)] text-left text-[11px] text-[color:var(--color-ink-3)]">
              <th className="pb-1.5 pr-3 font-medium">Account</th>
              <th className="pb-1.5 pl-[11px] pr-3 font-medium">Role</th>
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
                  <td className="py-2 pr-3">
                    <span className="block truncate font-medium text-[color:var(--color-ink)]">
                      {a.displayName}
                      {isMe ? (
                        <span className="ml-1.5 text-[11.5px] font-normal text-[color:var(--color-ink-4)]">
                          you
                        </span>
                      ) : null}
                    </span>
                    {a.displayName !== a.username ? (
                      <span className="block truncate text-[11.5px] text-[color:var(--color-ink-4)]">
                        {a.username}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    {a.bootstrap || isMe ? (
                      <span
                        className="pl-[11px] text-[12.5px] text-[color:var(--color-ink-2)]"
                        title={
                          a.bootstrap
                            ? "The environment sets this account to admin on every start."
                            : "Ask another admin to change your role."
                        }
                      >
                        {a.role}
                      </span>
                    ) : (
                      <Select
                        label={`Role for ${a.username}`}
                        value={a.role}
                        disabled={pending === `role:${a.username}`}
                        onChange={(e) => void changeRole(a, e.target.value as Role)}
                        data-testid={`role-${a.username}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {a.bootstrap ? (
                      <span
                        className="text-[11.5px] text-[color:var(--color-ink-4)]"
                        title="The environment sets this account's password and role on every start."
                      >
                        From environment
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={pending === `password:${a.username}`}
                          onClick={() => {
                            setResetDone(null);
                            setNewPassword("");
                            setResetting(a);
                          }}
                          data-testid={`reset-password-${a.username}`}
                          className={ghostButtonClass()}
                        >
                          Reset password
                        </button>
                        {isMe ? (
                          <span
                            className="px-2 text-[11.5px] text-[color:var(--color-ink-4)]"
                            title="You cannot delete the account you are signed in as."
                          >
                            Signed in
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
                      </span>
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
            className={inputClass("w-[170px]")}
          />
          <input
            aria-label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete="new-password"
            data-testid="new-user-password"
            className={inputClass("w-[170px]")}
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
            disabled={
              pending === "create" ||
              usernameProblem(username.trim()) !== null ||
              passwordProblem(password) !== null
            }
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

      {resetDone ? (
        <p className="mt-3 text-[11.5px] text-[color:var(--color-ink-4)]" role="status">
          {resetDone}&apos;s password is set and their sessions have ended.
        </p>
      ) : null}

      <Modal
        open={resetting !== null}
        onClose={() => (pending ? undefined : setResetting(null))}
      >
        <h2 className="text-lg font-semibold">Reset password for {resetting?.username}</h2>
        <p className="mt-2 text-sm text-[color:var(--color-ink-2)]">
          They are signed out everywhere and sign in again with this password. Karet sends no
          mail, so tell them yourself.
          {resetting?.username === me?.username
            ? " This is your account, so you will be signed out too."
            : ""}
        </p>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="new password"
          autoComplete="new-password"
          aria-label={`New password for ${resetting?.username}`}
          data-testid="new-password"
          className={inputClass("mt-4 block w-full")}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => setResetting(null)}
            className={ghostButtonClass()}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending !== null || passwordProblem(newPassword) !== null}
            onClick={() => void resetPassword()}
            data-testid="confirm-reset-password"
            className={primaryButtonClass()}
          >
            {pending?.startsWith("password:") ? "Setting…" : "Set password"}
          </button>
        </div>
      </Modal>

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
