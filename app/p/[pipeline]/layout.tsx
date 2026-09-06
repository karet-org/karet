import SideNav from "@/components/layout/SideNav";

export default async function PipelineLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pipeline: string }>;
}) {
  const { pipeline } = await params;
  return (
    <div className="md:flex">
      <SideNav pipeline={pipeline} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
