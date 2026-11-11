// The rows of the Access page: everyone who can open a pipeline, with their
// role there and where that role comes from.

import type { Role } from "@/lib/auth/roles";

export interface Member {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface Account {
  username: string;
  displayName: string;
  role: Role;
}

/** What the members endpoint reports about a pipeline's access. */
export interface AccessState {
  visibility: "instance" | "members";
  owner: string | null;
  members: Member[];
}

export type AccessSource = "owner" | "instance-admin" | "grant" | "instance";

export interface AccessRow {
  username: string;
  displayName: string;
  /** The role the person has on this pipeline. */
  role: Role;
  source: AccessSource;
  /** The person's instance-wide role. */
  usual: Role;
}

const ORDER: Record<AccessSource, number> = { owner: 0, "instance-admin": 1, grant: 2, instance: 2 };

/**
 * Everyone who can open the pipeline: the owner, then instance admins, then
 * the rest by name. People without a grant are only included when the
 * pipeline is visible to everyone, since otherwise they cannot open it.
 */
export function accessRows(state: AccessState, accounts: Account[]): AccessRow[] {
  const rows: AccessRow[] = [];
  for (const a of accounts) {
    const grant = state.members.find((m) => m.username === a.username);
    const base = { username: a.username, displayName: a.displayName, usual: a.role };
    if (a.username === state.owner) rows.push({ ...base, role: "admin", source: "owner" });
    else if (a.role === "admin") rows.push({ ...base, role: "admin", source: "instance-admin" });
    else if (grant) rows.push({ ...base, role: grant.role, source: "grant" });
    else if (state.visibility === "instance") rows.push({ ...base, role: a.role, source: "instance" });
  }
  return rows.sort((a, b) => ORDER[a.source] - ORDER[b.source] || a.displayName.localeCompare(b.displayName));
}

export function sourceLabel(r: AccessRow): string {
  switch (r.source) {
    case "owner":
      return "Owner";
    case "instance-admin":
      return "Instance admin";
    case "grant":
      return r.role === r.usual ? "Granted here" : `Granted here, ${r.usual} elsewhere`;
    case "instance":
      return "Usual role";
  }
}
