import Link from "next/link";
import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { isNoSuchBucket } from "@/lib/config/s3-client";
import { listPipelines } from "@/lib/services/config-service";
import ImportButton from "@/components/layout/ImportButton";
import CreatePipelineButton from "@/components/layout/CreatePipelineButton";
import UserMenu from "@/components/layout/UserMenu";
import { KaretLogo, IconPackage } from "@/components/icons";

export const dynamic = "force-dynamic";

interface PipelineResult {
  pipelines: string[];
  bucketError?: string;
}

async function getPipelines(): Promise<PipelineResult> {
  try {
    const cfg = loadS3Config();
    const client = createS3Client(cfg);
    return { pipelines: await listPipelines(client, cfg) };
  } catch (err) {
    if (isNoSuchBucket(err)) {
      return {
        pipelines: [],
        bucketError: "S3 bucket does not exist. Create it first or check the S3_BUCKET environment variable.",
      };
    }
    return { pipelines: [] };
  }
}

function formatName(slug: string): string {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function Home() {
  const { pipelines, bucketError } = await getPipelines();

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KaretLogo size={36} />
          <h1 className="text-2xl font-bold text-gray-900">Karet</h1>
        </div>
        <UserMenu />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm text-gray-500">Your ETL pipelines</p>
        <div className="flex items-center gap-2">
          <ImportButton />
          <CreatePipelineButton />
        </div>
      </div>

      {bucketError ? (
        <div className="mt-8 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>S3 bucket not found.</strong> {bucketError}
        </div>
      ) : pipelines.length === 0 ? (
        <div className="mt-12 rounded-xl border-2 border-dashed border-gray-300 px-8 py-16 text-center">
          <div className="flex justify-center text-gray-300"><IconPackage size={48} /></div>
          <h2 className="mt-4 text-lg font-semibold text-gray-700">No pipelines yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            Click <span className="font-semibold text-gray-700">+ New pipeline</span> above to create one from a template,
            or use <span className="font-semibold text-gray-700">Import pipeline</span> to upload an exported{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">.zip</code>.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((slug) => (
            <Link
              key={slug}
              href={`/p/${slug}/graph`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-orange-300 hover:shadow-md"
            >
              <div className="flex h-32 items-center justify-center rounded-lg bg-gradient-to-br from-orange-50 to-amber-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/p/${slug}/preview`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="mt-4 text-base font-semibold text-gray-900 group-hover:text-orange-600">
                {formatName(slug)}
              </div>
              <div className="mt-1 text-xs text-gray-400">{slug}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
