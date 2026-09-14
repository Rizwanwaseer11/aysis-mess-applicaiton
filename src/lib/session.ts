type TokenStorage = {
  read: () => Promise<string | null>;
  write: (token: string) => Promise<void>;
  remove: () => Promise<void>;
};

/** Serialize secure writes so a late renewal cannot restore a revoked credential. */
export function createDeviceSession(storage: TokenStorage) {
  let token: string | null = null;
  let revision = 0;
  let writes: Promise<unknown> = Promise.resolve();

  function snapshot() {
    return { token, revision };
  }
  async function restore() {
    const expected = revision;
    await writes;
    const saved = await storage.read();
    if (expected === revision) token = saved;
    return !!token;
  }
  function save(
    value: string | null,
    expectedRevision?: number,
  ): Promise<boolean> {
    if (expectedRevision !== undefined && expectedRevision !== revision)
      return Promise.resolve(false);
    const operationRevision = ++revision;
    // Revocation takes effect in memory immediately, even if secure deletion must wait.
    if (value === null) token = null;
    const operation = writes.then(async () => {
      if (operationRevision !== revision) return false;
      if (value === null) await storage.remove();
      else await storage.write(value);
      if (operationRevision !== revision) return false;
      token = value;
      return true;
    });
    writes = operation.catch(() => {});
    return operation;
  }
  return { snapshot, restore, save };
}
