/**
 * Recently used tools.
 *
 * Stored in localStorage on the visitor's own device and never transmitted —
 * it is a convenience for people who come back, not analytics. The list holds
 * slugs and nothing else: no timestamps that could build a usage profile, no
 * input, no identifiers.
 *
 * Every access is wrapped: localStorage throws outright in some privacy modes
 * rather than returning null, and a bookmarking convenience must never be the
 * reason a page fails to render.
 */

const KEY = 'bc-recent';
const LIMIT = 6;

/** Slug format is validated on read — the stored value is user-writable. */
const VALID = /^[a-z0-9][a-z0-9-]{0,60}$/;

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string' && VALID.test(s)).slice(0, LIMIT);
  } catch {
    return [];
  }
}

/**
 * Record a visit, most recent first, without duplicates.
 * Returns the new list so callers can render without a second read.
 */
export function recordVisit(slug: string): string[] {
  if (!VALID.test(slug)) return readRecent();
  try {
    const next = [slug, ...readRecent().filter((s) => s !== slug)].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
