/** Keyboard-mode readers share this adapter, independent of manufacturer. */
export function normalizeScan(value: string) {
  const normalized = value.replace(/[\r\n]+$/, "").trim();
  if (!/^mcard_[A-Za-z0-9_-]{34,194}$/.test(normalized)) return null;
  return normalized;
}
export function normalizeEmployeeNumber(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^EMP-\d{6,20}$/.test(normalized) ? normalized : null;
}
