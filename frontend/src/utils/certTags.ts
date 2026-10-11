export const LATEST_TAG = "LATEST CERT";

export const isLatest = (tag: string | null | undefined): boolean =>
  (tag ?? "").trim().toLowerCase() === LATEST_TAG.toLowerCase();

/** Same rule as the server: trim, blank -> null, any casing of LATEST CERT -> canonical text. */
export function normalizeTag(tag: string | null | undefined): string | null {
  const t = (tag ?? "").trim();
  if (!t) return null;
  return isLatest(t) ? LATEST_TAG : t;
}
