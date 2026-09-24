/**
 * Regular-expression helpers for the Regex Tester.
 *
 * Two things make this module different from "just call `String.match`":
 *
 *  1. **It is DOM-free and dependency-free.** The same file is imported by
 *     `src/workers/regex-worker.ts`, which runs in a Web Worker where there is
 *     no `document`, and by `tests/regex.test.ts`, which runs in Node. That is
 *     also why the HTML escaping below is local rather than imported from the
 *     toolkit — the worker should not pull the whole client toolkit in with it.
 *
 *  2. **It never trusts the pattern.** A user pattern is arbitrary code for a
 *     backtracking engine. `(a+)+$` against 30 `a`s and a `b` takes longer than
 *     the heat death of a coffee break, and JavaScript has no way to interrupt
 *     a running regex. The only real defence is to run it somewhere killable,
 *     which is what the worker is for — this module supplies the pure logic and
 *     the message that explains what happened.
 */

/** Hard ceiling on returned matches. Rendering 200,000 rows helps nobody. */
export const MAX_MATCHES = 5_000;

/** Flags the tester exposes, in the order the toggles are rendered. */
export const REGEX_FLAGS = [
  { flag: 'g', name: 'global', summary: 'Find every match, not just the first.' },
  { flag: 'i', name: 'ignoreCase', summary: 'Match regardless of upper or lower case.' },
  { flag: 'm', name: 'multiline', summary: '^ and $ match at every line break.' },
  { flag: 's', name: 'dotAll', summary: '. also matches newline characters.' },
  { flag: 'u', name: 'unicode', summary: 'Treat the pattern as Unicode code points.' },
  { flag: 'y', name: 'sticky', summary: 'Match only at lastIndex, never search forward.' },
] as const;

const VALID_FLAGS = 'dgimsuvy';

// ─── Result shapes ────────────────────────────────────────────────────────

export interface CaptureGroup {
  /** 1-based group number, as `$1` refers to it. */
  number: number;
  /** Present only for `(?<name>…)` groups. */
  name?: string;
  /** `undefined` when the group took part in no alternative that matched. */
  value: string | undefined;
  /** Offset in the test string, when the engine reported indices. */
  start?: number;
  end?: number;
}

export interface RegexMatch {
  /** Offset of the whole match in the test string. */
  index: number;
  /** Length in UTF-16 code units, which is what `index` is measured in too. */
  length: number;
  value: string;
  groups: CaptureGroup[];
  /** Named groups flattened, for the replace-preview hint. */
  named: Record<string, string | undefined>;
}

export interface RegexRunResult {
  matches: RegexMatch[];
  /** Number of matches found, which equals `matches.length` unless truncated. */
  count: number;
  /** True when `MAX_MATCHES` was hit and the list was cut short. */
  truncated: boolean;
  /** Result of applying the replacement, or null when none was requested. */
  replaced: string | null;
  /** Wall-clock milliseconds spent inside the engine. */
  durationMs: number;
}

// ─── Worker protocol ──────────────────────────────────────────────────────

/**
 * Everything the worker needs to do one run. It is deliberately a plain object
 * of primitives so it survives structured cloning with no surprises.
 */
export interface RegexRunRequest {
  /** Correlates a response with its request; a stale reply is discarded. */
  id: number;
  pattern: string;
  flags: string;
  text: string;
  /** Replacement template (`$1`, `$<name>`, `$&`), or null to skip the preview. */
  replacement: string | null;
  limit?: number;
}

export type RegexWorkerResponse =
  | { id: number; ok: true; result: RegexRunResult }
  | { id: number; ok: false; error: string; hint?: string };

/** Thrown for anything the user can fix by editing the pattern or the flags. */
export class RegexError extends Error {
  /** A second line of advice, shown under the message. */
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'RegexError';
    this.hint = hint;
  }
}

// ─── Compilation ──────────────────────────────────────────────────────────

/**
 * Validate the flag string on its own, before the engine gets a chance to
 * produce "Invalid flags supplied to RegExp constructor" — which does not say
 * which flag was wrong.
 */
export function validateFlags(flags: string): void {
  const seen = new Set<string>();
  for (const flag of flags) {
    if (!VALID_FLAGS.includes(flag)) {
      throw new RegexError(
        `"${flag}" is not a JavaScript regex flag. The available flags are g, i, m, s, u and y.`,
        'Flags like x (extended) and e (evaluate) exist in Perl and PCRE but not in JavaScript.',
      );
    }
    if (seen.has(flag)) {
      throw new RegexError(`The flag "${flag}" is listed twice. Each flag may appear only once.`);
    }
    seen.add(flag);
  }
  if (seen.has('u') && seen.has('v')) {
    throw new RegexError('The u and v flags cannot be combined — v is the newer of the two.');
  }
}

