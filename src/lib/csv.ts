/**
 * CSV helpers shared by the CSV ↔ JSON tools.
 *
 * Hand-written to RFC 4180 rather than pulled from a library, because the
 * interesting cases are exactly the ones a naive `split(',')` gets wrong:
 * quoted fields containing the delimiter, embedded CRLF inside a quoted value,
 * and doubled quotes as the escape for a literal quote.
 *
 * Pure and DOM-free so every branch below is unit-testable in Node.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface CsvParseOptions {
  /** A single character. `'auto'` runs {@link detectDelimiter} first. */
  delimiter?: string;
  /** Treat the first row as column names. Default true. */
  header?: boolean;
  /** Convert `42`, `true` and `null` into real JSON types. Default true. */
  inferTypes?: boolean;
  /** Strip surrounding whitespace from every unquoted field. Default true. */
  trimFields?: boolean;
  /** Drop rows that are entirely empty. Default true. */
  skipEmptyLines?: boolean;
  /** Turn `address.city` headers into nested objects. Default false. */
  expandDotted?: boolean;
}

export interface CsvParseResult {
  /** Array of objects when `header` is on, array of arrays when it is off. */
  data: unknown[];
  /** Resolved column names (generated when there is no header row). */
  header: string[];
  /** The delimiter actually used, after auto-detection. */
  delimiter: string;
  rowCount: number;
  columnCount: number;
  /** Non-fatal problems worth telling the user about. */
  warnings: string[];
}

export interface JsonToCsvOptions {
  delimiter?: string;
  /** RFC 4180 says CRLF; most tooling is happy with either. Default `'\n'`. */
  eol?: '\n' | '\r\n';
  /** Emit the header row. Default true. */
  header?: boolean;
  /** Restrict and order the output columns. Default: every discovered column. */
  columns?: string[];
  /** How a nested array becomes cells. Default `'index'`. */
  arrayMode?: 'index' | 'join' | 'json';
  /** Separator used by `arrayMode: 'join'`. Default `'; '`. */
  joinSeparator?: string;
  /** Text written for `null` and `undefined`. Default `''`. */
  nullValue?: string;
  /** Quote every field, not just the ones that need it. Default false. */
  quoteAll?: boolean;
  /** Prepend a UTF-8 BOM so Excel detects the encoding. Default false. */
  bom?: boolean;
}

export const DELIMITERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe' },
];

// ─── Reading ──────────────────────────────────────────────────────────────

/**
 * Split CSV text into rows of raw string fields.
 *
 * A single pass over the characters with one boolean of state. Inside quotes
 * every character is literal — including the delimiter and newlines — and a
 * doubled quote (`""`) means one literal quote. Both CRLF and bare LF end a
 * row, and a trailing newline does not produce a phantom final row.
 */
export function parseCsvRows(text: string, delimiter = ','): string[][] {
  if (delimiter.length !== 1) {
    throw new Error('The delimiter must be exactly one character.');
  }
  if (delimiter === '"') {
    throw new Error('A double quote cannot be used as the delimiter — it is the escape character.');
  }

  // A BOM would otherwise become part of the first column name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoteStartLine = 1;
  let line = 1;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i]!;

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        if (c === '\n') line++;
        field += c;
        i++;
      }
      continue;
    }

    if (c === '"' && field === '') {
      inQuotes = true;
      quoteStartLine = line;
      i++;
    } else if (c === delimiter) {
      endField();
      i++;
    } else if (c === '\r') {
      endRow();
      line++;
      i += src[i + 1] === '\n' ? 2 : 1;
    } else if (c === '\n') {
      endRow();
      line++;
      i++;
    } else {
      // A quote that appears mid-field is not legal RFC 4180, but real
      // exports contain them (`3" pipe`). Keeping it literal is far more
      // useful than refusing the whole file.
      field += c;
      i++;
    }
  }

  if (inQuotes) {
    throw new Error(
      `Unterminated quoted field: the quote opened on line ${quoteStartLine} is never closed. ` +
        `A literal quote inside a quoted field must be doubled ("").`,
    );
  }

  // Ignore the newline that ends the final row, but keep a genuine last row.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * Guess the delimiter by parsing the start of the file with each candidate and
 * keeping the one that yields a consistent, greater-than-one column count.
 * Counting raw characters would be fooled by commas inside quoted fields.
 */
