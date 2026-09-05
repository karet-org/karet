import SideNav from "@/components/layout/SideNav";

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
    <div className="md:flex">
      <SideNav pipeline={pipeline} s3ConsoleUrl={s3ConsoleUrl} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
