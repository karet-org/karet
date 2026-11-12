import { withRole } from "@/lib/auth/guard";
import type { Principal } from "@/lib/auth/service-token";
import { pipelineOverview } from "@/lib/services/pipeline-overview";

/** The landing page's pipeline cards, for the pipelines the caller can see. */
async function handleGet(_request: Request, _context: unknown, principal: Principal) {
  return Response.json(await pipelineOverview(principal));
}

export const GET = withRole(handleGet);