/**
 * Compile a pattern, translating the engine's terse `SyntaxError` into
 * something that names the actual mistake.
 *
 * The `d` flag is always added so match indices are available for capture
 * groups; it changes nothing else about how the pattern behaves.
 */
export function compilePattern(pattern: string, flags = ''): RegExp {
  if (pattern === '') {
    throw new RegexError('Enter a pattern to test. An empty pattern matches at every position.');
  }
  validateFlags(flags);
  const withIndices = [...new Set([...flags, 'd'])].join('');
  try {
    return new RegExp(pattern, withIndices);
  } catch (err) {
    throw explainSyntaxError(err, pattern);
  }
}

/**
 * Map a `SyntaxError` from the engine onto a sentence written for a person.
 *
 * Browsers word these differently (V8 says "Unterminated group", SpiderMonkey
 * says "unterminated parenthetical"), so the matching is on the concept rather
 * than on an exact string, and the raw message is kept as a fallback.
 */
export function explainSyntaxError(err: unknown, pattern: string): RegexError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  const unescapedCount = (ch: string) => {
    let n = 0;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '\\') {
        i++;
        continue;
      }
      if (pattern[i] === ch) n++;
    }
    return n;
  };

  if (lower.includes('unterminated group') || lower.includes('unterminated parenthetical')) {
    const open = unescapedCount('(');
    const close = unescapedCount(')');
    return new RegexError(
      `This pattern has ${open} opening bracket${open === 1 ? '' : 's'} and ${close} closing one${close === 1 ? '' : 's'}, so a group is never closed.`,
      'To match a literal bracket, escape it as \\( or \\).',
    );
  }
  if (lower.includes('unmatched )') || lower.includes('unmatched \')\'')) {
    return new RegexError(
      'There is a closing bracket with no matching opening bracket.',
      'A literal ) must be written as \\).',
    );
  }
  if (lower.includes('unterminated character class')) {
    return new RegexError(
      'A character class was opened with [ but never closed with ].',
      'A literal [ must be written as \\[.',
    );
  }
  if (lower.includes('nothing to repeat')) {
    return new RegexError(
      'A quantifier (*, +, ? or {n,m}) has nothing in front of it to repeat.',
      'This usually means a stray + or * at the start of the pattern, or a literal one that needs escaping as \\+.',
    );
  }
  if (lower.includes('lone quantifier brackets') || lower.includes('incomplete quantifier')) {
    return new RegexError(
      'A { was used where a quantifier was expected but the closing } is missing or the contents are not numbers.',
      'Write {2}, {2,} or {2,5}. A literal brace is \\{.',
    );
  }
  if (lower.includes('numbers out of order')) {
    return new RegexError(
      'The quantifier range is backwards — the first number must not be larger than the second, as in {2,5}.',
    );
  }
  if (lower.includes('duplicate capture group name')) {
    return new RegexError(
      'Two capture groups share the same name. Each (?<name>…) must be unique.',
      'The v flag relaxes this for groups in separate alternatives, but the u flag does not.',
    );
  }
  if (lower.includes('invalid capture group name') || lower.includes('invalid group')) {
    return new RegexError(
      'A named group is malformed. The syntax is (?<name>…), where the name starts with a letter, $ or _.',
      'Note that (?<…) with = or ! is a lookbehind: (?<=…) and (?<!…).',
    );
  }
  if (lower.includes('invalid named capture referenced') || lower.includes('invalid named reference')) {
    return new RegexError(
      'The pattern references \\k<name> for a group that does not exist. Check the spelling against the (?<name>…) you defined.',
    );
  }
  if (lower.includes('invalid unicode escape') || lower.includes('invalid escape')) {
    return new RegexError(
      'An escape sequence is not valid. With the u flag, every \\ must begin a known escape.',
      'Common causes: \\p{…} needs the u flag, and a literal backslash is written as \\\\.',
    );
  }
  if (lower.includes('range out of order')) {
    return new RegexError(
      'A character range runs backwards, such as [z-a]. The first character must come before the second.',
    );
  }
  if (lower.includes('invalid property name') || lower.includes('invalid property')) {
    return new RegexError(
      'That Unicode property escape is not recognised. Valid examples are \\p{L}, \\p{Nd} and \\p{Script=Greek}.',
    );
  }

  return new RegexError(
    `That pattern is not valid: ${raw.replace(/^Invalid regular expression:?\s*/i, '')}`,
  );
}

// ─── Matching ─────────────────────────────────────────────────────────────

