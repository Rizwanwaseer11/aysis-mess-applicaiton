import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPhotoCache } from "../src/lib/photoCache.ts";
const key = (s) => createHash("sha256").update(String(s)).digest("hex");
const photo = (size = 32, color = 1) => {
  const a = new Uint8Array(size).fill(color);
  a.set(Buffer.from("RIFF"), 0);
  a.set(Buffer.from("WEBP"), 8);
  return a;
};
function memoryDisk() {
  const files = new Map();
  let index = null;
  return {
    files,
    get index() {
      return index;
    },
    set index(v) {
      index = v;
    },
    async read() {
      return structuredClone(index);
    },
    async save(v) {
      index = structuredClone(v);
    },
    async list() {
      return [...files.keys()];
    },
    async size(k) {
      return files.get(k)?.byteLength ?? null;
    },
    async write(k, v) {
      files.set(k, v.slice());
    },
    async remove(k) {
      files.delete(k);
    },
    async clear() {
      files.clear();
      index = null;
    },
    uri(k) {
      return "file:///private/" + k + ".webp";
    },
  };
}
const get = (c, id, version = 1, load = async () => photo()) =>
  c.get(key(id + ":" + version), key(id), load);

test("disk cache reuses concurrent requests and keeps only the new photo version", async () => {
  const disk = memoryDisk(),
    c = createPhotoCache(disk);
  await c.setScope("a");
  let calls = 0;
  const load = async () => {
    calls++;
    return photo();
  };
  const results = await Promise.all([
    get(c, "emp", 1, load),
    get(c, "emp", 1, load),
  ]);
  assert.equal(results[0], results[1]);
  await get(c, "emp", 1, load);
  assert.equal(calls, 1);
  await get(c, "emp", 2, async () => {
    calls++;
    return photo(32, 2);
  });
  assert.equal(calls, 2);
  assert.equal(disk.files.has(key("emp:1")), false);
  assert.equal(disk.files.get(key("emp:2"))[12], 2);
  await get(c, "emp", 2, load);
  assert.equal(calls, 2);
  assert.equal(c.stats().entries, 1);
  assert.ok(!JSON.stringify(disk.index).includes("file:///")); // Metadata, not photo payloads.
});
test("restart reuses disk files; missing OS-purged files are downloaded again", async () => {
  const disk = memoryDisk();
  let c = createPhotoCache(disk);
  await c.setScope("a");
  await get(c, "emp");
  c = createPhotoCache(disk);
  await c.setScope("a");
  let calls = 0;
  const load = async () => {
    calls++;
    return photo();
  };
  await get(c, "emp", 1, load);
  assert.equal(calls, 0);
  disk.files.delete(key("emp:1"));
  await get(c, "emp", 1, load);
  assert.equal(calls, 1);
});
test("LRU, byte budget and expiry remove files rather than retaining photo payloads", async () => {
  let now = 0;
  const disk = memoryDisk(),
    c = createPhotoCache(disk, {
      maxEntries: 2,
      maxBytes: 64,
      ttlMs: 10,
      now: () => now,
    });
  await c.setScope("a");
  await get(c, "a");
  await get(c, "b");
  await get(c, "a");
  await get(c, "c");
  assert.equal(disk.files.has(key("b:1")), false);
  assert.equal(c.stats().bytes, 64);
  now = 11;
  await get(c, "c");
  assert.equal(disk.files.size, 1);
  assert.equal(c.stats().bytes, 32);
});
test("revocation aborts a pending download and a late response cannot restore old files", async () => {
  const disk = memoryDisk(),
    c = createPhotoCache(disk);
  await c.setScope("a");
  let finish, signal;
  const started = Promise.withResolvers();
  const request = get(c, "emp", 1, async (s) => {
    signal = s;
    started.resolve();
    return new Promise((r) => (finish = r));
  });
  const rejected = assert.rejects(request);
  await started.promise;
  const clearing = c.clear();
  assert.equal(signal.aborted, true);
  finish(photo());
  await rejected;
  await clearing;
  assert.equal(disk.files.size, 0);
  assert.equal(disk.index, null);
  await assert.rejects(get(c, "emp"));
  await c.setScope("b");
  await get(c, "emp");
  assert.equal(disk.files.size, 1);
});
test("site changes clear photos; separate devices never share cache state", async () => {
  const a = memoryDisk(),
    b = memoryDisk(),
    ca = createPhotoCache(a),
    cb = createPhotoCache(b);
  await ca.setScope("site/device1");
  await cb.setScope("site/device2");
  await get(ca, "emp");
  assert.equal(b.files.size, 0);
  await ca.setScope("site/device1");
  assert.equal(a.files.size, 1);
  await ca.setScope("other/device1");
  assert.equal(a.files.size, 0);
});
test("failed network/storage writes do not cache results and can retry", async () => {
  const disk = memoryDisk(),
    c = createPhotoCache(disk);
  await c.setScope("a");
  await assert.rejects(
    get(c, "emp", 1, async () => {
      throw Error("offline");
    }),
  );
  const write = disk.write;
  disk.write = async (k, v) => {
    await write(k, v);
    throw Error("disk full");
  };
  await assert.rejects(get(c, "emp"));
  assert.equal(disk.files.size, 0);
  assert.equal(c.stats().bytes, 0);
  disk.write = write;
  await get(c, "emp");
  assert.equal(disk.files.size, 1);
});
test("corrupt indexes, invalid paths, orphaned files and size mismatches are discarded", async () => {
  const disk = memoryDisk();
  disk.files.set(key("orphan"), photo());
  disk.index = {
    scope: "a",
    entries: [
      null,
      {
        key: "../outside",
        identity: key("x"),
        used: 1,
        expires: Date.now() + 1000,
        size: 32,
      },
    ],
  };
  const c = createPhotoCache(disk);
  await c.setScope("a");
  assert.equal(disk.files.size, 0);
  await get(c, "emp");
  disk.files.set(key("emp:1"), photo(20));
  const restarted = createPhotoCache(disk);
  await restarted.setScope("a");
  assert.equal(disk.files.size, 0);
  await assert.rejects(c.get("../outside", key("x"), async () => photo()));
  disk.read = async () => {
    throw Error("bad JSON");
  };
  await createPhotoCache(disk).setScope("a");
  assert.equal(disk.files.size, 0);
});
test("invalid/oversized thumbnails never become cached files", async () => {
  const disk = memoryDisk(),
    c = createPhotoCache(disk);
  await c.setScope("a");
  await assert.rejects(get(c, "bad", 1, async () => new Uint8Array(32)));
  await assert.rejects(get(c, "large", 1, async () => photo(512 * 1024 + 1)));
  assert.equal(disk.files.size, 0);
});
test("bounded queue rejects excess requests and duplicate requests share work", async () => {
  const c = createPhotoCache(memoryDisk());
  await c.setScope("a");
  let finish;
  const started = Promise.withResolvers();
  const first = get(c, "0", 1, async () => {
    started.resolve();
    return new Promise((r) => (finish = r));
  });
  await started.promise;
  const rest = [get(c, "1"), get(c, "2"), get(c, "3")];
  await assert.rejects(get(c, "4"));
  finish(photo());
  await Promise.all([first, ...rest]);
  assert.equal(c.stats().pending, 0);
});
test("30000 accesses across three devices keep at most 200 files each; eviction refetches", async () => {
  await Promise.all(
    Array.from({ length: 3 }, async (_, id) => {
      const disk = memoryDisk(),
        c = createPhotoCache(disk);
      await c.setScope("site/device" + id);
      for (let i = 0; i < 10000; i++) {
        await get(c, String(i));
        assert.ok(disk.files.size <= 200);
        assert.ok(c.stats().bytes <= 200 * 1024 * 1024);
      }
      assert.equal(disk.files.size, 200);
      let calls = 0;
      const load = async () => {
        calls++;
        return photo();
      };
      await get(c, "9999", 1, load);
      assert.equal(calls, 0);
      await get(c, "0", 1, load);
      assert.equal(calls, 1);
    }),
  );
});
test("actual disk restart, version replacement and clearing leave no thumbnail files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aysis-photo-test-"));
  const location = (k) => {
    assert.match(k, /^[a-f0-9]{64}$/);
    return path.join(dir, k + ".webp");
  };
  const disk = {
    async read() {
      try {
        return JSON.parse(
          await fs.readFile(path.join(dir, "index.json"), "utf8"),
        );
      } catch {
        return null;
      }
    },
    async save(v) {
      await fs.writeFile(path.join(dir, "index.json"), JSON.stringify(v));
    },
    async list() {
      return (await fs.readdir(dir))
        .filter((x) => x.endsWith(".webp"))
        .map((x) => x.slice(0, -5));
    },
    async size(k) {
      try {
        return (await fs.stat(location(k))).size;
      } catch {
        return null;
      }
    },
    async write(k, v) {
      await fs.writeFile(location(k), v);
    },
    async remove(k) {
      await fs.rm(location(k), { force: true });
    },
    async clear() {
      for (const f of await fs.readdir(dir)) await fs.unlink(path.join(dir, f));
    },
    uri: location,
  };
  try {
    let c = createPhotoCache(disk);
    await c.setScope("a");
    const uri = await get(c, "emp");
    assert.equal((await fs.stat(uri)).size, 32);
    c = createPhotoCache(disk);
    await c.setScope("a");
    assert.equal(
      await get(c, "emp", 1, async () => {
        throw Error("must use disk");
      }),
      uri,
    );
    await get(c, "emp", 2);
    assert.equal((await disk.list()).length, 1);
    await c.clear();
    assert.deepEqual(await fs.readdir(dir), []);
  } finally {
    await fs.rmdir(dir);
  }
});
