import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { getUiSettings, starredListings } from "@/lib/services/ui-settings";
import LandingRail, { MobileRailToggle } from "@/components/layout/LandingRail";
import { SearchProvider } from "@/components/layout/LandingSearch";
import AccountPanel from "@/components/settings/AccountPanel";
import SettingsForm from "@/components/settings/SettingsForm";
import UsersPanel from "@/components/settings/UsersPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const client = createS3Client();
  const config = loadS3Config();
  const settings = await getUiSettings(client, config).catch(
    () => ({ workspaceName: "", starred: [] }),
  );
  const starred = await starredListings(settings.starred).catch(() => []);

  return (
    <SearchProvider>
      <div className="flex h-screen overflow-hidden">
        <LandingRail
          workspaceName={settings.workspaceName}
          starred={starred}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[52px] shrink-0 items-center border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 sm:px-6">
            <MobileRailToggle
              workspaceName={settings.workspaceName}
              starred={starred}
            />
            <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">
              Settings
            </h1>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
              <AccountPanel />
              <SettingsForm />
              <UsersPanel />
            </div>
          </div>
        </main>
      </div>
    </SearchProvider>
  );
}
