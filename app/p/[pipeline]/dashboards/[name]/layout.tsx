import { fetchDashboardV2 } from "@/lib/services/dashboard-fetch";
import DashboardTopBar from "@/components/dashboard/DashboardTopBar";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = await params;

  // Title: published name, else draft name, else the id.
  let title = name;
  let isDraft = false;
  const published = await fetchDashboardV2(pipeline, name, false).catch(() => null);
  if (published) {
    title = published.config?.name?.trim() || name;
  } else {
    const draft = await fetchDashboardV2(pipeline, name, true).catch(() => null);
    if (draft !== null) {
      isDraft = true;
      title = draft.config?.name?.trim() || name;
    }
  }

  return (
    <>
      <DashboardTopBar pipeline={pipeline} id={name} name={title} isDraft={isDraft} />
      {children}
    </>
  );
}
