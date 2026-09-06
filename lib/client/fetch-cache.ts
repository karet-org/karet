// Deduped JSON fetch for nav chrome: concurrent callers share one
// request; a short TTL absorbs StrictMode remounts and cross-component
// duplicates.

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

/** Deduped text fetch, same cache semantics as cachedJson. */
export function cachedText(url: string, ttlMs = 5000): Promise<string> {
  const key = `text:${url}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise as Promise<string>;
  const promise = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.text();
  });
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}
