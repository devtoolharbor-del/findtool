/**
 * Text helpers shared by the text family of tools.
 *
 * Pure and DOM-free so the same logic backs the word counter, character
 * counter, case converter, deduplicator, line sorter and whitespace cleaner —
 * and so every rule in here is unit-testable in Node.
 *
 * Three things in this file are subtler than they look and are commented where
 * they happen: grapheme segmentation, sentence detection, and the word
 * splitter that every case conversion depends on.
 */

// ─── Grapheme segmentation ────────────────────────────────────────────────

/**
 * `Intl.Segmenter` is the only correct way to count what a user calls a
 * "character". It landed in Firefox 125 (April 2024) and has been in Chrome
 * and Safari far longer, so it is available essentially everywhere — but a
 * counter that throws on an old browser is worse than one that is slightly
 * wrong, so `splitGraphemesFallback` below covers the gap.
 */
const GRAPHEME_SEGMENTER: Intl.Segmenter | null = (() => {
  try {
    if (typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function') {
      return new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    }
  } catch {
    /* Some embedded runtimes expose the constructor but reject the options. */
  }
  return null;
})();

const ZWJ = 0x200d;
const COMBINING = /\p{M}/u;

const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isVariationSelector = (cp: number) =>
  (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
/** Tag characters, used by the subdivision flags such as the Scottish flag. */
const isTagChar = (cp: number) => cp >= 0xe0020 && cp <= 0xe007f;

/**
 * Approximate UAX #29 extended grapheme clusters without `Intl.Segmenter`.
 *
 * It covers the cases that actually change a count in a text box: combining
 * marks, ZWJ sequences (the family emoji), variation selectors, skin-tone
 * modifiers, flag pairs, tag sequences and CRLF. It does not implement the
 * Indic conjunct-cluster rules, so a Devanagari cluster can come out one or
 * two units high on a browser old enough to need this path.
 */
export function splitGraphemesFallback(text: string): string[] {
  const clusters: string[] = [];
  let current = '';
  let prevWasZwj = false;
  /** Number of unpaired regional indicators at the end of `current`. */
  let riRun = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0)!;

    if (current === '') {
      current = ch;
      prevWasZwj = cp === ZWJ;
      riRun = isRegionalIndicator(cp) ? 1 : 0;
      continue;
    }

    let joins: boolean;
    if (ch === '\n' && current === '\r') {
      joins = true;
    } else if (isRegionalIndicator(cp)) {
      joins = riRun === 1;
    } else {
      joins =
        prevWasZwj ||
        cp === ZWJ ||
        isSkinTone(cp) ||
        isVariationSelector(cp) ||
        isTagChar(cp) ||
        COMBINING.test(ch);
    }

    if (joins) {
      current += ch;
      riRun = isRegionalIndicator(cp) ? 0 : riRun;
    } else {
      clusters.push(current);
      current = ch;
      riRun = isRegionalIndicator(cp) ? 1 : 0;
    }
    prevWasZwj = cp === ZWJ;
  }

  if (current !== '') clusters.push(current);
  return clusters;
}

/** Split text into user-perceived characters. `"👨‍👩‍👧‍👦"` is one of them. */
export function splitGraphemes(text: string): string[] {
  if (!text) return [];
  if (GRAPHEME_SEGMENTER) {
    return Array.from(GRAPHEME_SEGMENTER.segment(text), (s) => s.segment);
  }
  return splitGraphemesFallback(text);
}

/** True when the platform can segment graphemes properly. */
export const hasNativeSegmenter = GRAPHEME_SEGMENTER !== null;

export function countGraphemes(text: string): number {
  return splitGraphemes(text).length;
}

/** Unicode code points — what `[...text].length` gives you. */
export function countCodePoints(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/** UTF-16 code units — what JavaScript's `.length` gives you. */
export function countUtf16Units(text: string): number {
  return text.length;
}

/** UTF-8 byte length, which is what a database column or an HTTP header counts. */
export function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  // Manual fallback keeps this module usable in any JS runtime.
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// ─── Counting ─────────────────────────────────────────────────────────────

/** Anything holding a letter or a digit counts as a word. */
const WORDY = /[\p{L}\p{N}]/u;

/**
 * Han ideographs and kana are not space-separated, so whitespace tokenisation
 * would report a 40-character Japanese sentence as one word. Each of these is
 * counted individually. Hangul is deliberately excluded — Korean *is* written
 * with spaces between words.
 */
const CJK = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;

export function countWords(text: string): number {
  if (!text.trim()) return 0;
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = cjk ? text.replace(CJK, ' ') : text;
  let n = 0;
  for (const token of rest.split(/\s+/)) {
    if (token && WORDY.test(token)) n++;
  }
  return n + cjk;
}

const SENTENCE_ENDINGS = new Set(['.', '!', '?', '…', '。', '！', '？']);
/** Quotes and brackets that legitimately follow a full stop. */
const TRAILING_CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '»', '"']);

