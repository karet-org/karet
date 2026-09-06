import { notFound } from "next/navigation";
import { fetchDashboardV2 } from "@/lib/services/dashboard-fetch";
import DashboardView from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";

export default async function PipelineDashboardPage({
  params,
}: {
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = await params;
  const dashboard = await fetchDashboardV2(pipeline, name, false);
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
          <DashboardView
            key={`${pipeline}/${name}`}
            pipeline={pipeline}
            id={name}
            config={dashboard.config}
          />
        )}
      </div>
    </main>
  );
}
