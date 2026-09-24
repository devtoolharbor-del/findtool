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
 * Bounded edit distance: is `a` reachable from `b` within `max` edits?
 *
 * This is optimal string alignment (Damerau-Levenshtein restricted to
 * adjacent transpositions), not plain Levenshtein. Swapping two neighbouring
 * letters is the single most common typing mistake — "jsno" for "json",
 * "teh" for "the" — and plain Levenshtein charges two edits for it, which
 * puts it outside the budget a short word can afford. Counting it as one is
 * the difference between the correction working and not.
 *
 * Returns the distance, or `max + 1` as soon as the budget is certainly
 * exceeded. Bailing early matters because this runs against every candidate
 * word in the index on each keystroke of a failed query.
 */
export function editDistanceWithin(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  // Three rolling rows: transposition needs the row before last.
  let prevPrev: number[] = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);

      // Adjacent transposition, charged as a single edit.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prevPrev[j - 2]! + 1);
      }

      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }

    // Every remaining path runs through this row, so if all of it already
    // exceeds the budget the answer cannot come back under it.
    if (rowMin > max) return max + 1;

    const recycled = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = recycled;
  }

  return prev[b.length]!;
}

/**
 * How many edits to forgive for a token of this length.
 *
 * Short tokens get none: at three characters, one edit reaches so many other
 * words that "csv" would match "css" and the results stop meaning anything.
 */
function editBudget(token: string): number {
  if (token.length < 4) return 0;
  if (token.length < 8) return 1;
  return 2;
}

/**
 * Score a token against an entry allowing for a misspelling.
 *
 * Only whole words are compared, and the score is capped below every exact
 * tier so a corrected match can never outrank a real one.
 */
function scoreTokenFuzzy(entry: SearchEntry, token: string): number {
  const budget = editBudget(token);
  if (budget === 0) return 0;

  // A correction against the tool's own name is stronger evidence than one
  // against a keyword: "convertor" should surface Color Converter ahead of
  // the Base64 encoder, which merely lists "converter" among its keywords.
  const nameWords = new Set(normalize(entry.n).split(' '));
  const keywordWords = new Set(entry.k.split(' '));

  let best = 0;
  const consider = (word: string, weight: number) => {
    if (!word || Math.abs(word.length - token.length) > budget) return;
    const distance = editDistanceWithin(token, word, budget);
    if (distance > budget) return;
    // Closer corrections rank higher, but every tier stays below the lowest
    // exact-match score so a correction can never outrank a real match.
    const score = weight - distance * 3;
    if (score > best) best = score;
  };

  for (const word of nameWords) consider(word, 14);
  for (const word of keywordWords) {
    if (!nameWords.has(word)) consider(word, 9);
  }

  return best;
}

/**
 * Search the index. Every query token must match something (AND semantics),
 * which keeps two-word queries like "json csv" precise instead of returning
 * everything that mentions JSON.
 *
 * Exact matching runs first. Only when it finds nothing at all does a second
 * pass allow for typos — so a correctly spelled query never has its results
 * diluted by near-misses, and "jsno" still finds the JSON tools.
 */
export function search(query: string, entries: SearchEntry[], limit = 8): SearchHit[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(' ');

  const run = (scorer: (entry: SearchEntry, token: string) => number): SearchHit[] => {
    const hits: SearchHit[] = [];
    for (const entry of entries) {
      let total = 0;
      let matchedAll = true;
      for (const token of tokens) {
        const s = scorer(entry, token);
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
  };

  const exact = run(scoreToken);
  if (exact.length > 0) return exact;

  // Fall back to tolerating a misspelling in any token.
  return run((entry, token) => scoreToken(entry, token) || scoreTokenFuzzy(entry, token));
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
