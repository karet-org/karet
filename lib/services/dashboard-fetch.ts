// Request-scoped dashboard config fetch, shared by the route layout
// (top bar identity) and the page so navigation costs one S3 GET.

import { cache } from "react";
import { createS3Client, loadS3Config, pipelineS3Config } from "@/lib/config/s3-client";
import { getDashboardV2, type DashboardV2WithBody } from "@/lib/services/config-service";

export const fetchDashboardV2 = cache(
  async (
    pipeline: string,
    name: string,
    draft: boolean,
  ): Promise<DashboardV2WithBody | null> => {
    const cfg = pipelineS3Config(loadS3Config(), pipeline);
    const client = createS3Client(cfg);
    return getDashboardV2(client, cfg, name, { draft });
  },
);
