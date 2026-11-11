"use client";

// Who may use this pipeline: everyone who can open it, with their role here
// and where that role comes from, plus visibility and ownership.
//
// Roles are instance-wide by default. A grant replaces a person's usual role
// on this pipeline. The owner and instance admins always have admin here, so
// their rows cannot be changed.
//
// Admin-only.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Select, ghostButtonClass, primaryButtonClass } from "@/components/ui/controls";
import { toolButton, toolInput, toolPrimary } from "@/components/data/toolbar";
import Modal from "@/components/ui/Modal";
import { ROLES, type Role } from "@/lib/auth/roles";
import { accessRows, sourceLabel, type Account, type AccessRow, type AccessState } from "@/lib/auth/access-rows";
import { useCan, useCurrentUser } from "@/lib/client/use-current-user";

/** A change that would take away the caller's own admin here, held until they confirm it. */
interface Confirmation {
  title: string;
  body: string;
  action: string;
  run: () => Promise<boolean>;
}

/** A display name is nicer to read, but the username is what a picker identifies. */
function label(a: Account): string {
  return a.displayName === a.username ? a.username : `${a.displayName} (${a.username})`;
}

export default function AccessPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const me = useCurrentUser();
  const isInstanceAdmin = useCan("admin");

  const [state, setState] = useState<AccessState>({ visibility: "instance", owner: null, members: [] });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which control is mid-request, so one change disables that control, not the page.
  const [pending, setPending] = useState<string | null>(null);
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<Role>("viewer");
  const [transferOpen, setTransferOpen] = useState(false);
  const [nextOwner, setNextOwner] = useState("");
  const [confirming, setConfirming] = useState<Confirmation | null>(null);

  const apply = useCallback((s: AccessState) => setState({ visibility: s.visibility, owner: s.owner, members: s.members }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/p/${pipeline}/members`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
        if (cancelled) return;
        apply(body);
        setAccounts(body.accounts);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipeline, apply]);

  /** Send one change and apply the state it returns, so the row updates in place. */
  async function send(key: string, body: unknown, method: "PUT" | "DELETE" = "PUT", qs = ""): Promise<boolean> {
    setPending(key);
    setError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/members${qs}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify(body) : undefined,
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.message || parsed.error || `HTTP ${res.status}`);
      apply(parsed);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setPending(null);
    }
  }

  /**
   * After the caller changes their own access, reload the page if they are no
   * longer admin here, so the side nav and this page stop offering controls the
   * server would refuse. Leave for the pipeline list if they can no longer see it.
   */
  async function reloadIfNoLongerAdmin() {
    const res = await fetch(`/api/p/${pipeline}/role`);
    if (!res.ok) {
      window.location.assign("/");
      return;
    }
    const body = (await res.json()) as { role: Role | null };
    if (body.role !== "admin") window.location.assign(`/p/${pipeline}/graph`);
  }

  /**
   * Run a change, asking first when it lowers the caller's own access. Instance
   * admins are admin everywhere, so nothing on this page can lower theirs.
   */
  function changeOwnAccess(lowersOwnAccess: boolean, confirmation: Confirmation) {
    if (!lowersOwnAccess || isInstanceAdmin) {
      void confirmation.run();
      return;
    }
    setConfirming({
      ...confirmation,
      run: async () => {
        const ok = await confirmation.run();
        if (ok) await reloadIfNoLongerAdmin();
        return ok;
      },
    });
  }

  const { visibility, owner, members } = state;
  const rows = accessRows(state, accounts);
  const unlisted = accounts.filter((a) => !rows.some((r) => r.username === a.username));
  // Matches the server's rule.
  const canTransfer = isInstanceAdmin || (owner !== null && me?.username === owner);

  /** What the caller keeps here once they are no longer the owner. */
  function accessAfterTransfer(): string {
    const grant = members.find((m) => m.username === me?.username);
    if (grant) return `You keep the ${grant.role} role your grant gives you here.`;
    if (visibility === "members") return "You have no grant here and the pipeline is members only, so you will lose access to it.";
    return `You have no grant here, so you will fall back to your ${me?.role ?? "usual"} role.`;
  }

  function setRole(r: AccessRow, role: Role) {
    changeOwnAccess(r.username === me?.username && role !== "admin", {
      title: `Change your own role to ${role}?`,
      body: "You will no longer be an admin here, so you will not be able to manage access or undo this yourself.",
      action: "Change my role",
      run: () => send(`role:${r.username}`, { username: r.username, role }),
    });
  }

  function removeGrant(r: AccessRow) {
    const run = () => send(`revoke:${r.username}`, null, "DELETE", `?username=${encodeURIComponent(r.username)}`);
    changeOwnAccess(r.username === me?.username, {
      title: "Remove your own access?",
      body:
        visibility === "members"
          ? "This pipeline is members only, so you will lose access to it and cannot undo this yourself."
          : `You will fall back to your ${me?.role ?? "usual"} role here, so you will not be able to manage access or undo this yourself.`,
      action: "Remove me",
      run,
    });
  }

  async function transfer() {
    const lowers = owner !== null && me?.username === owner && !isInstanceAdmin;
    const ok = await send("owner", { owner: nextOwner });
    if (!ok) return;
    setTransferOpen(false);
    setNextOwner("");
    if (lowers) await reloadIfNoLongerAdmin();
  }

  const people = rows.length;

  return (
    <div className="flex flex-col">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color:var(--color-rule-soft)] px-4 py-2">
        <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">Access</h1>
        {!loading && (
          <>
            <span role="radiogroup" aria-label="Who can open this pipeline" className="flex rounded border border-[color:var(--color-rule)] p-0.5">
              {(
                [
                  ["members", "Members only"],
                  ["instance", "Everyone signed in"],
                ] as const
              ).map(([v, text]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visibility === v}
                  disabled={pending === "visibility"}
                  onClick={() => visibility !== v && void send("visibility", { visibility: v })}
                  data-testid={`visibility-${v}`}
                  className={`h-6 rounded-sm px-2.5 text-[12px] font-medium ${
                    visibility === v
                      ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]"
                      : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                  }`}
                >
                  {text}
                </button>
              ))}
            </span>
            <span className="text-[12px] text-[color:var(--color-ink-3)]" data-testid="access-summary">
              {people} {people === 1 ? "person" : "people"} can open this pipeline
            </span>
            <span className="flex items-center gap-1 text-[12px] text-[color:var(--color-ink-3)] md:ml-auto">
              {owner ? (
                <>
                  Owner <span className="font-medium text-[color:var(--color-ink)]">{owner}</span>
                </>
              ) : (
                <span className="text-[color:var(--color-amber-deep)]">No owner</span>
              )}
              {canTransfer && (
                <button type="button" onClick={() => setTransferOpen(true)} data-testid="transfer-owner-open" className={toolButton("h-6 px-1.5")}>
                  {owner ? "Transfer" : "Set owner"}
                </button>
              )}
            </span>
          </>
        )}
      </header>

      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-3 py-2 text-[12.5px] text-[color:var(--color-rose-deep)]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="p-4 text-[12.5px] text-[color:var(--color-ink-3)]">Loading…</p>
      ) : (
        <div className="max-w-[1000px] p-4">
          <div className="overflow-x-auto rounded border border-[color:var(--color-rule-soft)]">
            <table className="result-grid props-grid" data-testid="members-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="w-[130px]">Role here</th>
                  <th className="max-sm:hidden">From</th>
                  <th className="w-0" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-[color:var(--color-ink-4)]">
                      Nobody yet.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const fixed = r.source === "owner" || r.source === "instance-admin";
                  return (
                    <tr key={r.username} data-testid={`access-row-${r.username}`}>
                      <td>
                        <span className="text-[color:var(--color-ink)]">{r.displayName}</span>
                        {r.displayName !== r.username && <span className="ml-1.5 text-[color:var(--color-ink-4)]">{r.username}</span>}
                        {r.username === me?.username && <span className="ml-1.5 text-[11px] text-[color:var(--color-ink-4)]">you</span>}
                        <span className="block text-[11px] text-[color:var(--color-ink-4)] sm:hidden">{sourceLabel(r)}</span>
                      </td>
                      <td className="py-0.5">
                        {fixed ? (
                          <span className="pl-2 text-[color:var(--color-ink-2)]">admin</span>
                        ) : (
                          <select
                            aria-label={`Role for ${r.username} on this pipeline`}
                            value={r.role}
                            disabled={pending === `role:${r.username}`}
                            onChange={(e) => setRole(r, e.target.value as Role)}
                            className={toolInput()}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="text-[color:var(--color-ink-3)] max-sm:hidden">{sourceLabel(r)}</td>
                      <td className="whitespace-nowrap py-0.5 text-right">
                        {r.source === "grant" && (
                          <button
                            type="button"
                            disabled={pending === `revoke:${r.username}`}
                            onClick={() => removeGrant(r)}
                            data-testid={`revoke-${r.username}`}
                            title={visibility === "members" ? "Remove their access" : "Go back to their usual role"}
                            className={toolButton("h-6 px-1.5")}
                          >
                            {visibility === "members" ? "Remove" : "Reset"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {unlisted.length > 0 && (
                  <tr>
                    <td colSpan={4} className="py-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label="Account to give access to"
                          value={addUser}
                          onChange={(e) => setAddUser(e.target.value)}
                          data-testid="add-member-user"
                          className={toolInput()}
                        >
                          <option value="">Add a person…</option>
                          {unlisted.map((a) => (
                            <option key={a.username} value={a.username}>
                              {label(a)}, {a.role} elsewhere
                            </option>
                          ))}
                        </select>
                        <select aria-label="Role to grant" value={addRole} onChange={(e) => setAddRole(e.target.value as Role)} className={toolInput()}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={pending === "grant" || !addUser}
                          onClick={async () => {
                            if (await send("grant", { username: addUser, role: addRole })) setAddUser("");
                          }}
                          data-testid="add-member"
                          className={toolPrimary()}
                        >
                          Add
                        </button>
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={transferOpen} onClose={() => (pending === "owner" ? undefined : setTransferOpen(false))}>
        <h2 className="text-[15px] font-semibold text-[color:var(--color-ink)]">{owner ? "Transfer ownership" : "Set an owner"}</h2>
        <p className="mt-2 text-[13px] text-[color:var(--color-ink-2)]">
          The owner always has admin here.
          {owner && me?.username === owner && !isInstanceAdmin ? ` ${accessAfterTransfer()}` : ""}
        </p>
        <div className="mt-3">
          <Select
            label="Account to hand this pipeline to"
            value={nextOwner}
            onChange={(e) => setNextOwner(e.target.value)}
            data-testid="transfer-owner-user"
            className="w-full"
          >
            <option value="">Choose an account…</option>
            {accounts
              .filter((a) => a.username !== owner)
              .map((a) => (
                <option key={a.username} value={a.username}>
                  {label(a)}
                </option>
              ))}
          </Select>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending === "owner"} onClick={() => setTransferOpen(false)} className={ghostButtonClass()}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending === "owner" || !nextOwner}
            onClick={() => void transfer()}
            data-testid="transfer-owner"
            className={primaryButtonClass()}
          >
            {owner ? "Transfer" : "Set owner"}
          </button>
        </div>
      </Modal>

      <Modal open={confirming !== null} onClose={() => (pending ? undefined : setConfirming(null))}>
        <h2 className="text-[15px] font-semibold">{confirming?.title}</h2>
        <p className="mt-2 text-[13px] text-[color:var(--color-ink-2)]">{confirming?.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending !== null} onClick={() => setConfirming(null)} className={ghostButtonClass()}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending !== null}
            onClick={async () => {
              await confirming?.run();
              setConfirming(null);
            }}
            data-testid="confirm-own-access-change"
            className={primaryButtonClass()}
          >
            {confirming?.action}
          </button>
        </div>
      </Modal>
    </div>
  );
}
