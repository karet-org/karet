// Roles. The browser code imports this too, so no Node imports here.

export const ROLES = ["viewer", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Increasing privilege, so `rank(a) >= rank(b)` answers "may a do b's work?". */
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least as privileged as `required`. */
export function roleAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}
