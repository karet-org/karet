import { Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useParams } from "@/lib/client/navigation";
import DashboardTopBar from "@/components/dashboard/DashboardTopBar";
import { validateDashboardV2, type DashboardConfigV2 } from "@/lib/types/dashboard-v2";

export interface DashboardData {
  /** The published dashboard: its config, `invalid`, or null when only a draft exists. */
  published: DashboardConfigV2 | "invalid" | null;
  title: string;
  isDraft: boolean;
}

async function fetchBody(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Response(await res.text(), { status: res.status });
  return res.text();
}

/** The published dashboard and the title to show: published name, else draft name, else the id. */
export async function dashboardLoader({ params }: LoaderFunctionArgs): Promise<DashboardData> {
  const base = `/api/p/${params.pipeline}/dashboards/${params.name}`;
  const name = params.name!;
  const body = await fetchBody(base);
  if (body !== null) {
    const result = validateDashboardV2(body);
    const config = result.ok ? result.config : "invalid";
    return { published: config, title: (result.ok && result.config.name?.trim()) || name, isDraft: false };
  }
  const draft = await fetchBody(`${base}?draft=1`);
  if (draft === null) return { published: null, title: name, isDraft: false };
  const result = validateDashboardV2(draft);
  return { published: null, title: (result.ok && result.config.name?.trim()) || name, isDraft: true };
}

export default function DashboardLayout() {
  const { title, isDraft } = useLoaderData<DashboardData>();
  const { pipeline, name } = useParams<{ pipeline: string; name: string }>();
  return (
    <>
      <DashboardTopBar pipeline={pipeline} id={name} name={title} isDraft={isDraft} />
      <Outlet />
    </>
  );
}