export function detectDelimiter(text: string, candidates = DELIMITERS.map((d) => d.value)): string {
  const sample = text.slice(0, 64_000);
  let best = candidates[0] ?? ',';
  let bestScore = -1;

  for (const candidate of candidates) {
    let rows: string[][];
    try {
      rows = parseCsvRows(sample, candidate).slice(0, 20);
    } catch {
      continue; // an unterminated quote in the truncated sample
    }
    const used = rows.filter((r) => r.length > 0);
    if (used.length === 0) continue;

    const first = used[0]!.length;
    if (first < 2) continue;
    const consistent = used.filter((r) => r.length === first).length / used.length;
    // Consistency dominates; column count only breaks ties.
    const score = consistent * 100 + Math.min(first, 40);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore < 0 ? (candidates[0] ?? ',') : best;
}

/** `007` stays a string; `9007199254740993` would lose precision, so it does too. */
const NUMERIC = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** Convert one raw CSV field into the JSON value it most likely represents. */
export function inferValue(raw: string): unknown {
  const t = raw.trim();
  if (t === '') return null;

  const lower = t.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null') return null;

  if (NUMERIC.test(t)) {
    // 17 significant digits is where IEEE-754 doubles stop round-tripping.
    if (t.replace(/[^0-9]/g, '').length > 15) return raw;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}

/** Make a set of column names unique and non-empty, reporting what changed. */
function normalizeHeader(cells: string[], warnings: string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((cell, index) => {
    let name = cell.trim();
    if (name === '') {
      name = `column_${index + 1}`;
      warnings.push(`Column ${index + 1} had an empty name and was called "${name}".`);
    }
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const unique = `${name}_${count + 1}`;
    warnings.push(`Duplicate column "${name}" was renamed to "${unique}".`);
    return unique;
  });
}

/** Assign `a.b.c` into a nested object, creating the intermediate levels. */
function assignDotted(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = node[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

/**
 * Parse CSV into JSON-ready data.
 *
 * Short rows are padded with `null` rather than dropped, long rows get
 * generated column names, and both cases are reported as warnings so the user
 * finds out about a ragged export instead of silently losing a column.
 */
export function csvToJson(text: string, options: CsvParseOptions = {}): CsvParseResult {
  const {
    header = true,
    inferTypes = true,
    trimFields = true,
    skipEmptyLines = true,
    expandDotted = false,
  } = options;

  const warnings: string[] = [];
  const delimiter =
    !options.delimiter || options.delimiter === 'auto'
      ? detectDelimiter(text)
      : options.delimiter;

  let rows = parseCsvRows(text, delimiter);
  if (skipEmptyLines) {
    rows = rows.filter((r) => r.length > 1 || (r[0] ?? '').trim() !== '');
  }

  if (rows.length === 0) {
    return { data: [], header: [], delimiter, rowCount: 0, columnCount: 0, warnings };
  }

  const clean = (cell: string) => (trimFields ? cell.trim() : cell);
  const cast = (cell: string) => (inferTypes ? inferValue(cell) : clean(cell));

  if (!header) {
    const width = Math.max(...rows.map((r) => r.length));
    return {
      data: rows.map((r) => r.map(cast)),
      header: Array.from({ length: width }, (_, i) => `column_${i + 1}`),
      delimiter,
      rowCount: rows.length,
      columnCount: width,
      warnings,
    };
  }

  const columns = normalizeHeader(rows[0]!, warnings);
  const body = rows.slice(1);
  let raggedShort = 0;
  let raggedLong = 0;

  const data = body.map((cells) => {
    if (cells.length < columns.length) raggedShort++;
    if (cells.length > columns.length) raggedLong++;

    const record: Record<string, unknown> = {};
    for (let i = 0; i < Math.max(columns.length, cells.length); i++) {
      const name = columns[i] ?? `column_${i + 1}`;
      const value = i < cells.length ? cast(cells[i]!) : null;
      if (expandDotted && name.includes('.')) assignDotted(record, name, value);
      else record[name] = value;
    }
    return record;
  });

  if (raggedShort) {
    warnings.push(
      `${raggedShort} row${raggedShort === 1 ? '' : 's'} had fewer fields than the header; the missing values are null.`,
    );
  }
  if (raggedLong) {
    warnings.push(
      `${raggedLong} row${raggedLong === 1 ? '' : 's'} had more fields than the header; the extras were named column_N.`,
    );
  }

  return {
    data,
    header: columns,
    delimiter,
    rowCount: data.length,
    columnCount: columns.length,
    warnings,
  };
}

// ─── Writing ──────────────────────────────────────────────────────────────

/** Quote a single field only when RFC 4180 requires it (or when asked to). */
export function escapeCsvField(value: string, delimiter = ',', quoteAll = false): string {
  const needsQuotes =
    quoteAll ||
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value !== value.trim();
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Serialise a rectangular array of rows back to CSV text. */
export function serializeCsv(
  rows: unknown[][],
  options: Pick<JsonToCsvOptions, 'delimiter' | 'eol' | 'quoteAll' | 'nullValue' | 'bom'> = {},
): string {
  const { delimiter = ',', eol = '\n', quoteAll = false, nullValue = '', bom = false } = options;
  const body = rows
    .map((row) =>
      row
        .map((cell) => escapeCsvField(cellToString(cell, nullValue), delimiter, quoteAll))
        .join(delimiter),
    )
    .join(eol);
  return bom ? '﻿' + body : body;
}

function cellToString(cell: unknown, nullValue: string): string {
  if (cell === null || cell === undefined) return nullValue;
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return JSON.stringify(cell) ?? '';
}

/**
 * Flatten one record into dotted column names.
 *
 * `{user: {name: 'Ada'}}` becomes `{'user.name': 'Ada'}`. Empty objects and
 * empty arrays still produce their column so the shape of the table does not
 * change from row to row.
 */
export function flattenRecord(
  value: unknown,
  options: Pick<JsonToCsvOptions, 'arrayMode' | 'joinSeparator'> = {},
  prefix = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  const { arrayMode = 'index', joinSeparator = '; ' } = options;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (prefix) out[prefix] = '';
      return out;
    }
    if (arrayMode === 'json') {
      out[prefix] = JSON.stringify(value);
      return out;
    }
    if (arrayMode === 'join') {
      out[prefix] = value
        .map((v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)))
        .join(joinSeparator);
      return out;
    }
    value.forEach((item, index) => {
      flattenRecord(item, options, prefix ? `${prefix}.${index}` : String(index), out);
    });
    return out;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      if (prefix) out[prefix] = '';
      return out;
    }
    for (const [key, item] of entries) {
      flattenRecord(item, options, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }

  out[prefix || 'value'] = value;
  return out;
}

/**
 * Normalise whatever the user pasted into a list of records.
 * A bare object becomes a single row; an array of primitives becomes one
 * `value` column; anything else is refused with a message worth reading.
 */
export function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    return value.map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return item as Record<string, unknown>;
      }
      if (Array.isArray(item)) {
        const row: Record<string, unknown> = {};
        item.forEach((cell, i) => (row[`column_${i + 1}`] = cell));
        return row;
      }
      if (item === undefined) {
        throw new Error(`Item ${index + 1} of the array is undefined, which has no CSV equivalent.`);
      }
      return { value: item };
    });
  }
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  throw new Error(
    'CSV needs a list of records. The top level of this JSON is a ' +
      describeType(value) +
      ' — wrap it in an array, or point at the array inside it.',
  );
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** The union of every flattened key, in first-seen order. */
export function csvColumnsFor(value: unknown, options: JsonToCsvOptions = {}): string[] {
  const seen = new Set<string>();
  for (const record of toRecordArray(value)) {
    for (const key of Object.keys(flattenRecord(record, options))) seen.add(key);
  }
  return Array.from(seen);
}

