import { useLoaderData } from "react-router";
import LakeBrowser from "@/components/lake/LakeBrowser";
import { LandingShell, type RailData } from "./Landing";

export default function LakePage() {
  const rail = useLoaderData<RailData>();
  return (
    <LandingShell rail={rail} title="Data lake">
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6">
        <LakeBrowser />
      </div>
    </LandingShell>
  );
}
