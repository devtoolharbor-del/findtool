/**
 * Client-side tool search.
 *
 * Pure, dependency-free and unit-tested. The index is generated at build time
 * into /search.json and fetched once on first use, so this scales to hundreds
 * of tools without shipping the catalogue on every page.
 */

export interface SearchEntry {
  /** slug */
  s: string;
  /** name */
  n: string;
  /** description */
  d: string;
  /** category display name */
  c: string;
  /** category slug */
  cs: string;
  /** keywords + aliases, lowercased, joined by spaces */
  k: string;
  /** icon name */
  i: string;
}

export interface SearchHit {
  entry: SearchEntry;
  score: number;
}

/** Normalise for comparison: lowercase, strip punctuation, collapse spaces. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score one entry against one already-normalised query token.
 * Returns 0 when the token does not appear at all.
 *
 * The weighting deliberately favours the tool name, so typing "json" ranks
 * the JSON tools above a text tool that merely mentions JSON in its blurb.
 */
function scoreToken(entry: SearchEntry, token: string): number {
  const name = normalize(entry.n);
  const keywords = entry.k;
  const desc = normalize(entry.d);
  const cat = normalize(entry.c);

  // Exact full-name match — "sort lines" typed in full.
  if (name === token) return 120;

  // Name starts with the token — "js" → "JSON Formatter".
  if (name.startsWith(token)) return 80;

  // A word inside the name starts with the token.
  if (name.split(' ').some((w) => w.startsWith(token))) return 64;

  // Substring anywhere in the name.
  if (name.includes(token)) return 40;

  // Keyword or alias word-prefix match — this is what makes "b64", "epoch"
  // and "guid" find the right tool.
  const kwords = keywords.split(' ');
  if (kwords.some((w) => w === token)) return 34;
  if (kwords.some((w) => w.startsWith(token))) return 24;
  if (keywords.includes(token)) return 16;

  if (cat.includes(token)) return 10;
  if (desc.includes(token)) return 6;

  return 0;
}

/**
 * Search the index. Every query token must match something (AND semantics),
 * which keeps two-word queries like "json csv" precise instead of returning
 * everything that mentions JSON.
 */
export function search(query: string, entries: SearchEntry[], limit = 8): SearchHit[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(' ');

  const hits: SearchHit[] = [];
  for (const entry of entries) {
    let total = 0;
    let matchedAll = true;
    for (const token of tokens) {
      const s = scoreToken(entry, token);
      if (s === 0) {
        matchedAll = false;
        break;
      }
      total += s;
    }
    if (matchedAll) hits.push({ entry, score: total });
  }

  hits.sort((a, b) => b.score - a.score || a.entry.n.localeCompare(b.entry.n));
  return hits.slice(0, limit);
}

/**
 * Wrap the matched span of `text` in <mark>. Input is escaped first, so the
 * result is safe to assign to innerHTML.
 */
export function highlight(text: string, query: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const token = normalize(query).split(' ')[0];
  if (!token) return escaped;
  const idx = escaped.toLowerCase().indexOf(token);
  if (idx === -1) return escaped;
  return (
    escaped.slice(0, idx) +
    '<mark class="bc-match">' +
    escaped.slice(idx, idx + token.length) +
    '</mark>' +
    escaped.slice(idx + token.length)
  );
}
