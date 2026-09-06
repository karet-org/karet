import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { getUiSettings } from "@/lib/services/ui-settings";
import LandingRail from "@/components/layout/LandingRail";
import { SearchProvider } from "@/components/layout/LandingSearch";
import LakeBrowser from "@/components/lake/LakeBrowser";

export const dynamic = "force-dynamic";

export default async function LakePage() {
  const settings = await getUiSettings(createS3Client(), loadS3Config()).catch(
    () => ({ displayName: "", workspaceName: "", starred: [] }),
  );

  return (
    <SearchProvider>
      <div className="flex h-screen overflow-hidden">
        <LandingRail
          displayName={settings.displayName}
          workspaceName={settings.workspaceName}
          starred={settings.starred}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[52px] shrink-0 items-center border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 sm:px-6">
            <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">
              Data lake
            </h1>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6">
            <LakeBrowser />
          </div>
        </main>
      </div>
    </SearchProvider>
  );
}
