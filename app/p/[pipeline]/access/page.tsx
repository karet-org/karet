"use client";

// Who may use this pipeline.
//
// Roles are instance-wide by default: everyone sees every pipeline at their own
// role. This page is for the exceptions, either a pipeline only some people
// should touch or a person who edits one pipeline but reads the rest.
//
// Admin-only, and admins always keep access: an access list that can lock the
// operator out of a pipeline is a way to lose a pipeline.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CARD,
  Radio,
  Select,
  ghostButtonClass,
  primaryButtonClass,
} from "@/components/ui/controls";
import Modal from "@/components/ui/Modal";
import { ROLES, type Role } from "@/lib/auth/roles";
import { useCan, useCurrentUser } from "@/lib/client/use-current-user";

interface Member {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
}

interface Account {
  username: string;
  displayName: string;
  role: Role;
}

/** What a read or a write reports back about this pipeline's access. */
interface AccessState {
  visibility: "instance" | "members";
  owner: string | null;
  members: Member[];
}

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

  const [visibility, setVisibility] = useState<"instance" | "members">("instance");
  const [members, setMembers] = useState<Member[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which control is mid-request, so one change disables that control, not the page.
  const [pending, setPending] = useState<string | null>(null);
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<Role>("viewer");
  const [nextOwner, setNextOwner] = useState("");
  const [confirming, setConfirming] = useState<Confirmation | null>(null);

  const apply = useCallback((state: AccessState) => {
    setVisibility(state.visibility);
    setMembers(state.members);
    setOwner(state.owner);
  }, []);

  // Only the first load shows a loading view; a change applies its own response.
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
  async function send(
    key: string,
    body: unknown,
    method: "PUT" | "DELETE" = "PUT",
    qs = "",
  ): Promise<boolean> {
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

  const roleOf = (username: string) => accounts.find((a) => a.username === username)?.role;

  // The owner always leads the list, whether or not they also hold a grant: their
  // admin comes from owning the pipeline, and a grant for them changes nothing.
  const ownerRow: Member | null = owner
    ? (members.find((m) => m.username === owner) ?? {
        userId: `owner:${owner}`,
        username: owner,
        displayName: accounts.find((a) => a.username === owner)?.displayName ?? owner,
        role: "admin",
      })
    : null;
  // Instance admins are admin on every pipeline, so a grant for one is left out
  // of the list. It only applies if they stop being an instance admin.
  const granted = members.filter((m) => m.username !== owner && roleOf(m.username) !== "admin");
  const rows = ownerRow ? [ownerRow, ...granted] : granted;

  // Leaves out the owner and instance admins, who already have admin here. Matches the server's rule.
  const unlisted = accounts.filter(
    (a) =>
      a.username !== owner &&
      a.role !== "admin" &&
      !members.some((m) => m.username === a.username),
  );
  // Matches the server's rule.
  const canTransfer = isInstanceAdmin || (owner !== null && me?.username === owner);

  /** What the caller keeps here once they are no longer the owner. */
  function accessAfterTransfer(): string {
    const grant = members.find((m) => m.username === me?.username);
    if (grant) return `You keep the ${grant.role} role your grant gives you here.`;
    if (visibility === "members") {
      return "You have no grant here and the pipeline is members only, so you will lose access to it.";
    }
    return `You have no grant here, so you will fall back to your ${me?.role ?? "usual"} role.`;
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">
        Access
      </h1>
      <p className="mt-1 max-w-[62ch] text-[13px] text-[color:var(--color-ink-3)]">
        Who may use this pipeline, and at what level. Admins always have full access.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-[color:var(--color-ink-3)]">Loading…</p>
      ) : (
        <>
          {/* A labelled radiogroup rather than fieldset/legend: a legend either cuts
              a notch in the card border or, floated, makes the options flow around
              it. This gives the same grouping to assistive tech with none of that. */}
          <section
            className={`mt-6 ${CARD}`}
            role="radiogroup"
            aria-labelledby="visibility-heading"
          >
            <h2
              id="visibility-heading"
              className="text-[14px] font-semibold text-[color:var(--color-ink)]"
            >
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
                detail="Hidden from everyone except the people listed below. New pipelines start here."
              />
              <Radio
                name="visibility"
                value="instance"
                checked={visibility === "instance"}
                disabled={pending === "visibility"}
                onChange={() => void send("visibility", { visibility: "instance" })}
                label="Everyone"
                detail="Anyone signed in sees this pipeline, at whatever role they hold."
              />
            </div>
          </section>

          <section className={`mt-5 ${CARD}`}>
            <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">
              People with access
            </h2>
            <p className="mt-1 max-w-[62ch] text-[12.5px] text-[color:var(--color-ink-3)]">
              A grant replaces that person&apos;s usual role here, so it can give them more
              or less than they have elsewhere.
            </p>

            {rows.length === 0 ? (
              <p className="mt-4 text-[12.5px] text-[color:var(--color-ink-4)]">
                {visibility === "members"
                  ? "Nobody listed yet, so only admins can reach this pipeline."
                  : "Nobody listed yet. Everyone uses the role they hold elsewhere."}
              </p>
            ) : (
              <table
                className="mt-4 w-full table-fixed border-collapse text-sm"
                data-testid="members-table"
              >
                {/* Fixed layout: adding or removing a row must not move the columns. */}
                <colgroup>
                  <col className="w-[200px]" />
                  <col className="w-[130px]" />
                  <col />
                </colgroup>
                <thead>
                  <tr className="border-b border-[color:var(--color-rule)] text-left text-[11px] text-[color:var(--color-ink-3)]">
                    <th className="pb-1.5 pr-3 font-medium">Person</th>
                    {/* Inset to the control's text, which is what rows line up on. */}
                    <th className="pb-1.5 pl-[11px] pr-3 font-medium">Role here</th>
                    <th className="pb-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr
                      key={m.userId}
                      className="border-b border-[color:var(--color-rule-soft)] last:border-b-0"
                    >
                      <td className="py-2 pr-3">
                        <span className="block truncate font-medium text-[color:var(--color-ink)]">
                          {m.displayName}
                        </span>
                        {m.displayName !== m.username ? (
                          <span className="block truncate text-[11.5px] text-[color:var(--color-ink-4)]">
                            {m.username}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        {m.username === owner ? (
                          // Admin here comes from owning it, not from a grant.
                          <span className="pl-[11px] text-[12.5px] text-[color:var(--color-ink-2)]">
                            owner
                          </span>
                        ) : (
                          <Select
                            label={`Role for ${m.username} on this pipeline`}
                            value={m.role}
                            disabled={pending === `role:${m.username}`}
                            onChange={(e) => {
                              const role = e.target.value as Role;
                              changeOwnAccess(m.username === me?.username && role !== "admin", {
                                title: `Change your own role to ${role}?`,
                                body: "You will no longer be an admin here, so you will not be able to manage access or undo this yourself.",
                                action: "Change my role",
                                run: () =>
                                  send(`role:${m.username}`, { username: m.username, role }),
                              });
                            }}
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
                        {m.username === owner ? null : (
                          <button
                            type="button"
                            disabled={pending === `revoke:${m.username}`}
                            onClick={() =>
                              changeOwnAccess(m.username === me?.username, {
                                title: "Remove your own access?",
                                body:
                                  visibility === "members"
                                    ? "This pipeline is members only, so you will lose access to it and cannot undo this yourself."
                                    : `You will fall back to your ${me?.role ?? "usual"} role here, so you will not be able to manage access or undo this yourself.`,
                                action: "Remove me",
                                run: () =>
                                  send(
                                    `revoke:${m.username}`,
                                    null,
                                    "DELETE",
                                    `?username=${encodeURIComponent(m.username)}`,
                                  ),
                              })
                            }
                            data-testid={`revoke-${m.username}`}
                            className={ghostButtonClass()}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {unlisted.length > 0 && (
              <div className="mt-5 border-t border-[color:var(--color-rule-soft)] pt-4">
                <p className="text-[12px] font-medium text-[color:var(--color-ink-2)]">
                  Give someone access
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select
                    label="Account to give access to"
                    value={addUser}
                    onChange={(e) => setAddUser(e.target.value)}
                    data-testid="add-member-user"
                  >
                    <option value="">Choose an account…</option>
                    {unlisted.map((a) => (
                      <option key={a.username} value={a.username}>
                        {label(a)}, {a.role} elsewhere
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Role to grant"
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as Role)}
                  >
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
                    Grant
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className={`mt-5 ${CARD}`}>
            <h2 className="text-[14px] font-semibold text-[color:var(--color-ink)]">Owner</h2>
            <p className="mt-1 max-w-[62ch] text-[12.5px] text-[color:var(--color-ink-3)]">
              {owner
                ? `${owner} keeps admin on this pipeline and cannot be removed from the list above. Hand it over to change that.`
                : `This pipeline has no owner, which happens when the owning account is deleted.${
                    canTransfer ? " Give it one." : ""
                  }`}
            </p>
            {canTransfer ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Select
                  label="Account to hand this pipeline to"
                  value={nextOwner}
                  onChange={(e) => setNextOwner(e.target.value)}
                  data-testid="transfer-owner-user"
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
                <button
                  type="button"
                  disabled={pending === "owner" || !nextOwner}
                  onClick={() =>
                    changeOwnAccess(owner !== null && me?.username === owner, {
                      title: `Transfer this pipeline to ${nextOwner}?`,
                      body: `${nextOwner} becomes the owner and keeps admin here. ${accessAfterTransfer()}`,
                      action: "Transfer ownership",
                      run: async () => {
                        const ok = await send("owner", { owner: nextOwner });
                        if (ok) setNextOwner("");
                        return ok;
                      },
                    })
                  }
                  data-testid="transfer-owner"
                  className={ghostButtonClass()}
                >
                  Transfer ownership
                </button>
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] text-[color:var(--color-ink-4)]">
                Only the owner or an instance admin can hand a pipeline over.
              </p>
            )}
          </section>
        </>
      )}

      <Modal open={confirming !== null} onClose={() => (pending ? undefined : setConfirming(null))}>
        <h2 className="text-lg font-semibold">{confirming?.title}</h2>
        <p className="mt-2 text-sm text-[color:var(--color-ink-2)]">{confirming?.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => setConfirming(null)}
            className={ghostButtonClass()}
          >
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
