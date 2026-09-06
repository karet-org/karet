import DashboardTopBar from "@/components/dashboard/DashboardTopBar";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pipeline: string; name: string }>;
}) {
  const { pipeline, name } = await params;
  return (
    <>
      <DashboardTopBar pipeline={pipeline} id={name} />
      {children}
    </>
  );
}
