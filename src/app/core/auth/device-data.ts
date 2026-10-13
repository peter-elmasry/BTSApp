/** Storage key kept across logout: only the interface language (D047). */
export const KEPT_KEYS = ['bts.lang'] as const;

/**
 * Removes everything this app stored on the device: local and session storage (except the
 * language), the offline IndexedDB database and Cache Storage. Each step is best-effort so
 * a blocked store never stops the others.
 */
export async function clearDeviceData(destroyDatabase: () => Promise<void>): Promise<void> {
  try {
    const kept = KEPT_KEYS.map((key) => [key, localStorage.getItem(key)] as const);
    localStorage.clear();
    for (const [key, value] of kept) if (value !== null) localStorage.setItem(key, value);
  } catch {
    /* Storage blocked: nothing was persisted there. */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* Storage blocked. */
  }
  try {
    await destroyDatabase();
  } catch {
    /* IndexedDB unavailable. */
  }
  try {
    if (typeof caches !== 'undefined')
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  } catch {
    /* Cache Storage unavailable. */
  }
}
