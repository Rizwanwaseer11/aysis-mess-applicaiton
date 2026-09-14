import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScan, normalizeEmployeeNumber } from "../src/lib/input.ts";
import { scannerSlice } from "../src/store.ts";
import { reportText } from "../src/lib/report.ts";
test("keyboard readers accept Enter/CRLF without changing QR case or allowing multiple cards", () => {
  const token = "mcard_" + "aB12_-".repeat(8);
  for (const suffix of ["", "\r", "\n", "\r\n"])
    assert.equal(normalizeScan(token + suffix), token);
  for (const input of [
    "123",
    token + "\n" + token,
    "https://example.com",
    "mcard_" + "x".repeat(200),
  ])
    assert.equal(normalizeScan(input), null);
  assert.equal(normalizeEmployeeNumber(" emp-000001 "), "EMP-000001");
  assert.equal(normalizeEmployeeNumber("000001"), null);
});
test("Redux recent activity replaces snapshots, deduplicates IDs and never grows beyond ten", () => {
  const rows = Array.from({ length: 50 }, (_, n) => ({
    id: String(n),
    full_name: "Fixture",
    decision: "APPROVED",
    meal_name: "Lunch",
  }));
  let state;
  for (let n = 0; n < 1000; n++)
    state = scannerSlice.reducer(
      state,
      scannerSlice.actions.setRecent([...rows, ...rows]),
    );
  assert.equal(state.recent.length, 10);
  assert.equal(new Set(state.recent.map((row) => row.id)).size, 10);
  state = scannerSlice.reducer(state, scannerSlice.actions.clear());
  assert.deepEqual(state, { bootstrap: null, recent: [] });
});
test("shared summary uses server totals, identifies site/date/scope and omits employee identities", () => {
  const message = reportText({
    site: { name: "Test", code: "T", timezone: "Asia/Karachi" },
    device: { name: "Tablet" },
    serviceDate: "2026-09-13",
    generatedAt: "2026-09-13T01:00:00Z",
    scope: "device",
    total: 4,
    meals: [{ name: "Lunch", served: 4 }],
    records: [{ full_name: "Private identity" }],
  });
  assert.match(message, /Lunch: 4/);
  assert.match(message, /Tablet/);
  assert.doesNotMatch(message, /Private identity/);
});
