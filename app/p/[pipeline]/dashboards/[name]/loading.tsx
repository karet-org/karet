// Shown instantly on navigation while the dashboard config loads. The
// config isn't known yet, so this is a generic dashboard-shaped frame;
// DashboardView's config-derived skeletons take over once it arrives.

export default function DashboardLoading() {
  return (
    <main className="min-h-screen" aria-busy>
      <div className="mx-auto max-w-[1400px] space-y-4 p-3 sm:p-4 lg:p-6">
        <div className="skeleton h-[58px] rounded-[13px]" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-[76px] rounded-[13px]" />
          ))}
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-[300px] rounded-[13px] md:col-span-3" />
          ))}
        </div>
      </div>
    </main>
  );
}
