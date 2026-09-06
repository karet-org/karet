import { notFound } from "next/navigation";
import { createS3Client, loadS3Config, pipelineS3Config } from "@/lib/config/s3-client";
import { getDashboardV2 } from "@/lib/services/config-service";
import DashboardView from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";

export default async function PipelineDashboardPage({
  params,
}: {
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = await params;
  const cfg = pipelineS3Config(loadS3Config(), pipeline);
  const client = createS3Client(cfg);

  const dashboard = await getDashboardV2(client, cfg, name);
  if (!dashboard) notFound();

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1400px] p-3 sm:p-4 lg:p-6">
        {dashboard.config === null ? (
          <div
            role="alert"
            className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
          >
            <strong className="font-semibold">This dashboard&apos;s config does not validate.</strong>{" "}
            Open the editor to fix it.
          </div>
        ) : (
          <DashboardView pipeline={pipeline} id={name} config={dashboard.config} />
        )}
      </div>
    </main>
  );
}
