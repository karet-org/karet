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

const ROLES: Role[] = ["viewer", "editor", "admin"];

export default function AccessPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const [visibility, setVisibility] = useState<"instance" | "members">("instance");
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addUser, setAddUser] = useState("");
  const [addRole, setAddRole] = useState<Role>("viewer");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/members`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setVisibility(body.visibility);
      setMembers(body.members ?? []);
      setAccounts(body.accounts ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(body: unknown, method: "PUT" | "DELETE" = "PUT", qs = "") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/members${qs}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify(body) : undefined,
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.message || parsed.error || `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unlisted = accounts.filter((a) => !members.some((m) => m.username === a.username));

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
                value="instance"
                checked={visibility === "instance"}
                disabled={busy}
                onChange={() => void send({ visibility: "instance" })}
                label="Everyone"
                detail="Anyone signed in sees this pipeline, at whatever role they hold."
              />
              <Radio
                name="visibility"
                value="members"
                checked={visibility === "members"}
                disabled={busy}
                onChange={() => void send({ visibility: "members" })}
                label="Members only"
                detail="Hidden from everyone except the people listed below."
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
              <table className="mt-4 w-full border-collapse text-sm" data-testid="members-table">
                <thead>
                  <tr className="border-b border-[color:var(--color-rule)] text-left text-[11px] uppercase tracking-[0.05em] text-[color:var(--color-ink-3)]">
                    <th className="pb-1.5 pr-3 font-medium">Person</th>
                    <th className="pb-1.5 pr-3 font-medium">Role here</th>
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
                        <Select
                          label={`Role for ${m.username} on this pipeline`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => void send({ username: m.username, role: e.target.value })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void send(null, "DELETE", `?username=${encodeURIComponent(m.username)}`)
                          }
                          data-testid={`revoke-${m.username}`}
                          className={ghostButtonClass()}
                        >
                          Remove
                        </button>
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
                    disabled={busy || !addUser}
                    onClick={() => {
                      void send({ username: addUser, role: addRole });
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
        </>
      )}
    </div>
  );
}
