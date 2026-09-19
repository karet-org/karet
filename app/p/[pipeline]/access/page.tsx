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
import type { Role } from "@/lib/auth/roles";
import { useCan, useCurrentUser } from "@/lib/client/use-current-user";

interface Member {
  userId: string;
  username: string;
  role: Role;
  grantedAt: string;
}

interface Account {
  username: string;
  role: Role;
}

/** What a read or a write reports back about this pipeline's access. */
interface AccessState {
  visibility: "instance" | "members";
  owner: string | null;
  members: Member[];
}

const ROLES: Role[] = ["viewer", "editor", "admin"];

export default function AccessPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const [visibility, setVisibility] = useState<"instance" | "members">("instance");
  const [members, setMembers] = useState<Member[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [nextOwner, setNextOwner] = useState("");
  const me = useCurrentUser();
  const isInstanceAdmin = useCan("admin");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which control is mid-request, so one change disables that control rather than
  // the whole page. Nothing else here is a reason to stop reading.
  const [pending, setPending] = useState<string | null>(null);
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<Role>("viewer");

  const apply = useCallback((body: AccessState) => {
    setVisibility(body.visibility);
    setMembers(body.members ?? []);
    setOwner(body.owner ?? null);
  }, []);

  // The only load that shows a loading view is the first one. A change already
  // knows what it did, so redrawing the page from scratch afterwards threw the
  // reader back to "Loading…" for no new information.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/p/${pipeline}/members`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
        if (cancelled) return;
        apply(body);
        setAccounts(body.accounts ?? []);
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

  /**
   * Send one change and take the resulting state from its response, so the page
   * updates in place: the row changes, nothing else moves.
   */
  async function send(
    key: string,
    body: unknown,
    method: "PUT" | "DELETE" = "PUT",
    qs = "",
  ) {
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  const unlisted = accounts.filter((a) => !members.some((m) => m.username === a.username));
  // Matches the server's rule: the owner's decision, or the operator's when the
  // owner has gone.
  const canTransfer = isInstanceAdmin || (me?.username !== undefined && me.username === owner);

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

            {members.length === 0 ? (
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
                    {/* Inset to the control's text: the reader compares the words
                        in this column, not the edges of the boxes around them. */}
                    <th className="pb-1.5 pl-[11px] pr-3 font-medium">Role here</th>
                    <th className="pb-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.userId}
                      className="border-b border-[color:var(--color-rule-soft)] last:border-b-0"
                    >
                      <td className="py-2 pr-3 font-medium text-[color:var(--color-ink)]">
                        {m.username}
                      </td>
                      <td className="py-2 pr-3">
                        {m.username === owner ? (
                          <span className="pl-[11px] text-[12.5px] text-[color:var(--color-ink-2)]">
                            admin
                          </span>
                        ) : (
                          <Select
                            label={`Role for ${m.username} on this pipeline`}
                            value={m.role}
                            disabled={pending === `role:${m.username}`}
                            onChange={(e) =>
                              void send(`role:${m.username}`, {
                                username: m.username,
                                role: e.target.value,
                              })
                            }
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
                        {m.username === owner ? (
                          // Their access comes from having created the pipeline, not
                          // from this list, so a control here would do nothing.
                          <span className="text-[11.5px] text-[color:var(--color-ink-4)]">
                            Owner
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={pending === `revoke:${m.username}`}
                            onClick={() =>
                              void send(
                                `revoke:${m.username}`,
                                null,
                                "DELETE",
                                `?username=${encodeURIComponent(m.username)}`,
                              )
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
                        {a.username} ({a.role} elsewhere)
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
                    onClick={() => {
                      void send("grant", { username: addUser, role: addRole });
                      setAddUser("");
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
                : "This pipeline has no owner, which happens when the owning account is deleted. Give it one."}
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
                        {a.username}
                      </option>
                    ))}
                </Select>
                <button
                  type="button"
                  disabled={pending === "owner" || !nextOwner}
                  onClick={() => {
                    void send("owner", { owner: nextOwner });
                    setNextOwner("");
                  }}
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
    </div>
  );
}