/**
 * Count sentences.
 *
 * A terminator ends a sentence when it is followed by whitespace or the end of
 * input, *and* the next visible character is not a lowercase letter. That last
 * rule is what stops `Hi... there!` from counting as two, and it is also why
 * `approx. 40 items` is handled correctly while `Dr. Smith` is not — no
 * heuristic without a dictionary gets abbreviations right, so this one
 * deliberately errs toward over-counting them.
 *
 * A hard line break also ends a sentence, because headings and list items
 * rarely carry a full stop.
 */
export function countSentences(text: string): number {
  let count = 0;
  let hasContent = false;
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;

    if (SENTENCE_ENDINGS.has(ch)) {
      if (!hasContent) continue;
      // Consume the whole run of terminators plus any closing punctuation.
      while (i + 1 < chars.length && (SENTENCE_ENDINGS.has(chars[i + 1]!) || TRAILING_CLOSERS.has(chars[i + 1]!))) {
        i++;
      }
      let j = i + 1;
      while (j < chars.length && /\s/.test(chars[j]!)) j++;
      const next = chars[j];
      const sameSentence = next !== undefined && next.toLowerCase() === next && WORDY.test(next);
      if (!sameSentence) {
        count++;
        hasContent = false;
      }
      continue;
    }

    if (ch === '\n') {
      if (hasContent) {
        count++;
        hasContent = false;
      }
      continue;
    }

    if (WORDY.test(ch)) hasContent = true;
  }

  if (hasContent) count++;
  return count;
}

/** Blocks separated by at least one blank line. */
export function countParagraphs(text: string): number {
  if (!text.trim()) return 0;
  return text
    .split(/\n[ \t]*\n+/)
    .filter((block) => WORDY.test(block)).length;
}

/** Lines, counted the way an editor's gutter counts them. */
export function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}

export const READING_WPM = 238;
export const SPEAKING_WPM = 150;

/**
 * Reading time in seconds. 238 words per minute is the mean for silent
 * reading of English non-fiction in Brysbaert's 2019 meta-analysis of 190
 * studies — a far better default than the 200 or 250 usually asserted.
 */
export function readingSeconds(words: number, wpm = READING_WPM): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round((words / wpm) * 60));
}

/** Speaking time in seconds, at a conversational presentation pace. */
export function speakingSeconds(words: number, wpm = SPEAKING_WPM): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round((words / wpm) * 60));
}

/** `95` → `"1m 35s"`, `40` → `"40s"`, `0` → `"0s"`. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return s ? `${m}m ${s}s` : `${m}m`;
}

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  graphemes: number;
  codePoints: number;
  bytes: number;
  readingSeconds: number;
  speakingSeconds: number;
  /** Mean words per sentence, rounded to one decimal. 0 when there are none. */
  averageWordsPerSentence: number;
  /** Mean characters per word, rounded to one decimal. */
  averageWordLength: number;
  longestLine: number;
}

