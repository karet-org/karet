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
import { CARD, Radio, Select, ghostButtonClass, primaryButtonClass } from "@/components/ui/controls";
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
    <div className="mx-auto max-w-3xl px-8 py-8 max-sm:px-4">
      <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">Access</h1>

      {error && (
        <div role="alert" className="mt-5 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[color:var(--color-ink-3)]">Loading…</p>
      ) : (
        <>
          <section className={`mt-6 ${CARD}`} role="radiogroup" aria-labelledby="visibility-heading">
            <h2 id="visibility-heading" className="text-[14px] font-semibold text-[color:var(--color-ink)]">
              Visibility
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              <Radio
                name="visibility"
                value="members"
                checked={visibility === "members"}
                disabled={pending === "visibility"}
                onChange={() => void send("visibility", { visibility: "members" })}
                label="Members only"
                detail="Only the people listed below can open it."
              />
              <Radio
                name="visibility"
                value="instance"
                checked={visibility === "instance"}
                disabled={pending === "visibility"}
                onChange={() => void send("visibility", { visibility: "instance" })}
                label="Everyone signed in"
                detail="Everyone can open it at their usual role, unless a grant below says otherwise."
              />
            </div>
          </section>

          <section className={`mt-5 ${CARD}`}>
            <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">
              People with access <span className="font-normal text-[color:var(--color-ink-4)]" data-testid="access-summary">{people}</span>
            </h2>

            <table className="mt-3 w-full table-fixed border-collapse text-sm" data-testid="members-table">
              <colgroup>
                <col />
                <col className="w-[120px]" />
                <col className="w-[84px]" />
              </colgroup>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-[12.5px] text-[color:var(--color-ink-4)]">
                      Nobody yet.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const fixed = r.source === "owner" || r.source === "instance-admin";
                  return (
                    <tr key={r.username} data-testid={`access-row-${r.username}`} className="h-[54px] border-b border-[color:var(--color-rule-soft)] last:border-b-0">
                      <td className="pr-3">
                        <span className="block truncate font-medium text-[color:var(--color-ink)]">
                          {r.displayName}
                          {r.displayName !== r.username && <span className="ml-1.5 font-normal text-[color:var(--color-ink-4)]">{r.username}</span>}
                          {r.username === me?.username && <span className="ml-1.5 text-[11.5px] font-normal text-[color:var(--color-ink-4)]">you</span>}
                        </span>
                        <span className="block truncate text-[11.5px] text-[color:var(--color-ink-4)]">{sourceLabel(r)}</span>
                      </td>
                      <td className="pr-3">
                        {fixed ? (
                          <span className="pl-[11px] text-[12.5px] text-[color:var(--color-ink-2)]">admin</span>
                        ) : (
                          <Select
                            label={`Role for ${r.username} on this pipeline`}
                            value={r.role}
                            disabled={pending === `role:${r.username}`}
                            onChange={(e) => setRole(r, e.target.value as Role)}
                            className="w-[110px]"
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </Select>
                        )}
                      </td>
                      <td className="text-right">
                        {r.source === "grant" && (
                          <button
                            type="button"
                            disabled={pending === `revoke:${r.username}`}
                            onClick={() => removeGrant(r)}
                            data-testid={`revoke-${r.username}`}
                            title={visibility === "members" ? "Remove their access" : "Go back to their usual role"}
                            className={ghostButtonClass()}
                          >
                            {visibility === "members" ? "Remove" : "Reset"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {unlisted.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-rule-soft)] pt-4">
                <Select
                  label="Account to give access to"
                  value={addUser}
                  onChange={(e) => setAddUser(e.target.value)}
                  data-testid="add-member-user"
                  className="min-w-[14rem]"
                >
                  <option value="">Add a person…</option>
                  {unlisted.map((a) => (
                    <option key={a.username} value={a.username}>
                      {label(a)}, {a.role} elsewhere
                    </option>
                  ))}
                </Select>
                <Select label="Role to grant" value={addRole} onChange={(e) => setAddRole(e.target.value as Role)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  disabled={pending === "grant" || !addUser}
                  onClick={async () => {
                    if (await send("grant", { username: addUser, role: addRole })) setAddUser("");
                  }}
                  data-testid="add-member"
                  className={primaryButtonClass()}
                >
                  Add
                </button>
              </div>
            )}
          </section>

          <section className={`mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 ${CARD}`}>
            <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">Owner</h2>
            <span className="text-[13px] text-[color:var(--color-ink-2)]" data-testid="owner-name">
              {owner ?? <span className="text-[color:var(--color-amber-deep)]">None</span>}
            </span>
            {canTransfer && (
              <button type="button" onClick={() => setTransferOpen(true)} data-testid="transfer-owner-open" className={ghostButtonClass("ml-auto")}>
                {owner ? "Transfer ownership" : "Set owner"}
              </button>
            )}
          </section>
        </>
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
