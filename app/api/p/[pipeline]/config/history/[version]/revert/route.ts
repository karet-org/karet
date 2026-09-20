import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { findUserByUsername } from "@/lib/auth/users";
import { getVersion } from "@/lib/services/pipeline-store";
import { publishConfig } from "@/lib/services/config-publish";

export const dynamic = "force-dynamic";

/**
 * Restore a saved version by writing it forward as a new one, rather than
 * winding the history back. Reverting is itself a change worth attributing, and
 * a revert you regret is then just another revert.
 */
async function handlePost(
  _request: Request,
  context: { params: Promise<{ pipeline: string; version: string }> },
  principal: Principal,
) {
  const { pipeline, version } = await context.params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  const entry = await getVersion(pipeline, n);
  if (!entry) return NextResponse.json({ error: "version_not_found" }, { status: 404 });

  const author = principal.service ? null : await findUserByUsername(principal.username);
  const published = await publishConfig(
    pipeline,
    entry.config,
    { id: author?.id ?? null, name: principal.username },
    `reverted to v${n}`,
  );
  if (!published.ok) {
    return NextResponse.json({ ok: false, error: published.message }, { status: published.status });
  }
  return NextResponse.json({ ok: true, version: published.value.version, revertedFrom: n });
}

export const POST = withRole(handlePost);