/**
 * Map group number → group name by reading the pattern source.
 *
 * Doing it from the source rather than from `match.groups` is exact: two named
 * groups can capture identical text, and a group that did not participate
 * captures `undefined`, so matching names to numbers by value would guess.
 * Character classes are skipped because `[(]` is a literal bracket.
 */
export function captureGroupNames(source: string): Map<number, string> {
  const names = new Map<number, string>();
  let number = 0;
  let inClass = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      continue;
    }
    if (ch !== '(') continue;

    if (source[i + 1] !== '?') {
      number++;
      continue;
    }
    // (?<name>…) captures; (?<=…), (?<!…), (?:…), (?=…) and (?!…) do not.
    const named = /^\(\?<([^=!][^>]*)>/.exec(source.slice(i));
    if (named) {
      number++;
      names.set(number, named[1]!);
    }
  }
  return names;
}

/**
 * Collect matches from an already-compiled pattern.
 *
 * Two details are easy to get wrong:
 *  - A zero-length match — `a*` with the g flag against `"b"` — would loop
 *    forever unless `lastIndex` is nudged forward by hand.
 *  - Without the `g` or `y` flag `exec` always restarts at 0, so a single match
 *    is the correct and complete answer, not a bug.
 */
export function findMatches(re: RegExp, text: string, limit = MAX_MATCHES): {
  matches: RegexMatch[];
  truncated: boolean;
} {
  const matches: RegexMatch[] = [];
  const names = captureGroupNames(re.source);
  const repeating = re.global || re.sticky;

  if (!repeating) {
    const m = re.exec(text);
    return { matches: m ? [toMatch(m, names)] : [], truncated: false };
  }

  re.lastIndex = 0;
  let truncated = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    matches.push(toMatch(m, names));
    if (m[0] === '') re.lastIndex++;
  }
  return { matches, truncated };
}

function toMatch(m: RegExpExecArray, names: Map<number, string>): RegexMatch {
  const indices = (m as RegExpExecArray & { indices?: Array<[number, number] | undefined> })
    .indices;

  const groups: CaptureGroup[] = [];
  for (let i = 1; i < m.length; i++) {
    const span = indices?.[i];
    groups.push({
      number: i,
      ...(names.has(i) ? { name: names.get(i)! } : {}),
      value: m[i],
      ...(span ? { start: span[0], end: span[1] } : {}),
    });
  }

  return {
    index: m.index,
    length: m[0].length,
    value: m[0],
    groups,
    named: { ...(m.groups ?? {}) },
  };
}

/**
 * Compile, match and optionally build a replace preview — the single entry
 * point the worker calls, kept pure so the tests can call it directly.
 */
export function runRegex(req: RegexRunRequest): RegexRunResult {
  const re = compilePattern(req.pattern, req.flags);
  const started = now();
  const { matches, truncated } = findMatches(re, req.text, req.limit ?? MAX_MATCHES);

  let replaced: string | null = null;
  if (req.replacement !== null) {
    // A fresh RegExp: `replace` consumes lastIndex on a global pattern.
    replaced = req.text.replace(compilePattern(req.pattern, req.flags), req.replacement);
  }

  return {
    matches,
    count: matches.length,
    truncated,
    replaced,
    durationMs: Math.round((now() - started) * 100) / 100,
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ─── Catastrophic backtracking ────────────────────────────────────────────

/**
 * Look for the shape that causes exponential backtracking: a group that can
 * match the same text in more than one way, wrapped in another quantifier —
 * `(a+)+`, `(a*)*`, `(\s|\t)+` and friends.
 *
 * This is a heuristic used only to make the timeout message concrete. It is
 * not a safety mechanism; the worker timeout is. False negatives are fine,
 * and it deliberately never blocks a run.
 */
export function findNestedQuantifier(pattern: string): string | null {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') {
      i++;
      continue;
    }
    if (pattern[i] !== '(') continue;

    let depth = 0;
    let end = -1;
    for (let j = i; j < pattern.length; j++) {
      if (pattern[j] === '\\') {
        j++;
        continue;
      }
      if (pattern[j] === '(') depth++;
      else if (pattern[j] === ')') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) return null;

    const body = pattern.slice(i + 1, end);
    const after = pattern.slice(end + 1);
    const outer = /^(?:[*+]|\{\d+,\d*\})/.exec(after);
    if (!outer) continue;

    const innerQuantifier = /(?:^|[^\\])[*+]/.test(body) || /\{\d+,\d*\}/.test(body);
    const overlappingAlternation = body.includes('|');
    if (innerQuantifier || overlappingAlternation) {
      return pattern.slice(i, end + 1 + outer[0].length);
    }
  }
  return null;
}

/**
 * The message shown when the worker had to be terminated. It names the cause
 * rather than saying "timed out", because the fix is always in the pattern.
 */
