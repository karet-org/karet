import { useLoaderData } from "react-router";
import AccountPanel from "@/components/settings/AccountPanel";
import SettingsForm from "@/components/settings/SettingsForm";
import UsersPanel from "@/components/settings/UsersPanel";
import { LandingShell, type RailData } from "./Landing";

export default function SettingsPage() {
  const rail = useLoaderData<RailData>();
  return (
    <LandingShell rail={rail} title="Settings">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
          <AccountPanel />
          <SettingsForm />
          <UsersPanel />
        </div>
      </div>
    </LandingShell>
  );
}
