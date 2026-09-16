import fs from "node:fs";
import path from "node:path";
import os from "node:os";
export const root = fs.mkdtempSync(
  path.join(os.tmpdir(), "aysis-native-file-test-"),
);
export const state = { failMove: false };
export const Paths = { cache: root };
export class File {
  constructor(...parts) {
    this.uri = path.join(
      ...parts.map((p) => (typeof p === "string" ? p : p.uri)),
    );
  }
  get exists() {
    return fs.existsSync(this.uri);
  }
  get size() {
    return fs.statSync(this.uri).size;
  }
  get name() {
    return path.basename(this.uri);
  }
  write(data) {
    fs.writeFileSync(this.uri, data);
  }
  async text() {
    return fs.readFileSync(this.uri, "utf8");
  }
  delete() {
    fs.unlinkSync(this.uri);
  }
  async move(target) {
    if (state.failMove) throw Error("simulated move failure");
    fs.renameSync(this.uri, target.uri);
    this.uri = target.uri;
  }
}
export class Directory {
  constructor(...parts) {
    this.uri = path.join(
      ...parts.map((p) => (typeof p === "string" ? p : p.uri)),
    );
  }
  get exists() {
    return fs.existsSync(this.uri);
  }
  create() {
    fs.mkdirSync(this.uri, { recursive: true });
  }
  list() {
    return fs.readdirSync(this.uri).map((name) => new File(this, name));
  }
  delete() {
    fs.rmSync(this.uri, { recursive: true });
  }
}
