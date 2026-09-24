/**
 * A hand-written line diff.
 *
 * No dependencies: the algorithm is a classic longest-common-subsequence DP
 * with two practical additions that matter far more than raw asymptotics for
 * the texts people actually paste.
 *
 *   1. Identical prefixes and suffixes are stripped before the table is built.
 *      Two versions of a 2,000-line config that differ in one place reduce to
 *      a handful of lines, so the DP never sees the other 1,990.
 *   2. The DP is capped by cell count, not line count. Past the cap the tool
 *      says so and falls back to "this block was replaced" rather than
 *      freezing the tab for a minute.
 *
 * Pure and DOM-free — the renderer in TextDiff.astro turns this into nodes.
 */

export type DiffType = 'unchanged' | 'add' | 'remove' | 'changed';

export interface WordPart {
  type: 'unchanged' | 'add' | 'remove';
  text: string;
}

export interface DiffRow {
  type: DiffType;
  /** The line as it appears in the left/original text. */
  left?: string;
  /** The line as it appears in the right/modified text. */
  right?: string;
  /** 1-based line number in the left text. */
  leftNumber?: number;
  /** 1-based line number in the right text. */
  rightNumber?: number;
  /** Word-level breakdown of a `changed` row, when word diffing is on. */
  leftWords?: WordPart[];
  rightWords?: WordPart[];
}

export interface DiffStats {
  /** Lines that exist only in the right text. */
  additions: number;
  /** Lines that exist only in the left text. */
  deletions: number;
  /** Lines present in both but modified. */
  changed: number;
  unchanged: number;
  /** Total rows the viewer will render. */
  rows: number;
}

export interface DiffResult extends DiffStats {
  rows: number;
  lines: DiffRow[];
  /** True when the comparison hit the cost cap and was approximated. */
  approximated: boolean;
  /** Human-readable note when `approximated` is true. */
  note?: string;
  /** True when both sides are identical under the active options. */
  identical: boolean;
}

export interface DiffOptions {
  /** Treat runs of whitespace as equal, and ignore leading/trailing space. */
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  /** Pair up similar add/remove lines and diff them word by word. */
  wordLevel?: boolean;
  /**
   * Maximum DP cells. 4,000,000 is roughly a 2,000 × 2,000 changed region
   * after prefix/suffix stripping, which completes in well under a second.
   */
  maxCells?: number;
  /**
   * How alike two lines must be before they are shown as one modified row
   * instead of a delete plus an insert. 0–1, default 0.4.
   */
  similarityThreshold?: number;
}

const DEFAULT_MAX_CELLS = 4_000_000;

