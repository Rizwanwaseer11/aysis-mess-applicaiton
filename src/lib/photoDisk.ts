import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import {
  createPhotoCache,
  type PhotoStorage,
  type PhotoManifest,
} from "./photoCache";

const directory = () => new Directory(Paths.cache, "employee-thumbnails-v1");
function ensure() {
  const dir = directory();
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}
function file(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new Error("Invalid thumbnail filename");
  return new File(directory(), key + ".webp");
}
async function atomic(name: string, value: string | Uint8Array) {
  const dir = ensure();
  const temp = new File(dir, name + ".tmp");
  const target = new File(dir, name);
  try {
    temp.write(value);
    await temp.move(target, { overwrite: true });
  } finally {
    // move() updates temp.uri to the destination. Clean only the original staging path.
    const leftover = new File(dir, name + ".tmp");
    if (leftover.exists) leftover.delete();
  }
}
export const photoStorage: PhotoStorage = {
  async read() {
    const index = new File(ensure(), "index.json");
    if (!index.exists) return null;
    if (index.size > 256 * 1024) return null;
    return JSON.parse(await index.text()) as PhotoManifest;
  },
  async save(value) {
    await atomic("index.json", JSON.stringify(value));
  },
  async list() {
    const keys: string[] = [];
    for (const item of ensure().list()) {
      if (item instanceof File && /^[a-f0-9]{64}\.webp$/.test(item.name))
        keys.push(item.name.slice(0, -5));
      else if (item.name !== "index.json") item.delete();
    }
    return keys;
  },
  async size(key) {
    const f = file(key);
    return f.exists ? f.size : null;
  },
  async write(key, value) {
    file(key);
    await atomic(key + ".webp", value);
  },
  async remove(key) {
    const f = file(key);
    if (f.exists) f.delete();
  },
  async clear() {
    const dir = directory();
    if (dir.exists) dir.delete();
  },
  uri(key) {
    return file(key).uri;
  },
};
export const employeePhotoCache = createPhotoCache(photoStorage);
export const photoKey = (value: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
