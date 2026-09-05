// Shown instantly during navigation while the graph route's JS chunk loads
// and React Flow mounts, so the transition doesn't appear to freeze.
// 48 = MOBILE_NAV_HEIGHT_PX; the desktop side nav takes no vertical space.
export default function GraphLoading() {
  return (
    <main
      className="flex h-[calc(100vh-48px)] items-center justify-center md:h-screen"
    >
      <div role="status" className="text-sm text-[color:var(--color-ink-3)]">
        Loading graph…
      </div>
    </main>
  );
}
