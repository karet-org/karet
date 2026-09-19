"use client";

// Who may use this pipeline.
//
// Instance roles are the default: everyone sees every pipeline at their own role.
// This page is for the cases where that is wrong — a pipeline only some people
// should touch, or a person who edits one pipeline but reads the rest.
//
// Admin-only, and instance admins always keep access: an access list that can
// lock the operator out of a pipeline is a way to lose a pipeline.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
      <p className="mt-1 text-[13px] text-[color:var(--color-ink-3)]">
        Who may use this pipeline, and at what level. Instance admins always have
        full access regardless of what is listed here.
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
          <section className="mt-6 rounded-[10px] border border-[color:var(--color-rule)] p-4">
            <h2 className="text-[13.5px] font-medium text-[color:var(--color-ink)]">Visibility</h2>
            <div className="mt-3 flex flex-col gap-2.5">
              {(
                [
                  ["instance", "Everyone", "Any signed-in account sees this pipeline at its own instance role."],
                  ["members", "Members only", "Hidden from everyone except the people listed below."],
                ] as const
              ).map(([value, label, detail]) => (
                <label key={value} className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === value}
                    disabled={busy}
                    onChange={() => void send({ visibility: value })}
                    data-testid={`visibility-${value}`}
                    className="mt-[0.2rem]"
                  />
                  <span>
                    <span className="block text-[13px] text-[color:var(--color-ink)]">{label}</span>
                    <span className="block text-[12px] text-[color:var(--color-ink-3)]">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-[10px] border border-[color:var(--color-rule)] p-4">
            <h2 className="text-[13.5px] font-medium text-[color:var(--color-ink)]">
              People with explicit access
            </h2>
            <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
              A grant replaces that person&apos;s instance role here, so it can widen
              or narrow what they may do.
            </p>

            {members.length === 0 ? (
              <p className="mt-3 text-[13px] text-[color:var(--color-ink-3)]">
                Nobody listed. {visibility === "members"
                  ? "Only instance admins can reach this pipeline."
                  : "Everyone uses their instance role."}
              </p>
            ) : (
              <table className="mt-3 w-full border-collapse text-sm" data-testid="members-table">
                <tbody>
                  {members.map((m) => (
                    <tr key={m.userId} className="border-b border-[color:var(--color-rule-soft)] last:border-b-0">
                      <td className="py-2 pr-3 font-medium text-[color:var(--color-ink)]">{m.username}</td>
                      <td className="py-2 pr-3">
                        <select
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => void send({ username: m.username, role: e.target.value })}
                          className="rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1 text-[12.5px]"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void send(null, "DELETE", `?username=${encodeURIComponent(m.username)}`)}
                          data-testid={`revoke-${m.username}`}
                          className="rounded px-2 py-1 text-xs font-medium text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink-2)] disabled:opacity-50"
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  value={addUser}
                  onChange={(e) => setAddUser(e.target.value)}
                  data-testid="add-member-user"
                  className="rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1.5 text-[12.5px]"
                >
                  <option value="">Choose an account…</option>
                  {unlisted.map((a) => (
                    <option key={a.username} value={a.username}>
                      {a.username} ({a.role})
                    </option>
                  ))}
                </select>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as Role)}
                  className="rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1.5 text-[12.5px]"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !addUser}
                  onClick={() => {
                    void send({ username: addUser, role: addRole });
                    setAddUser("");
                  }}
                  data-testid="add-member"
                  className="rounded-md bg-[color:var(--color-carrot)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
                >
                  Grant
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
