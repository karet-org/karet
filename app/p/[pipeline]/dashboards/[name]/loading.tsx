// Shown instantly during navigation while the dashboard's server data
// (config + parquet rows) loads, so the click feels responsive instead of
// blocking on a blank screen.
export default function DashboardLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-[1400px] space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-6">
      <header className="rounded-lg border border-orange-100 bg-white px-3 py-2 shadow-sm sm:px-4 sm:py-3">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-gray-100" />
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-lg border border-orange-100 bg-white shadow-sm"
          />
        ))}
      </div>
    </main>
  );
}
