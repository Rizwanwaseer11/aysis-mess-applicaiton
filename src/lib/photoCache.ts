/** Serialized disk metadata; thumbnail bytes are never retained in the JS cache. */
export type PhotoEntry = {
  key: string;
  identity: string;
  size: number;
  expires: number;
  used: number;
};
export type PhotoManifest = { scope: string; entries: PhotoEntry[] };
export type PhotoStorage = {
  read(): Promise<PhotoManifest | null>;
  save(value: PhotoManifest): Promise<void>;
  list(): Promise<string[]>;
  size(key: string): Promise<number | null>;
  write(key: string, bytes: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  uri(key: string): string;
};
export function createPhotoCache(
  storage: PhotoStorage,
  options: {
    maxEntries?: number;
    maxBytes?: number;
    ttlMs?: number;
    now?: () => number;
  } = {},
) {
  const {
    maxEntries = 200,
    maxBytes = 200 * 1024 * 1024,
    ttlMs = 8 * 60 * 60 * 1000,
    now = Date.now,
  } = options;
  const entries = new Map<string, PhotoEntry>();
  const pending = new Map<
    string,
    { promise: Promise<string>; controller: AbortController }
  >();
  let scope: string | null = null,
    generation = 0,
    bytes = 0,
    initialized = false;
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = tail.then(fn);
    tail = next.catch(() => {});
    return next;
  }
  function invalidate() {
    generation++;
    initialized = false;
    for (const task of pending.values()) task.controller.abort();
    pending.clear();
  }
  async function remove(key: string) {
    await storage.remove(key);
    const entry = entries.get(key);
    if (entry) bytes -= entry.size;
    entries.delete(key);
  }
  async function prune() {
    for (const [key, entry] of entries)
      if (entry.expires <= now()) await remove(key);
  }
  async function persist() {
    await storage.save({ scope: scope!, entries: [...entries.values()] });
  }
  function clear(): Promise<void> {
    invalidate();
    scope = null;
    return serial(async () => {
      entries.clear();
      bytes = 0;
      await storage.clear();
    });
  }
  function setScope(value: string): Promise<void> {
    if (scope === value && initialized) return Promise.resolve();
    invalidate();
    scope = value;
    const expected = generation;
    return serial(async () => {
      if (expected !== generation) throw new Error("Photo session changed");
      entries.clear();
      bytes = 0;
      let manifest: PhotoManifest | null = null;
      try {
        manifest = await storage.read();
      } catch {
        /* A damaged index is a disposable cache. */
      }
      if (manifest?.scope !== value || !Array.isArray(manifest.entries))
        await storage.clear();
      else {
        for (const entry of manifest.entries
          .filter((entry) => entry && typeof entry === "object")
          .slice()
          .sort((a, b) => a.used - b.used)) {
          if (
            !/^[a-f0-9]{64}$/.test(entry?.key) ||
            !/^[a-f0-9]{64}$/.test(entry?.identity) ||
            !Number.isFinite(entry.used) ||
            !Number.isFinite(entry.expires) ||
            entry.expires <= now() ||
            entry.expires > now() + ttlMs ||
            !Number.isInteger(entry.size) ||
            entry.size <= 0 ||
            entry.size > 512 * 1024
          )
            continue;
          if (
            entries.has(entry.key) ||
            (await storage.size(entry.key)) !== entry.size
          )
            continue;
          while (entries.size >= maxEntries || bytes + entry.size > maxBytes) {
            if (!entries.size) break;
            await remove(entries.keys().next().value!);
          }
          if (entry.size > maxBytes) continue;
          entries.set(entry.key, entry);
          bytes += entry.size;
        }
        for (const key of await storage.list())
          if (!entries.has(key)) await storage.remove(key);
      }
      if (expected !== generation) throw new Error("Photo session changed");
      await persist();
      if (expected !== generation) throw new Error("Photo session changed");
      initialized = true;
    });
  }
  function get(
    key: string,
    identity: string,
    loader: (signal: AbortSignal) => Promise<Uint8Array>,
  ): Promise<string> {
    if (!scope)
      return Promise.reject(new Error("Device photo session is unavailable"));
    if (!/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(identity))
      return Promise.reject(new Error("Invalid photo cache key"));
    const old = pending.get(key);
    if (old) return old.promise;
    if (pending.size >= 4)
      return Promise.reject(new Error("Photo loading is busy. Scan again."));
    const expected = generation,
      controller = new AbortController();
    const check = () => {
      if (expected !== generation || controller.signal.aborted)
        throw new Error("Photo session changed or request timed out");
    };
    const promise = serial(async () => {
      check();
      if (!initialized) throw new Error("Photo storage is unavailable");
      await prune();
      check();
      const cached = entries.get(key);
      if (cached && (await storage.size(key)) === cached.size) {
        cached.used = now();
        entries.delete(key);
        entries.set(key, cached);
        await persist();
        check();
        return storage.uri(key);
      }
      if (cached) await remove(key);
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const data = await loader(controller.signal);
        check();
        if (
          data.byteLength < 12 ||
          data.byteLength > 512 * 1024 ||
          data.byteLength > maxBytes ||
          String.fromCharCode(...data.slice(0, 4)) !== "RIFF" ||
          String.fromCharCode(...data.slice(8, 12)) !== "WEBP"
        )
          throw new Error("Invalid WebP thumbnail");
        // Replacement versions remove the previous file for this employee.
        for (const [id, entry] of entries)
          if (entry.identity === identity) await remove(id);
        while (entries.size >= maxEntries || bytes + data.byteLength > maxBytes)
          await remove(entries.keys().next().value!);
        check();
        try {
          await storage.write(key, data);
          check();
        } catch (error) {
          await storage.remove(key);
          throw error;
        }
        const entry = {
          key,
          identity,
          size: data.byteLength,
          expires: now() + ttlMs,
          used: now(),
        };
        entries.set(key, entry);
        bytes += entry.size;
        try {
          await persist();
          check();
        } catch (error) {
          await remove(key);
          throw error;
        }
        return storage.uri(key);
      } finally {
        clearTimeout(timer);
      }
    }).finally(() => {
      if (pending.get(key)?.controller === controller) pending.delete(key);
    });
    pending.set(key, { promise, controller });
    return promise;
  }
  function forget(key: string): Promise<void> {
    return serial(async () => {
      await remove(key);
      if (initialized) await persist();
    });
  }
  return {
    get,
    setScope,
    clear,
    forget,
    stats: () => ({ entries: entries.size, bytes, pending: pending.size }),
  };
}
