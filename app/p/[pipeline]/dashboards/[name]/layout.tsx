import { createS3Client, loadS3Config, pipelineS3Config } from "@/lib/config/s3-client";
import {
  getDashboard,
  getDraftDashboard,
} from "@/lib/services/config-service";
import DashboardTopBar from "@/components/dashboard/DashboardTopBar";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = await params;
  const cfg = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(cfg);

  // Title: published name, else draft name, else the id.
  let title = name;
  let isDraft = false;
  const published = await getDashboard(client, cfg, name).catch(() => null);
  if (published) {
    title = published.name?.trim() || name;
  } else {
    const draft = await getDraftDashboard(client, cfg, name).catch(() => null);
    if (draft !== null) {
      isDraft = true;
      try {
        const parsed = JSON.parse(draft) as { name?: string };
        title = parsed.name?.trim() || name;
      } catch {
        // Unparseable draft keeps the id as its title.
      }
    }
  }

  return (
    <>
      <DashboardTopBar pipeline={pipeline} id={name} name={title} isDraft={isDraft} />
      {children}
    </>
  );
}