export function textStats(text: string): TextStats {
  const words = countWords(text);
  const sentences = countSentences(text);
  const stripped = text.replace(/\s/gu, '');
  const lines = text === '' ? [] : text.split('\n');

  return {
    words,
    characters: countUtf16Units(text),
    charactersNoSpaces: countUtf16Units(stripped),
    sentences,
    paragraphs: countParagraphs(text),
    lines: lines.length,
    graphemes: countGraphemes(text),
    codePoints: countCodePoints(text),
    bytes: utf8ByteLength(text),
    readingSeconds: readingSeconds(words),
    speakingSeconds: speakingSeconds(words),
    averageWordsPerSentence: sentences ? round1(words / sentences) : 0,
    averageWordLength: words ? round1(stripped.length / words) : 0,
    longestLine: lines.reduce((max, l) => Math.max(max, l.length), 0),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── Keyword frequency ────────────────────────────────────────────────────

/**
 * A compact English stop-word list. Deliberately short: aggressive lists strip
 * words like "not" and "no" that carry real meaning when you are inspecting
 * copy, so this one keeps negations and drops only true function words.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here',
  'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its',
  'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'will', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

export interface KeywordCount {
  word: string;
  count: number;
  /** Share of all counted words, as a percentage rounded to one decimal. */
  percent: number;
}

export interface KeywordOptions {
  includeStopWords?: boolean;
  limit?: number;
  /** Words shorter than this are ignored. Default 1 (keep everything). */
  minLength?: number;
}

/** Tokens for frequency analysis: letters and digits, inner apostrophes kept. */
const FREQ_TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

/**
 * Count word frequency, highest first. Ties break alphabetically so the table
 * does not reshuffle itself between keystrokes.
 */
export function keywordFrequency(text: string, options: KeywordOptions = {}): KeywordCount[] {
  const { includeStopWords = false, limit = 10, minLength = 1 } = options;
  const counts = new Map<string, number>();
  let total = 0;

  for (const match of text.toLowerCase().matchAll(FREQ_TOKEN)) {
    const word = match[0];
    if (word.length < minLength) continue;
    if (!includeStopWords && STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
    total++;
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return sorted.slice(0, limit).map(([word, count]) => ({
    word,
    count,
    percent: total ? round1((count / total) * 100) : 0,
  }));
}

// ─── Word splitting, the basis of every case conversion ───────────────────

/**
 * Break one delimiter-free token into words.
 *
 * The alternation order matters:
 *
 *   1. `\p{Lu}+(?=\p{Lu}\p{Ll})` peels an acronym off the front of the next
 *      capitalised word, which is what turns `XMLHttpRequest` into
 *      `XML` + `Http` + `Request` instead of `XMLHttp` + `Request`.
 *   2. `\p{Lu}?\p{Ll}+\p{N}*` takes a normal capitalised or lowercase word,
 *      absorbing trailing digits so `utf8Encoder` gives `utf8` + `Encoder`
 *      rather than `utf` + `8` + `Encoder`.
 *   3. `\p{Lu}+\p{N}*` takes a trailing acronym, e.g. the `HTTP2` in
 *      `useHTTP2`.
 *   4. `\p{N}+` takes a standalone number.
 */
const TOKEN_WORDS = /\p{Lu}+(?=\p{Lu}\p{Ll})|\p{Lu}?\p{Ll}+\p{N}*|\p{Lu}+\p{N}*|\p{N}+/gu;

/** Apostrophes join a word rather than splitting it: `user's` → `users`. */
const APOSTROPHES = /['’`ʼ]/gu;

/**
 * Split arbitrary input into words, understanding camelCase boundaries,
 * acronym runs, digits and any existing delimiter (space, `_`, `-`, `.`, `/`,
 * punctuation).
 *
 * `splitWords('XMLHttpRequest v2')` → `['XML', 'Http', 'Request', 'v2']`
 */
export function splitWords(input: string): string[] {
  if (!input) return [];
  const words: string[] = [];
  for (const chunk of input.replace(APOSTROPHES, '').split(/[^\p{L}\p{N}]+/u)) {
    if (!chunk) continue;
    const matched = chunk.match(TOKEN_WORDS);
    if (matched) words.push(...matched);
  }
  return words;
}

const lower = (s: string) => s.toLowerCase();
const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

// ─── The twelve case conversions ──────────────────────────────────────────

export function toCamelCase(input: string): string {
  const words = splitWords(input);
  return words.map((w, i) => (i === 0 ? lower(w) : capitalise(w))).join('');
}

export function toPascalCase(input: string): string {
  return splitWords(input).map(capitalise).join('');
}

export function toSnakeCase(input: string): string {
  return splitWords(input).map(lower).join('_');
}

export function toScreamingSnakeCase(input: string): string {
  return splitWords(input)
    .map((w) => w.toUpperCase())
    .join('_');
}

export function toKebabCase(input: string): string {
  return splitWords(input).map(lower).join('-');
}

export function toTrainCase(input: string): string {
  return splitWords(input).map(capitalise).join('-');
}

export function toDotCase(input: string): string {
  return splitWords(input).map(lower).join('.');
}

export function toPathCase(input: string): string {
  return splitWords(input).map(lower).join('/');
}

export function toLowerCase(input: string): string {
  return input.toLowerCase();
}

export function toUpperCase(input: string): string {
  return input.toUpperCase();
}

/**
 * Words that stay lowercase inside a title unless they are the first or last
 * word — the Chicago/AP convention. Anything four letters or longer is
 * capitalised regardless.
 */
const TITLE_MINOR_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'if', 'in', 'nor', 'of', 'on', 'or',
  'per', 'the', 'to', 'v', 'via', 'vs',
]);

/**
 * Title Case, applied to the original text so punctuation and spacing survive.
 * A word already containing an interior capital (`iPhone`, `macOS`, `JSON`) is
 * left exactly as typed, because it is almost certainly a proper spelling.
 */
export function toTitleCase(input: string): string {
  const tokens = input.split(/(\s+)/);
  const wordIndexes = tokens
    .map((t, i) => (WORDY.test(t) ? i : -1))
    .filter((i) => i >= 0);
  const first = wordIndexes[0];
  const last = wordIndexes[wordIndexes.length - 1];

  return tokens
    .map((token, i) => {
      if (!WORDY.test(token)) return token;
      if (/\p{Ll}\p{Lu}|\p{Lu}\p{Lu}/u.test(token)) return token;
      const bare = token.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
      if (i !== first && i !== last && TITLE_MINOR_WORDS.has(bare)) return token.toLowerCase();
      // Capitalise after any leading punctuation, e.g. `"hello` → `"Hello`.
      return token.toLowerCase().replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join('');
}

/**
 * Sentence case: everything lowercase except the first letter of each
 * sentence. Standalone `I` is restored, since lowercasing it is always wrong
 * in English.
 */
export function toSentenceCase(input: string): string {
  const lowered = input.toLowerCase();
  let out = '';
  let startOfSentence = true;

  for (const ch of lowered) {
    if (startOfSentence && /\p{L}/u.test(ch)) {
      out += ch.toUpperCase();
      startOfSentence = false;
      continue;
    }
    if (SENTENCE_ENDINGS.has(ch) || ch === '\n') startOfSentence = true;
    out += ch;
  }

  return out.replace(/(^|[^\p{L}\p{N}])i($|[^\p{L}\p{N}])/gu, (_, a: string, b: string) => `${a}I${b}`);
}

export interface CaseVariant {
  id: string;
  /** How the style is normally written, used as the row label. */
  label: string;
  /** One-line note on where the style is conventional. */
  hint: string;
  convert: (input: string) => string;
}

/** Every variant the converter offers, in the order it shows them. */
export const CASE_VARIANTS: readonly CaseVariant[] = [
  { id: 'camel', label: 'camelCase', hint: 'JavaScript variables, JSON keys', convert: toCamelCase },
  { id: 'pascal', label: 'PascalCase', hint: 'Classes, React components, types', convert: toPascalCase },
  { id: 'snake', label: 'snake_case', hint: 'Python, Ruby, SQL columns', convert: toSnakeCase },
  { id: 'screaming', label: 'SCREAMING_SNAKE_CASE', hint: 'Constants, environment variables', convert: toScreamingSnakeCase },
  { id: 'kebab', label: 'kebab-case', hint: 'URLs, CSS classes, CLI flags', convert: toKebabCase },
  { id: 'train', label: 'Train-Case', hint: 'HTTP headers such as Content-Type', convert: toTrainCase },
  { id: 'title', label: 'Title Case', hint: 'Headings and page titles', convert: toTitleCase },
  { id: 'sentence', label: 'Sentence case', hint: 'Body copy, UI labels, commit messages', convert: toSentenceCase },
  { id: 'lower', label: 'lowercase', hint: 'Normalising before comparison', convert: toLowerCase },
  { id: 'upper', label: 'UPPERCASE', hint: 'Emphasis, legacy systems', convert: toUpperCase },
  { id: 'dot', label: 'dot.case', hint: 'Config keys, feature flags, namespaces', convert: toDotCase },
  { id: 'path', label: 'path/case', hint: 'File paths and route segments', convert: toPathCase },
];

/** Run every conversion once. */
export function convertAllCases(input: string): { variant: CaseVariant; value: string }[] {
  return CASE_VARIANTS.map((variant) => ({ variant, value: variant.convert(input) }));
}

// ─── Lines: splitting, deduplication, sorting ─────────────────────────────

/** Split into lines, tolerating CRLF and a lone CR. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

export interface DedupeOptions {
  /** Which copy of a repeated line survives. Default `'first'`. */
  keep?: 'first' | 'last';
  caseInsensitive?: boolean;
  /** Compare lines with leading and trailing whitespace removed. */
  trim?: boolean;
  /** Output only the lines that appeared more than once. */
  invert?: boolean;
  /** Drop empty lines from the result entirely. */
  removeBlank?: boolean;
}

export interface DedupeResult {
  lines: string[];
  /** Lines in, before any blank-line removal. */
  total: number;
  /** How many lines the operation removed. */
  removed: number;
  /** How many distinct values appeared more than once. */
  duplicateValues: number;
  /** Distinct values in the input, under the active comparison rules. */
  unique: number;
}

const compareKey = (line: string, opts: DedupeOptions) => {
  let key = opts.trim ? line.trim() : line;
  if (opts.caseInsensitive) key = key.toLowerCase();
  return key;
};

/**
 * Remove repeated lines while preserving the original order.
 *
 * `invert` turns the tool inside out and returns one copy of each line that
 * occurred more than once — the fastest way to answer "which entries in this
 * export are duplicated?".
 */
export function dedupeLines(text: string, options: DedupeOptions = {}): DedupeResult {
  const opts = { keep: 'first' as const, ...options };
  const lines = splitLines(text);
  const counts = new Map<string, number>();

  for (const line of lines) {
    if (opts.removeBlank && !line.trim()) continue;
    const key = compareKey(line, opts);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let out: string[];

  if (opts.invert) {
    const emitted = new Set<string>();
    out = [];
    for (const line of lines) {
      if (opts.removeBlank && !line.trim()) continue;
      const key = compareKey(line, opts);
      if ((counts.get(key) ?? 0) > 1 && !emitted.has(key)) {
        emitted.add(key);
        out.push(line);
      }
    }
  } else if (opts.keep === 'last') {
    const seen = new Set<string>();
    out = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      if (opts.removeBlank && !line.trim()) continue;
      const key = compareKey(line, opts);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
    out.reverse();
  } else {
    const seen = new Set<string>();
    out = [];
    for (const line of lines) {
      if (opts.removeBlank && !line.trim()) continue;
      const key = compareKey(line, opts);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }

  let duplicateValues = 0;
  for (const n of counts.values()) if (n > 1) duplicateValues++;

  return {
    lines: out,
    total: lines.length,
    removed: lines.length - out.length,
    duplicateValues,
    unique: counts.size,
  };
}

export type SortMode = 'alpha' | 'numeric' | 'natural' | 'length' | 'random';

export interface SortOptions {
  mode?: SortMode;
  reverse?: boolean;
  caseSensitive?: boolean;
  /** Sort on the line's content, ignoring indentation. */
  ignoreLeadingWhitespace?: boolean;
  removeBlank?: boolean;
  /** Injectable randomness so shuffles can be tested. */
  random?: () => number;
}

/**
 * Compare strings the way a file manager does, so `file2` precedes `file10`.
 *
 * Both strings are walked in parallel as alternating runs of digits and
 * non-digits. Digit runs compare by value; everything else compares by code
 * unit. Leading zeros only break a tie, so `01` and `1` stay adjacent and
 * deterministic rather than ordering randomly.
 */
export function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const as = a.match(re) ?? [];
  const bs = b.match(re) ?? [];
  const n = Math.min(as.length, bs.length);

  for (let i = 0; i < n; i++) {
    const x = as[i]!;
    const y = bs[i]!;
    const xNum = /^\d/.test(x);
    const yNum = /^\d/.test(y);

    if (xNum && yNum) {
      // Compare by length first after stripping zeros: safe past 2^53.
      const xt = x.replace(/^0+(?=\d)/, '');
      const yt = y.replace(/^0+(?=\d)/, '');
      if (xt.length !== yt.length) return xt.length - yt.length;
      if (xt !== yt) return xt < yt ? -1 : 1;
      // Same value, different padding: the padded form sorts first, so
      // `img001` groups ahead of `img1` instead of ordering unpredictably.
      if (x.length !== y.length) return y.length - x.length;
      continue;
    }
    if (xNum !== yNum) return xNum ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }

  return as.length - bs.length;
}

/** Leading number of a line, or NaN. Handles `-`, `+`, decimals and `1,234`. */
export function leadingNumber(line: string): number {
  const m = line.trim().match(/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!m) return Number.NaN;
  return Number(m[0].replace(/,/g, ''));
}

export interface SortResult {
  lines: string[];
  /** Lines dropped because `removeBlank` was on. */
  blanksRemoved: number;
}

export function sortLines(text: string, options: SortOptions = {}): SortResult {
  const {
    mode = 'alpha',
    reverse = false,
    caseSensitive = false,
    ignoreLeadingWhitespace = false,
    removeBlank = false,
    random = Math.random,
  } = options;

  const all = splitLines(text);
  const lines = removeBlank ? all.filter((l) => l.trim() !== '') : all.slice();
  const blanksRemoved = all.length - lines.length;

  const key = (line: string) => {
    const base = ignoreLeadingWhitespace ? line.replace(/^\s+/, '') : line;
    return caseSensitive ? base : base.toLowerCase();
  };

  if (mode === 'random') {
    // Fisher-Yates. `reverse` is meaningless here and is ignored.
    for (let i = lines.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [lines[i], lines[j]] = [lines[j]!, lines[i]!];
    }
    return { lines, blanksRemoved };
  }

  // Decorate with the original index so every sort is stable everywhere.
  const decorated = lines.map((line, index) => ({ line, index, key: key(line) }));

  decorated.sort((a, b) => {
    let cmp = 0;
    switch (mode) {
      case 'numeric': {
        const x = leadingNumber(a.key);
        const y = leadingNumber(b.key);
        const xn = Number.isNaN(x);
        const yn = Number.isNaN(y);
        // Lines with no number sort to the end, in their original order.
        if (xn && yn) cmp = 0;
        else if (xn) cmp = 1;
        else if (yn) cmp = -1;
        else cmp = x - y;
        break;
      }
      case 'natural':
        cmp = naturalCompare(a.key, b.key);
        break;
      case 'length':
        cmp = a.line.length - b.line.length;
        break;
      default:
        cmp = a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    }
    if (cmp === 0) return a.index - b.index;
    return reverse ? -cmp : cmp;
  });

  return { lines: decorated.map((d) => d.line), blanksRemoved };
}

// ─── Whitespace normalisation ─────────────────────────────────────────────

/**
 * Invisible characters that break string comparison, `git diff` and CSV
 * imports while looking identical to a normal space — or to nothing at all.
 */
export const ZERO_WIDTH_CHARS: ReadonlyArray<[string, string]> = [
  ['\u200B', 'U+200B zero-width space'],
  ['\u200C', 'U+200C zero-width non-joiner'],
  ['\u200D', 'U+200D zero-width joiner'],
  ['\u2060', 'U+2060 word joiner'],
  ['\u00AD', 'U+00AD soft hyphen'],
  ['\uFEFF', 'U+FEFF byte-order mark'],
];

/** Space-like characters that are not U+0020. */
export const NBSP_CHARS: ReadonlyArray<[string, string]> = [
  ['\u00A0', 'U+00A0 non-breaking space'],
  ['\u202F', 'U+202F narrow no-break space'],
  ['\u2007', 'U+2007 figure space'],
  ['\u2009', 'U+2009 thin space'],
  ['\u200A', 'U+200A hair space'],
  ['\u2002', 'U+2002 en space'],
  ['\u2003', 'U+2003 em space'],
  ['\u3000', 'U+3000 ideographic space'],
  ['\u1680', 'U+1680 ogham space mark'],
];

export interface WhitespaceOptions {
  collapseSpaces?: boolean;
  trimLines?: boolean;
  removeBlankLines?: boolean;
  tabsToSpaces?: boolean;
  spacesToTabs?: boolean;
  stripZeroWidth?: boolean;
  normalizeNbsp?: boolean;
  /** Normalise CRLF and lone CR to LF. */
  normalizeNewlines?: boolean;
  /** Trim whitespace from the very start and end of the document. */
  trimDocument?: boolean;
  /** Width used by both tab conversions. Default 2. */
  tabWidth?: number;
  /**
   * Keep a zero-width joiner when it sits between two pictographs, so
   * stripping invisibles does not shatter 👨‍👩‍👧‍👦 into four people.
   * Default true.
   */
  preserveEmojiJoiners?: boolean;
}

export interface WhitespaceChange {
  label: string;
  count: number;
}

export interface WhitespaceResult {
  text: string;
  /** One entry per operation that actually did something, with a count. */
  changes: WhitespaceChange[];
  charactersRemoved: number;
  linesRemoved: number;
}

const EMOJI_JOIN =
  /(\p{Extended_Pictographic}[\uFE0F\u{1F3FB}-\u{1F3FF}]*)\u200D(?=\p{Extended_Pictographic})/gu;

/**
 * Apply any subset of the whitespace operations, in the only order that makes
 * sense: invisible characters first (so later steps see real spaces), then tab
 * conversion, then per-line trimming, then blank-line removal.
 */
export function normalizeWhitespace(text: string, options: WhitespaceOptions = {}): WhitespaceResult {
  const {
    collapseSpaces = false,
    trimLines = false,
    removeBlankLines = false,
    tabsToSpaces = false,
    spacesToTabs = false,
    stripZeroWidth = false,
    normalizeNbsp = false,
    normalizeNewlines = false,
    trimDocument = false,
    tabWidth = 2,
    preserveEmojiJoiners = true,
  } = options;

  const changes: WhitespaceChange[] = [];
  const originalLength = text.length;
  const originalLines = text === '' ? 0 : splitLines(text).length;
  let out = text;

  const record = (label: string, count: number) => {
    if (count > 0) changes.push({ label, count });
  };

  if (normalizeNewlines) {
    const count = (out.match(/\r\n?/g) ?? []).length;
    out = out.replace(/\r\n?/g, '\n');
    record('Line endings normalised to LF', count);
  }

  if (normalizeNbsp) {
    let count = 0;
    for (const [ch] of NBSP_CHARS) {
      const hits = out.split(ch).length - 1;
      if (hits) {
        count += hits;
        out = out.split(ch).join(' ');
      }
    }
    record('Non-breaking and exotic spaces replaced', count);
  }

  if (stripZeroWidth) {
    let protectedJoins = 0;
    const PLACEHOLDER = '\u0000\u0000';
    if (preserveEmojiJoiners) {
      out = out.replace(EMOJI_JOIN, (_, lead: string) => {
        protectedJoins++;
        return lead + PLACEHOLDER;
      });
    }
    let count = 0;
    for (const [ch] of ZERO_WIDTH_CHARS) {
      const hits = out.split(ch).length - 1;
      if (hits) {
        count += hits;
        out = out.split(ch).join('');
      }
    }
    if (protectedJoins) out = out.split(PLACEHOLDER).join('\u200D');
    record('Invisible characters removed', count);
    record('Emoji joiners kept intact', protectedJoins);
  }

  if (tabsToSpaces) {
    const count = (out.match(/\t/g) ?? []).length;
    out = out.replace(/\t/g, ' '.repeat(Math.max(1, tabWidth)));
    record('Tabs converted to spaces', count);
  }

  if (spacesToTabs) {
    const width = Math.max(1, tabWidth);
    const pattern = new RegExp(`^((?: {${width}})+)`, 'gm');
    let count = 0;
    out = out.replace(pattern, (run) => {
      const tabs = run.length / width;
      count += tabs;
      return '\t'.repeat(tabs);
    });
    record('Leading spaces converted to tabs', count);
  }

  if (collapseSpaces) {
    // Runs of two or more spaces/tabs, but never across a line break.
    let count = 0;
    out = out.replace(/[ \t]{2,}/g, (run) => {
      count++;
      return run.includes('\t') && !run.includes(' ') ? '\t' : ' ';
    });
    record('Repeated spaces collapsed', count);
  }

  if (trimLines) {
    let count = 0;
    out = splitLines(out)
      .map((line) => {
        const trimmed = line.replace(/^[ \t]+|[ \t]+$/g, '');
        if (trimmed !== line) count++;
        return trimmed;
      })
      .join('\n');
    record('Lines trimmed', count);
  }

  if (removeBlankLines) {
    const lines = splitLines(out);
    const kept = lines.filter((l) => l.trim() !== '');
    record('Blank lines removed', lines.length - kept.length);
    out = kept.join('\n');
  }

  if (trimDocument) {
    const trimmed = out.replace(/^\s+|\s+$/g, '');
    record('Leading/trailing whitespace removed', trimmed === out ? 0 : 1);
    out = trimmed;
  }

  return {
    text: out,
    changes,
    charactersRemoved: Math.max(0, originalLength - out.length),
    linesRemoved: Math.max(0, originalLines - (out === '' ? 0 : splitLines(out).length)),
  };
}

/**
 * Find invisible characters without changing anything — used to warn people
 * before they clean, and to explain what the cleaner is about to do.
 */
export function findInvisibles(text: string): { label: string; count: number }[] {
  const found: { label: string; count: number }[] = [];
  for (const [ch, label] of [...ZERO_WIDTH_CHARS, ...NBSP_CHARS]) {
    const count = text.split(ch).length - 1;
    if (count) found.push({ label, count });
  }
  const tabs = (text.match(/\t/g) ?? []).length;
  if (tabs) found.push({ label: 'Tab', count: tabs });
  const crlf = (text.match(/\r\n/g) ?? []).length;
  if (crlf) found.push({ label: 'CRLF line ending', count: crlf });
  const trailing = (text.match(/[ \t]+$/gm) ?? []).length;
  if (trailing) found.push({ label: 'Line with trailing whitespace', count: trailing });
  return found;
}

// ─── SMS segmentation ─────────────────────────────────────────────────────

/**
 * The GSM 03.38 basic alphabet, plus the extension characters that cost two
 * septets each. Anything outside this set forces the whole message into
 * UCS-2, which is why one curly apostrophe can halve an SMS limit.
 */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';

const GSM7_BASIC_SET = new Set(GSM7_BASIC);
const GSM7_EXTENDED_SET = new Set(GSM7_EXTENDED);

export interface SmsReport {
  /** 'GSM-7' when every character fits the basic alphabet, else 'UCS-2'. */
  encoding: 'GSM-7' | 'UCS-2';
  /** Billable units: septets for GSM-7, UTF-16 code units for UCS-2. */
  units: number;
  /** Units available in a single, non-concatenated message. */
  singleLimit: number;
  /** Units per part once the message is split across several. */
  multipartLimit: number;
  segments: number;
  /** Units left before another segment is needed. */
  remaining: number;
  /** Characters that forced UCS-2, de-duplicated, up to five of them. */
  offenders: string[];
}

/**
 * Work out how a carrier will bill a message.
 *
 * GSM-7 packs seven bits per character, giving 160 per message and 153 per
 * part when concatenated (the user-data header eats seven septets). A single
 * character outside the alphabet — a curly quote, an em dash, any emoji —
 * switches the entire message to UCS-2 at 70 and 67.
 */
export function smsReport(text: string): SmsReport {
  const offenders: string[] = [];
  const seen = new Set<string>();
  let units = 0;
  let gsm = true;

  for (const ch of text) {
    if (GSM7_BASIC_SET.has(ch)) {
      units += 1;
    } else if (GSM7_EXTENDED_SET.has(ch)) {
      units += 2;
    } else {
      gsm = false;
      if (!seen.has(ch)) {
        seen.add(ch);
        if (offenders.length < 5) offenders.push(ch);
      }
    }
  }

  if (!gsm) units = text.length; // UCS-2 bills per UTF-16 code unit.

  const singleLimit = gsm ? 160 : 70;
  const multipartLimit = gsm ? 153 : 67;
  const segments = units === 0 ? 0 : units <= singleLimit ? 1 : Math.ceil(units / multipartLimit);
  const capacity = segments <= 1 ? singleLimit : segments * multipartLimit;

  return {
    encoding: gsm ? 'GSM-7' : 'UCS-2',
    units,
    singleLimit,
    multipartLimit,
    segments,
    remaining: capacity - units,
    offenders,
  };
}

export interface PlatformLimit {
  id: string;
  name: string;
  limit: number;
  /** Which count the platform actually applies. */
  counts: 'graphemes' | 'characters' | 'bytes';
  note: string;
}

/** The limits people check a character counter against most often. */
export const PLATFORM_LIMITS: readonly PlatformLimit[] = [
  {
    id: 'x',
    name: 'X / Twitter post',
    limit: 280,
    counts: 'graphemes',
    note: 'CJK characters count double; links are always counted as 23.',
  },
  {
    id: 'meta',
    name: 'Meta description',
    limit: 160,
    counts: 'characters',
    note: 'Google truncates by pixel width near 920px, so 160 is a guideline.',
  },
  {
    id: 'title',
    name: 'Page title (Google)',
    limit: 60,
    counts: 'characters',
    note: 'Also pixel-based: roughly 580px on desktop results.',
  },
  {
    id: 'og',
    name: 'Open Graph title',
    limit: 88,
    counts: 'characters',
    note: 'Beyond this most social previews clip mid-word.',
  },
  {
    id: 'instagram',
    name: 'Instagram caption',
    limit: 2200,
    counts: 'characters',
    note: 'Only the first ~125 show before the "more" link.',
  },
  {
    id: 'postgres',
    name: 'varchar(255) column',
    limit: 255,
    counts: 'characters',
    note: 'PostgreSQL counts characters; MySQL utf8mb4 counts them too, but the row limit is in bytes.',
  },
];

// ─── Samples used by the tool pages ───────────────────────────────────────

export const SAMPLE_PROSE = `The cabin had no electricity, which turned out to be the point. We wrote
for four hours after sunrise and stopped when the light went flat, and the
work was better for the constraint.

Constraints do that. A word limit forces an argument to find its spine. A
deadline forces a draft to exist. A slow laptop, oddly, forces a writer to
think before typing, because backspacing is expensive when the cursor lags.

None of this makes constraints pleasant. It makes them useful, which is a
different and far less popular claim.`;

export const SAMPLE_SOCIAL = `Shipping a Unicode-aware counter today 🎉 — emoji like 👨‍👩‍👧‍👦 are one character to a reader, four code points plus three joiners to a database, and 25 bytes on the wire. Know which number your API is checking.`;

export const SAMPLE_IDENTIFIER = 'XMLHttpRequest retry policy v2';

export const SAMPLE_LIST = `alice@example.com
bob@example.com
ALICE@example.com
carol@example.com
bob@example.com
dave@example.com
carol@example.com`;

export const SAMPLE_SORT_LIST = `file10.txt
file2.txt
file1.txt
File20.txt
file3.txt
backup-2024-11.tar.gz
backup-2024-2.tar.gz`;

/**
 * Deliberately built from escapes so the invisible characters it demonstrates
 * survive a copy-paste, a linter and a code review. It carries a zero-width
 * space after the invoice number and a non-breaking space inside the amount —
 * exactly the pair that makes a spreadsheet paste fail without an error.
 */
export const SAMPLE_MESSY = [
  '  Invoice   number: INV-2024-0093\u200B',
  '\tCustomer:    Acme   Industries',
  '',
  '  Amount due:    1\u00A0240,00  EUR   ',
  '',
  'Terms:\tNet 30   ',
].join('\n');
