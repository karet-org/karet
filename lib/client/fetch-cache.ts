// Deduped JSON fetch for client nav chrome. Concurrent callers of the
// same URL share one request, and a short TTL absorbs StrictMode's
// double-mounted effects in dev plus cross-component duplicates (the
// sidebar and the user menu both want /api/settings, for example).

const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function cachedJson<T>(url: string, ttlMs = 5000): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<T>;
  const promise = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json() as Promise<T>;
  });
  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => cache.delete(url));
  return promise;
}

/** Drop a cached URL, e.g. after a mutation that invalidates it. */
export function invalidateCached(url: string): void {
  cache.delete(url);
}