export function timeoutMessage(pattern: string, timeoutMs: number): {
  message: string;
  hint: string;
} {
  const culprit = findNestedQuantifier(pattern);
  return {
    message:
      `This pattern was still running after ${timeoutMs} ms, so it was stopped. ` +
      `That is catastrophic backtracking: on text that almost matches, the engine ` +
      `retries an exponential number of combinations before giving up.`,
    hint: culprit
      ? `The likely cause is ${culprit} — a quantifier applied to a group that already contains one. ` +
        `The engine can split the same run of characters between the inner and outer repeat in exponentially many ways. ` +
        `Rewriting it with a single quantifier over a character class, such as [a-z]+, removes the ambiguity.`
      : `Look for a quantifier applied to a group that can already match the same text more than one way — ` +
        `(a+)+, (a|a)+ or (\\s*)* are the classic shapes. A single quantifier over a character class is always safe.`,
  };
}

// ─── Highlighting ─────────────────────────────────────────────────────────

/** Minimal HTML escape. Local so the worker bundle stays free of the toolkit. */
function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build highlighted HTML for the test string.
 *
 * Every character of user input is escaped before anything is wrapped, so the
 * only markup in the result is the `<mark>` elements this function adds.
 * Zero-length matches become a thin marker rather than disappearing.
 */
export function highlightMatches(text: string, matches: RegexMatch[]): string {
  let html = '';
  let cursor = 0;
  for (const m of matches) {
    if (m.index < cursor) continue; // overlapping results cannot be nested
    html += escape(text.slice(cursor, m.index));
    if (m.length === 0) {
      html += '<mark class="bc-match" data-empty="1">&#8203;</mark>';
    } else {
      html += `<mark class="bc-match">${escape(text.slice(m.index, m.index + m.length))}</mark>`;
    }
    cursor = m.index + m.length;
  }
  html += escape(text.slice(cursor));
  return html;
}

// ─── The pattern library ──────────────────────────────────────────────────

export interface PatternExample {
  id: string;
  label: string;
  pattern: string;
  flags: string;
  /** Sample text that produces matches and near-misses worth seeing. */
  sample: string;
  /** What the pattern does and, honestly, what it does not do. */
  note: string;
}

export const COMMON_PATTERNS: PatternExample[] = [
  {
    id: 'email',
    label: 'Email address',
    pattern: String.raw`[\w.+-]+@[\w-]+\.[\w.-]+`,
    flags: 'g',
    sample:
      'Contact ada@bytecabin.dev or the team at support+billing@example.co.uk.\nBroken: not.an.email@, @nope.com',
    note: 'Deliberately permissive. RFC 5322 allows quoted local parts and comments that no practical pattern should try to cover — validate by sending mail, not by regex.',
  },
  {
    id: 'url',
    label: 'URL',
    pattern: String.raw`https?://[^\s<>"']+`,
    flags: 'g',
    sample:
      'See https://bytecabin.dev/tools/regex-tester and http://example.com:8080/path?q=1#top for details.',
    note: 'Matches http and https only, and stops at whitespace or a quote. Trailing punctuation such as a full stop at the end of a sentence will be captured.',
  },
  {
    id: 'ipv4',
    label: 'IPv4 address',
    pattern: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b`,
    flags: 'g',
    sample: '10.0.0.1 192.168.1.255 8.8.8.8 — but not 999.1.1.1 or 256.0.0.1',
    note: 'Each octet is range-checked, so 256.0.0.1 is correctly rejected. IPv6 needs a very different pattern.',
  },
  {
    id: 'iso-date',
    label: 'ISO 8601 date',
    pattern: String.raw`(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])`,
    flags: 'g',
    sample: 'Released 2026-09-24, deprecated 2027-01-31. Invalid: 2026-13-01 and 2026-02-30.',
    note: 'Uses named groups, so the replace preview can use $<year>. It validates the shape, not the calendar — 2026-02-30 still matches.',
  },
  {
    id: 'uuid',
    label: 'UUID',
    pattern: String.raw`\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`,
    flags: 'gi',
    sample:
      '550e8400-e29b-41d4-a716-446655440000\n018f3c4a-1b2c-7d3e-8f90-a1b2c3d4e5f6\nNot a UUID: 550e8400-e29b-41d4-a716',
    note: 'Checks the version nibble (1–8) and the RFC 9562 variant nibble (8, 9, a or b), so it accepts UUIDv7 but rejects a random hex string of the right shape.',
  },
];

export const SAMPLE_PATTERN = COMMON_PATTERNS[0]!.pattern;
export const SAMPLE_TEXT = COMMON_PATTERNS[0]!.sample;