/** The comparison key for a line. Display always uses the original text. */
function keyFor(line: string, opts: DiffOptions): string {
  let key = line;
  if (opts.ignoreWhitespace) key = key.trim().replace(/\s+/g, ' ');
  if (opts.ignoreCase) key = key.toLowerCase();
  return key;
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/**
 * Longest common subsequence over two arrays of comparison keys, returned as
 * a list of `[aIndex, bIndex]` pairs. Uses a Uint32Array table because the
 * values are small and the allocation dominates the runtime otherwise.
 */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i--) {
    const rowOffset = i * width;
    const nextOffset = (i + 1) * width;
    const ai = a[i]!;
    for (let j = m - 1; j >= 0; j--) {
      table[rowOffset + j] =
        ai === b[j]!
          ? table[nextOffset + j + 1]! + 1
          : Math.max(table[nextOffset + j]!, table[rowOffset + j + 1]!);
    }
  }

  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i]! === b[j]!) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/** Crude but effective similarity: shared bigrams over total bigrams. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }

  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      counts.set(g, left - 1);
      hits++;
    }
  }

  return (2 * hits) / (a.length - 1 + b.length - 1);
}

/** Split into words while keeping the whitespace as its own tokens. */
export function tokenizeWords(line: string): string[] {
  return line.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Word-level diff inside one changed line. The token counts here are tiny
 * compared with a whole document, so the plain DP is always affordable.
 */
export function wordDiff(
  left: string,
  right: string,
  opts: DiffOptions = {},
): { left: WordPart[]; right: WordPart[] } {
  const a = tokenizeWords(left);
  const b = tokenizeWords(right);
  const aKeys = a.map((t) => keyFor(t, opts));
  const bKeys = b.map((t) => keyFor(t, opts));

  const pairs = lcsPairs(aKeys, bKeys);
  const leftParts: WordPart[] = [];
  const rightParts: WordPart[] = [];

  let ai = 0;
  let bi = 0;
  const pushLeft = (type: WordPart['type'], text: string) => push(leftParts, type, text);
  const pushRight = (type: WordPart['type'], text: string) => push(rightParts, type, text);

  for (const [pa, pb] of pairs) {
    while (ai < pa) pushLeft('remove', a[ai++]!);
    while (bi < pb) pushRight('add', b[bi++]!);
    pushLeft('unchanged', a[ai++]!);
    pushRight('unchanged', b[bi++]!);
  }
  while (ai < a.length) pushLeft('remove', a[ai++]!);
  while (bi < b.length) pushRight('add', b[bi++]!);

  return { left: leftParts, right: rightParts };
}

/** Merge adjacent parts of the same type so the DOM stays small. */
function push(parts: WordPart[], type: WordPart['type'], text: string): void {
  const last = parts[parts.length - 1];
  if (last && last.type === type) last.text += text;
  else parts.push({ type, text });
}

/**
 * Compare two texts line by line.
 *
 * The result is a flat, ordered list of rows. A side-by-side view renders each
 * row once; a unified view renders a `changed` row as a removal followed by an
 * addition. Both views therefore stay in agreement by construction.
 */
export function diffLines(leftText: string, rightText: string, options: DiffOptions = {}): DiffResult {
  const opts: DiffOptions = {
    wordLevel: true,
    maxCells: DEFAULT_MAX_CELLS,
    similarityThreshold: 0.4,
    ...options,
  };

  const a = splitLines(leftText);
  const b = splitLines(rightText);
  const aKeys = a.map((l) => keyFor(l, opts));
  const bKeys = b.map((l) => keyFor(l, opts));

  // ── 1. Strip the identical head and tail ──
  let head = 0;
  while (head < a.length && head < b.length && aKeys[head] === bKeys[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    aKeys[a.length - 1 - tail] === bKeys[b.length - 1 - tail]
  ) {
    tail++;
  }

  const aMid = a.slice(head, a.length - tail);
  const bMid = b.slice(head, b.length - tail);
  const aMidKeys = aKeys.slice(head, a.length - tail);
  const bMidKeys = bKeys.slice(head, b.length - tail);

  const rows: DiffRow[] = [];
  for (let i = 0; i < head; i++) {
    rows.push({ type: 'unchanged', left: a[i], right: b[i], leftNumber: i + 1, rightNumber: i + 1 });
  }

  // ── 2. Diff the middle, or give up honestly ──
  let approximated = false;
  let note: string | undefined;
  const cells = (aMid.length + 1) * (bMid.length + 1);
  const maxCells = opts.maxCells ?? DEFAULT_MAX_CELLS;

  const midRows: DiffRow[] = [];

  if (cells > maxCells) {
    approximated = true;
    const side = Math.floor(Math.sqrt(maxCells));
    note =
      `The changed region is ${aMid.length.toLocaleString()} × ${bMid.length.toLocaleString()} lines, ` +
      `past the ${side.toLocaleString()}-line limit for an exact line-by-line comparison. ` +
      `It is shown as one replaced block. Comparing smaller sections gives a precise diff.`;
    for (let i = 0; i < aMid.length; i++) {
      midRows.push({ type: 'remove', left: aMid[i], leftNumber: head + i + 1 });
    }
    for (let j = 0; j < bMid.length; j++) {
      midRows.push({ type: 'add', right: bMid[j], rightNumber: head + j + 1 });
    }
  } else {
    const pairs = lcsPairs(aMidKeys, bMidKeys);
    let ai = 0;
    let bi = 0;

    const flushBlock = (removed: number[], added: number[]) => {
      midRows.push(...pairBlock(removed, added, aMid, bMid, head, opts));
    };

    for (const [pa, pb] of pairs) {
      const removed: number[] = [];
      const added: number[] = [];
      while (ai < pa) removed.push(ai++);
      while (bi < pb) added.push(bi++);
      if (removed.length || added.length) flushBlock(removed, added);
      midRows.push({
        type: 'unchanged',
        left: aMid[ai],
        right: bMid[bi],
        leftNumber: head + ai + 1,
        rightNumber: head + bi + 1,
      });
      ai++;
      bi++;
    }

    const removed: number[] = [];
    const added: number[] = [];
    while (ai < aMid.length) removed.push(ai++);
    while (bi < bMid.length) added.push(bi++);
    if (removed.length || added.length) flushBlock(removed, added);
  }

  rows.push(...midRows);

  for (let t = tail; t > 0; t--) {
    const ai = a.length - t;
    const bi = b.length - t;
    rows.push({ type: 'unchanged', left: a[ai], right: b[bi], leftNumber: ai + 1, rightNumber: bi + 1 });
  }

  let additions = 0;
  let deletions = 0;
  let changed = 0;
  let unchanged = 0;
  for (const row of rows) {
    if (row.type === 'add') additions++;
    else if (row.type === 'remove') deletions++;
    else if (row.type === 'changed') changed++;
    else unchanged++;
  }

  return {
    lines: rows,
    additions,
    deletions,
    changed,
    unchanged,
    rows: rows.length,
    approximated,
    note,
    identical: additions === 0 && deletions === 0 && changed === 0,
  };
}

/**
 * Turn one block of removals and one block of insertions into rows.
 *
 * Removals and insertions are paired positionally. A pair that is similar
 * enough becomes a single `changed` row — the thing a reader actually wants
 * when a line was edited. Everything else stays a clean delete or insert,
 * because forcing two unrelated lines into one row reads far worse than
 * showing them apart.
 */
function pairBlock(
  removed: number[],
  added: number[],
  aMid: string[],
  bMid: string[],
  head: number,
  opts: DiffOptions,
): DiffRow[] {
  const rows: DiffRow[] = [];
  const threshold = opts.similarityThreshold ?? 0.4;
  const pairCount = Math.min(removed.length, added.length);

  const leftovers: { removedIndex: number; addedIndex: number }[] = [];

  for (let k = 0; k < pairCount; k++) {
    const ri = removed[k]!;
    const bi = added[k]!;
    const leftLine = aMid[ri]!;
    const rightLine = bMid[bi]!;
    const score = similarity(keyFor(leftLine, opts), keyFor(rightLine, opts));

    if (score >= threshold) {
      const row: DiffRow = {
        type: 'changed',
        left: leftLine,
        right: rightLine,
        leftNumber: head + ri + 1,
        rightNumber: head + bi + 1,
      };
      if (opts.wordLevel) {
        const parts = wordDiff(leftLine, rightLine, opts);
        row.leftWords = parts.left;
        row.rightWords = parts.right;
      }
      rows.push(row);
    } else {
      leftovers.push({ removedIndex: ri, addedIndex: bi });
    }
  }

  // Unpaired removals and insertions, plus any pair that was not similar.
  for (const { removedIndex } of leftovers) {
    rows.push({ type: 'remove', left: aMid[removedIndex], leftNumber: head + removedIndex + 1 });
  }
  for (let k = pairCount; k < removed.length; k++) {
    rows.push({ type: 'remove', left: aMid[removed[k]!], leftNumber: head + removed[k]! + 1 });
  }
  for (const { addedIndex } of leftovers) {
    rows.push({ type: 'add', right: bMid[addedIndex], rightNumber: head + addedIndex + 1 });
  }
  for (let k = pairCount; k < added.length; k++) {
    rows.push({ type: 'add', right: bMid[added[k]!], rightNumber: head + added[k]! + 1 });
  }

  return rows;
}

/**
 * Render the result as unified diff text, suitable for copying into a code
 * review comment. Not a valid `patch` file — there are no `@@` hunk headers —
 * but the `+`/`-`/space prefixes are the familiar ones.
 */
export function toUnifiedText(result: DiffResult): string {
  const out: string[] = [];
  for (const row of result.lines) {
    switch (row.type) {
      case 'unchanged':
        out.push(`  ${row.left ?? ''}`);
        break;
      case 'add':
        out.push(`+ ${row.right ?? ''}`);
        break;
      case 'remove':
        out.push(`- ${row.left ?? ''}`);
        break;
      case 'changed':
        out.push(`- ${row.left ?? ''}`);
        out.push(`+ ${row.right ?? ''}`);
        break;
    }
  }
  return out.join('\n');
}

// ─── Sample used by the tool page ─────────────────────────────────────────

export const SAMPLE_DIFF_LEFT = `server:
  host: 127.0.0.1
  port: 8080
  workers: 4
cache:
  driver: memory
  ttl: 300
logging:
  level: info
  format: text`;

export const SAMPLE_DIFF_RIGHT = `server:
  host: 0.0.0.0
  port: 8080
  workers: 8
  timeout: 30
cache:
  driver: redis
  ttl: 300
logging:
  level: debug
  format: json`;
