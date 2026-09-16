import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { root, state } from "./fixtures/photo-filesystem.mjs";
// Run the actual storage adapter, substituting native bindings only. Expo move()
// changes the source object's URI; the filesystem fixture reproduces that contract.
const source = fs.readFileSync(
  new URL("../src/lib/photoDisk.ts", import.meta.url),
  "utf8",
);
let js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
js = js
  .replace(
    '"expo-file-system"',
    JSON.stringify(
      new URL("./fixtures/photo-filesystem.mjs", import.meta.url).href,
    ),
  )
  .replace(
    '"./photoCache"',
    JSON.stringify(new URL("../src/lib/photoCache.ts", import.meta.url).href),
  )
  .replace(
    '"expo-crypto"',
    JSON.stringify(
      'data:text/javascript,export const CryptoDigestAlgorithm={SHA256:"SHA256"};export const digestStringAsync=async()=>"fixture";',
    ),
  );
const { photoStorage } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
after(() => {
  const resolved = path.resolve(root);
  assert.ok(path.basename(resolved).startsWith("aysis-native-file-test-"));
  fs.rmSync(resolved, { recursive: true, force: true });
});
test("successful native-style move preserves thumbnail and manifest, and removes staging files", async () => {
  await photoStorage.clear();
  const key = "a".repeat(64),
    bytes = new Uint8Array([1, 2, 3]);
  await photoStorage.write(key, bytes);
  assert.equal(await photoStorage.size(key), 3);
  assert.deepEqual([...fs.readFileSync(photoStorage.uri(key))], [1, 2, 3]);
  const manifest = { scope: "site/device", entries: [] };
  await photoStorage.save(manifest);
  assert.deepEqual(await photoStorage.read(), manifest);
  assert.deepEqual(
    fs.readdirSync(path.dirname(photoStorage.uri(key))).sort(),
    [key + ".webp", "index.json"].sort(),
  );
});
test("failed move cleans staging file without deleting a previous valid photo", async () => {
  const key = "b".repeat(64);
  await photoStorage.write(key, new Uint8Array([1]));
  state.failMove = true;
  try {
    await assert.rejects(
      photoStorage.write(key, new Uint8Array([2])),
      /simulated move failure/,
    );
  } finally {
    state.failMove = false;
  }
  assert.deepEqual([...fs.readFileSync(photoStorage.uri(key))], [1]);
  assert.equal(fs.existsSync(photoStorage.uri(key) + ".tmp"), false);
  await photoStorage.clear();
  assert.equal(await photoStorage.size(key), null);
});
