import TopNav from "@/components/layout/TopNav";

export default async function PipelineLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pipeline: string }>;
}) {
  const { pipeline } = await params;
  return (
    <>
      <TopNav pipeline={pipeline} />
      {children}
    </>
  );
}
