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
    // Fixed-height shell: the content pane scrolls, not the body.
    // (sticky is defeated by the body's overflow-x: hidden.)
    <div className="md:flex md:h-screen md:overflow-hidden">
      <SideNav pipeline={pipeline} />
      <div className="min-w-0 flex-1 md:overflow-y-auto">{children}</div>
    </div>
  );
}
