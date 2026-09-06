import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { getUiSettings } from "@/lib/services/ui-settings";
import LandingRail, { MobileRailToggle } from "@/components/layout/LandingRail";
import { SearchProvider } from "@/components/layout/LandingSearch";
import SettingsForm from "@/components/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getUiSettings(createS3Client(), loadS3Config()).catch(
    () => ({ displayName: "", workspaceName: "", starred: [] }),
  );

  return (
    <SearchProvider>
      <div className="flex min-h-screen">
        <LandingRail
          displayName={settings.displayName}
          workspaceName={settings.workspaceName}
          starred={settings.starred}
        />
        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-20 flex h-[52px] items-center border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 sm:px-6">
            <MobileRailToggle
              displayName={settings.displayName}
              workspaceName={settings.workspaceName}
              starred={settings.starred}
            />
            <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">
              Settings
            </h1>
          </div>
          <div className="px-4 py-5 sm:px-6">
            <SettingsForm />
          </div>
        </main>
      </div>
    </SearchProvider>
  );
}
