export type PreviewState = {
  previewId: string;
  decision: "PENDING_CONFIRMATION" | "APPROVED" | "DENIED";
  expiresAt?: string;
};

/** Image events belong to one preview; an older photo can never enable a new confirmation. */
export function canConfirmPhoto(
  result: PreviewState | null,
  loadedPhotoId: string | null,
  now: number,
) {
  return (
    !!result &&
    result.decision === "PENDING_CONFIRMATION" &&
    loadedPhotoId === result.previewId &&
    !!result.expiresAt &&
    Date.parse(result.expiresAt) > now
  );
}

export function resultResetDelay(
  result: PreviewState | null,
  unresolved: boolean,
  foreground: boolean,
  seconds = 5,
) {
  if (
    !foreground ||
    unresolved ||
    !result ||
    result.decision === "PENDING_CONFIRMATION"
  )
    return null;
  const duration = Number.isFinite(seconds)
    ? Math.min(30, Math.max(2, seconds))
    : 5;
  return duration * 1000;
}

/** Only a definitive HTTP rejection can discard a request; timeouts/5xx/429 stay recoverable. */
export function isDefinitiveFailure(status: number) {
  return [400, 403, 404, 409, 410, 422].includes(status);
}