/**
 * Convert JSON to CSV.
 *
 * Records with different keys are unioned, so a row missing `phone` gets an
 * empty cell rather than shifting every later column left by one.
 */
export function jsonToCsv(value: unknown, options: JsonToCsvOptions = {}): string {
  const { header = true, eol = '\n' } = options;
  const records = toRecordArray(value);
  if (records.length === 0) return '';

  const flat = records.map((r) => flattenRecord(r, options));
  const columns =
    options.columns && options.columns.length > 0 ? options.columns : unionKeys(flat);

  const rows: unknown[][] = [];
  if (header) rows.push(columns);
  for (const record of flat) rows.push(columns.map((c) => record[c] ?? null));

  return serializeCsv(rows, { ...options, eol });
}

function unionKeys(records: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const record of records) for (const key of Object.keys(record)) seen.add(key);
  return Array.from(seen);
}

// ─── Samples ──────────────────────────────────────────────────────────────

export const SAMPLE_CSV = `id,name,email,plan,seats,active,signed_up
1042,"Lovelace, Ada",ada@example.com,pro,3,true,2026-01-14
1043,Grace Hopper,grace@example.com,team,12,true,2026-02-02
1044,Alan Turing,alan@example.com,free,1,false,2026-03-19
1045,"Katherine ""Kat"" Johnson",kat@example.com,pro,2,true,2026-04-07`;

export const SAMPLE_JSON_ROWS = `[
  {
    "id": 1042,
    "name": "Ada Lovelace",
    "contact": { "email": "ada@example.com", "country": "UK" },
    "plan": "pro",
    "seats": 3,
    "active": true
  },
  {
    "id": 1043,
    "name": "Grace Hopper",
    "contact": { "email": "grace@example.com", "country": "US" },
    "plan": "team",
    "seats": 12,
    "active": true,
    "trial_ends": "2026-05-01"
  }
]`;
