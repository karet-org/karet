// Shown instantly during navigation while the graph route's JS chunk loads
// and React Flow mounts, so the transition doesn't appear to freeze.
// 52 = TOP_NAV_HEIGHT_PX.
export default function GraphLoading() {
  return (
    <main
      className="flex items-center justify-center"
      style={{ height: "calc(100vh - 52px)" }}
    >
      <div role="status" className="text-sm text-gray-500">
        Loading graph…
      </div>
    </main>
  );
}
