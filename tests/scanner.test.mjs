import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceSession } from "../src/lib/session.ts";
import {
  canConfirmPhoto,
  resultResetDelay,
  isDefinitiveFailure,
} from "../src/lib/scannerPolicy.ts";

test("a late renewal cannot restore a credential after revocation", async () => {
  let disk = "old";
  let release;
  let started;
  const writing = new Promise((resolve) => {
    started = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const session = createDeviceSession({
    read: async () => disk,
    remove: async () => {
      disk = null;
    },
    write: async (token) => {
      started();
      await blocked;
      disk = token;
    },
  });
  await session.restore();
  const version = session.snapshot().revision;
  const renewing = session.save("renewed", version);
  await writing;
  const revoked = session.save(null);
  assert.equal(session.snapshot().token, null);
  release();
  assert.equal(await renewing, false);
  await revoked;
  assert.equal(disk, null);
  assert.equal(await session.save("late response", version), false);
  assert.equal(session.snapshot().token, null);
});

test("activation publishes a token only after secure persistence succeeds", async () => {
  const session = createDeviceSession({
    read: async () => null,
    remove: async () => {},
    write: async () => {
      throw Error("Storage unavailable");
    },
  });
  await assert.rejects(session.save("credential"), /Storage unavailable/);
  assert.equal(session.snapshot().token, null);
});

test("restoring old secure storage cannot overwrite a newer session", async () => {
  let release;
  let reading;
  const started = new Promise((resolve) => {
    reading = resolve;
  });
  const session = createDeviceSession({
    read: () => {
      reading();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    remove: async () => {},
    write: async () => {},
  });
  const restore = session.restore();
  await started;
  await session.save("new installation");
  release("old installation");
  await restore;
  assert.equal(session.snapshot().token, "new installation");
});

test("confirmation requires this preview photo and an unexpired verification", () => {
  const result = {
    previewId: "current",
    decision: "PENDING_CONFIRMATION",
    expiresAt: "2026-09-10T08:01:00Z",
  };
  const now = Date.parse("2026-09-10T08:00:00Z");
  assert.equal(canConfirmPhoto(result, "previous", now), false);
  assert.equal(canConfirmPhoto(result, null, now), false);
  assert.equal(canConfirmPhoto(result, "current", now), true);
  assert.equal(canConfirmPhoto(result, "current", now + 60000), false);
});

test("result timeout never discards a photo preview or unresolved serving", () => {
  const pending = { previewId: "id", decision: "PENDING_CONFIRMATION" };
  const approved = { previewId: "id", decision: "APPROVED" };
  assert.equal(resultResetDelay(pending, false, true, 8), null);
  assert.equal(resultResetDelay(approved, true, true, 8), null);
  assert.equal(resultResetDelay(approved, false, false, 8), null);
  assert.equal(resultResetDelay(approved, false, true, 8), 8000);
  assert.equal(resultResetDelay(approved, false, true, 200), 30000);
});

test("temporary errors and credential revocation retain the unresolved request", () => {
  for (const status of [401, 408, 429, 500, 502, 503])
    assert.equal(isDefinitiveFailure(status), false);
  for (const status of [400, 403, 404, 409, 410, 422])
    assert.equal(isDefinitiveFailure(status), true);
});
