import TopNav from "@/components/layout/TopNav";

export default async function PipelineLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ pipeline: string }>;
}) {
  const { pipeline } = await params;
  const s3ConsoleUrl = process.env.S3_CONSOLE_URL || null;
  return (
    <>
      <TopNav pipeline={pipeline} s3ConsoleUrl={s3ConsoleUrl} />
      {children}
    </>
  );
}
