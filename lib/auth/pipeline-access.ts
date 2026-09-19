// What a person may do to a particular pipeline.
//
// The instance role (viewer / editor / admin) is the default. A pipeline can
// narrow or widen it for one person with a membership row, and can hide itself
// from everyone who is not a member.
//
// Resolution order, and the reasoning:
//
//   1. Instance admins are admin everywhere. An access list that can lock the
//      operator out of a pipeline is a way to lose a pipeline.
//   2. An explicit membership row wins. It is the more specific statement, and
//      it has to be able to narrow — "an editor who may only read finance" is the
//      whole reason this exists.
//   3. Otherwise the instance role applies, unless the pipeline is `members`
//      only, in which case there is no access at all.
//
// Node runtime only.

import { query, queryOne } from "@/lib/db";
import { isRole, type Role } from "@/lib/auth/roles";
import type { Principal } from "@/lib/auth/service-token";

export type Visibility = "instance" | "members";

export interface Member {
  userId: string;
  username: string;
  role: Role;
  grantedAt: string;
}

/** Null means no access at all: the pipeline is members-only and they are not one. */
export type EffectiveRole = Role | null;

interface AccessInputs {
  visibility: Visibility;
  /** The caller's membership role for this pipeline, if any. */
  memberRole: Role | null;
}

/**
 * Pure so the rules can be tested without a database, which matters more here
 * than anywhere else in the app.
 */
export function resolveEffectiveRole(
  principal: Pick<Principal, "role" | "service">,
  access: AccessInputs,
): EffectiveRole {
  // The service token is the machine identity; it is already admin-equivalent
  // and nothing grants it per-pipeline membership.
  if (principal.service || principal.role === "admin") return "admin";
  if (access.memberRole) return access.memberRole;
  if (access.visibility === "members") return null;
  return principal.role;
}

/** Look up the inputs and resolve, for one pipeline. */
export async function effectiveRoleFor(
  principal: Principal,
  pipeline: string,
  userId: string | null,
): Promise<EffectiveRole> {
  if (principal.service || principal.role === "admin") return "admin";

  const row = await queryOne<{ visibility: Visibility; member_role: string | null }>(
    `SELECT p.visibility,
            (SELECT m.role FROM pipeline_members m
              WHERE m.pipeline = p.slug AND m.user_id = $2) AS member_role
       FROM pipelines p
      WHERE p.slug = $1`,
    [pipeline, userId],
  );
  // An unknown pipeline is not an access decision; let the route 404 on its own.
  if (!row) return principal.role;

  return resolveEffectiveRole(principal, {
    visibility: row.visibility,
    memberRole: isRole(row.member_role) ? row.member_role : null,
  });
}

/**
 * Slugs a user may see, for list endpoints.
 *
 * One query rather than resolving per pipeline: the landing page would otherwise
 * make a round trip per card.
 */
export async function visiblePipelineSlugs(
  principal: Principal,
  userId: string | null,
): Promise<string[] | "all"> {
  if (principal.service || principal.role === "admin") return "all";
  const rows = await query<{ slug: string }>(
    `SELECT p.slug
       FROM pipelines p
       LEFT JOIN pipeline_members m ON m.pipeline = p.slug AND m.user_id = $1
      WHERE p.archived_at IS NULL
        AND (p.visibility = 'instance' OR m.user_id IS NOT NULL)`,
    [userId],
  );
  return rows.map((r) => r.slug);
}

export async function listMembers(pipeline: string): Promise<Member[]> {
  const rows = await query<{
    user_id: string;
    username: string | null;
    role: string;
    granted_at: Date;
  }>(
    `SELECT m.user_id, u.username, m.role, m.granted_at
       FROM pipeline_members m
       JOIN "user" u ON u.id = m.user_id
      WHERE m.pipeline = $1
      ORDER BY u.username`,
    [pipeline],
  );
  return rows.flatMap((r) =>
    r.username && isRole(r.role)
      ? [
          {
            userId: r.user_id,
            username: r.username,
            role: r.role,
            grantedAt: r.granted_at.toISOString(),
          },
        ]
      : [],
  );
}

export async function grantMembership(
  pipeline: string,
  userId: string,
  role: Role,
  grantedBy: string | null,
): Promise<void> {
  await query(
    `INSERT INTO pipeline_members (pipeline, user_id, role, granted_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pipeline, user_id)
       DO UPDATE SET role = $3, granted_by = $4, granted_at = now()`,
    [pipeline, userId, role, grantedBy],
  );
}

export async function revokeMembership(pipeline: string, userId: string): Promise<void> {
  await query(`DELETE FROM pipeline_members WHERE pipeline = $1 AND user_id = $2`, [
    pipeline,
    userId,
  ]);
}

export async function getVisibility(pipeline: string): Promise<Visibility | null> {
  const row = await queryOne<{ visibility: Visibility }>(
    `SELECT visibility FROM pipelines WHERE slug = $1`,
    [pipeline],
  );
  return row?.visibility ?? null;
}

export async function setVisibility(pipeline: string, visibility: Visibility): Promise<void> {
  await query(`UPDATE pipelines SET visibility = $2 WHERE slug = $1`, [pipeline, visibility]);
}
