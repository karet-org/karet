import { useRouteLoaderData } from "react-router";
import DashboardView from "@/components/dashboard/DashboardView";
import NotFound from "@/pages/NotFound";
import { useParams } from "@/lib/client/navigation";
import type { DashboardData } from "./Layout";

export default function PipelineDashboardPage() {
  const { pipeline, name } = useParams<{ pipeline: string; name: string }>();
  const { published } = useRouteLoaderData("dashboard") as DashboardData;
  if (published === null) return <NotFound />;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1400px] p-3 sm:p-4 lg:p-6">
        {published === "invalid" ? (
          <div
            role="alert"
            className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
          >
            <strong className="font-semibold">This dashboard&apos;s config does not validate.</strong>{" "}
            Open the editor to fix it.
          </div>
        ) : (
          <DashboardView key={`${pipeline}/${name}`} pipeline={pipeline} id={name} config={published} />
        )}
      </div>
    </main>
  );
}
