/**
 * JSON helpers shared by the JSON family of tools.
 *
 * Pure and DOM-free so they can be unit-tested in Node, and so the same
 * parsing/error logic backs the formatter, validator, minifier and viewer.
 */

export interface JsonError {
  message: string;
  /** 1-based line number, when it can be determined. */
  line?: number;
  /** 1-based column number. */
  column?: number;
  /** 0-based character offset into the source. */
  position?: number;
  /** The source line containing the error, for display. */
  excerpt?: string;
}

export class JsonParseError extends Error {
  readonly detail: JsonError;
  constructor(detail: JsonError) {
    super(detail.message);
    this.name = 'JsonParseError';
    this.detail = detail;
  }
}

/**
 * Turn a native SyntaxError into something a human can act on.
 *
 * Browsers disagree wildly about JSON error messages — V8 says "Unexpected
 * token } in JSON at position 42", Firefox says "JSON.parse: expected double-
 * quoted property name", Safari something else again. We extract a position
 * where one is offered, compute line/column ourselves, and add the specific
 * hint for the handful of mistakes that cause most real failures.
 */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new JsonParseError(describeJsonError(err, text));
  }
}

export function describeJsonError(err: unknown, source: string): JsonError {
  const raw = err instanceof Error ? err.message : String(err);

  // Both "at position 42" and "at line 3 column 5" appear across engines.
  let position: number | undefined;
  const posMatch = raw.match(/position (\d+)/i);
  if (posMatch) position = Number(posMatch[1]);

  // V8 in recent Node/Chrome drops the position for some errors and prints a
  // context snippet instead ("Unexpected token ',', ...\"x\" is not valid
  // JSON"). Falling back to our own scanner keeps line/column reporting
  // reliable across engines rather than depending on message wording.
  let scan: ScanError | null = null;
  if (position === undefined && !/line \d+ column \d+/i.test(raw)) {
    scan = scanForError(source);
    position = scan?.index;
  }

  let line: number | undefined;
  let column: number | undefined;

  const lineColMatch = raw.match(/line (\d+) column (\d+)/i);
  if (lineColMatch) {
    line = Number(lineColMatch[1]);
    column = Number(lineColMatch[2]);
  } else if (position !== undefined) {
    const before = source.slice(0, position);
    line = before.split('\n').length;
    column = position - before.lastIndexOf('\n');
  }

  const lines = source.split('\n');
  const excerpt = line !== undefined ? lines[line - 1] : undefined;

  return {
    message: humanizeJsonError(raw, source, position, scan),
    line,
    column,
    position,
    excerpt: excerpt?.length && excerpt.length > 200 ? excerpt.slice(0, 200) + '…' : excerpt,
  };
}

export interface ScanError {
  /** 0-based index of the first character that is not valid here. */
  index: number;
  /** What the parser was expecting at that point. */
  expected: string;
}

/**
 * A minimal recursive-descent JSON validator whose only job is to report
 * *where* a document first goes wrong.
 *
 * We do not use it to parse — `JSON.parse` is faster and authoritative. It
 * exists because engines disagree about whether an error message includes a
 * position, and a formatter that cannot point at the bad character is much
 * less useful than one that can.
 *
 * Returns null when the document is valid.
 */
export function scanForError(source: string): ScanError | null {
  let i = 0;

  const ws = () => {
    while (i < source.length && (source[i] === ' ' || source[i] === '\t' || source[i] === '\n' || source[i] === '\r')) i++;
  };

  const err = (expected: string): ScanError => ({ index: Math.min(i, source.length), expected });

  const string = (): ScanError | null => {
    if (source[i] !== '"') return err('a string');
    i++;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '"') {
        i++;
        return null;
      }
      if (ch === '\\') {
        i++;
        const esc = source[i];
        if (esc === undefined) return err('an escape sequence');
        if (esc === 'u') {
          const hex = source.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            i++;
            return err('four hexadecimal digits after \\u');
          }
          i += 5;
        } else if ('"\\/bfnrt'.includes(esc)) {
          i++;
        } else {
          return err('a valid escape character');
        }
        continue;
      }
      // Raw control characters are illegal inside a JSON string.
      if (ch < ' ') return err('an escaped control character (use \\n or \\t)');
      i++;
    }
    return err('a closing double quote');
  };

  const number = (): ScanError | null => {
    const start = i;
    if (source[i] === '-') i++;
    if (source[i] === '0') i++;
    else if (source[i] >= '1' && source[i] <= '9') while (source[i] >= '0' && source[i] <= '9') i++;
    else return err('a digit');

    if (source[i] === '.') {
      i++;
      if (!(source[i] >= '0' && source[i] <= '9')) return err('a digit after the decimal point');
      while (source[i] >= '0' && source[i] <= '9') i++;
    }
    if (source[i] === 'e' || source[i] === 'E') {
      i++;
      if (source[i] === '+' || source[i] === '-') i++;
      if (!(source[i] >= '0' && source[i] <= '9')) return err('a digit in the exponent');
      while (source[i] >= '0' && source[i] <= '9') i++;
    }
    return i > start ? null : err('a number');
  };

  const literal = (word: string): ScanError | null => {
    if (source.startsWith(word, i)) {
      i += word.length;
      return null;
    }
    return err(`"${word}"`);
  };

  const value = (depth: number): ScanError | null => {
    if (depth > 512) return err('less deeply nested data');
    ws();
    const ch = source[i];
    if (ch === undefined) return err('a value');

    if (ch === '{') {
      i++;
      ws();
      if (source[i] === '}') {
        i++;
        return null;
      }
      for (;;) {
        ws();
        const keyErr = string();
        if (keyErr) return keyErr;
        ws();
        if (source[i] !== ':') return err('a colon after the property name');
        i++;
        const valErr = value(depth + 1);
        if (valErr) return valErr;
        ws();
        if (source[i] === ',') {
          i++;
          ws();
          // A closing brace straight after a comma is the classic trailing comma.
          if (source[i] === '}') return err('another property (remove the trailing comma)');
          continue;
        }
        if (source[i] === '}') {
          i++;
          return null;
        }
        return err('a comma or a closing brace');
      }
    }

    if (ch === '[') {
      i++;
      ws();
      if (source[i] === ']') {
        i++;
        return null;
      }
      for (;;) {
        const itemErr = value(depth + 1);
        if (itemErr) return itemErr;
        ws();
        if (source[i] === ',') {
          i++;
          ws();
          if (source[i] === ']') return err('another value (remove the trailing comma)');
          continue;
        }
        if (source[i] === ']') {
          i++;
          return null;
        }
        return err('a comma or a closing bracket');
      }
    }

    if (ch === '"') return string();
    if (ch === 't') return literal('true');
    if (ch === 'f') return literal('false');
    if (ch === 'n') return literal('null');
    if (ch === '-' || (ch >= '0' && ch <= '9')) return number();
    return err('a value');
  };

  ws();
  if (i >= source.length) return { index: 0, expected: 'a value' };

  const rootErr = value(0);
  if (rootErr) return rootErr;

  ws();
  if (i < source.length) return err('the end of the document');

  return null;
}

/**
 * Add a concrete explanation for the mistakes people actually make, rather
 * than passing the engine's wording straight through.
 */
function humanizeJsonError(
  raw: string,
  source: string,
  position?: number,
  scan?: ScanError | null,
): string {
  const near = position !== undefined ? source.slice(Math.max(0, position - 24), position + 1) : '';

  if (/^\s*$/.test(source)) return 'There is nothing to parse yet — paste some JSON first.';

  // Our own scanner produces the most actionable wording, so prefer it for
  // the cases it recognises specifically.
  if (scan?.expected.includes('trailing comma')) {
    return 'Trailing comma: JSON does not allow a comma after the last item in an object or array.';
  }
  if (scan?.expected.includes('control character')) {
    return 'A raw newline or tab appears inside a string. Escape them as \\n and \\t.';
  }
  if (scan?.expected === 'a string' && source[scan.index] === "'") {
    return 'Single quotes are not valid in JSON — strings and keys both require double quotes.';
  }
  if (scan?.expected === 'a string') {
    return 'Expected a double-quoted property name here. Keys must be quoted, and only with double quotes.';
  }

  if (/trailing comma/i.test(raw) || /,\s*[}\]]\s*$/.test(near)) {
    return 'Trailing comma: JSON does not allow a comma after the last item in an object or array.';
  }
  if (/double-quoted property name|expected property name/i.test(raw)) {
    return 'Property names must be wrapped in double quotes. Single quotes and bare keys are not valid JSON.';
  }
  if (/Unexpected token '?/.test(raw) && /'/.test(near)) {
    return 'Single quotes are not valid in JSON — strings and keys both require double quotes.';
  }
  if (/Unexpected end of (JSON )?input|Unexpected EOF|end of data/i.test(raw)) {
    return 'The document ends too early — a bracket or brace was opened and never closed.';
  }
  if (/Unexpected non-whitespace character after JSON/i.test(raw)) {
    return 'There is extra content after the end of the JSON value. A file can only contain one top-level value.';
  }
  if (/Bad control character|control character in string/i.test(raw)) {
    return 'A raw newline or tab appears inside a string. Escape them as \\n and \\t.';
  }
  if (/NaN|Infinity/.test(near)) {
    return 'NaN and Infinity are not valid JSON numbers.';
  }

  // Fall back to the scanner's expectation, which is always specific.
  if (scan) {
    const found = source[scan.index];
    const shown =
      found === undefined
        ? 'the document ended'
        : `found ${JSON.stringify(found)}`;
    return `Expected ${scan.expected} here, but ${shown}.`;
  }

  return raw.replace(/^JSON\.parse:\s*/, '').replace(/\s+in JSON at position \d+/, '');
}

/** Pretty-print, preserving key order. `indent` may be a number or "\t". */
export function formatJson(text: string, indent: number | '\t' = 2): string {
  return JSON.stringify(parseJson(text), null, indent);
}

/** Remove all insignificant whitespace. */
export function minifyJson(text: string): string {
  return JSON.stringify(parseJson(text));
}

/** Recursively sort object keys — useful for diffing two API responses. */
export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortJsonKeys(v)]));
  }
  return value;
}

export interface JsonStats {
  bytes: number;
  lines: number;
  keys: number;
  depth: number;
  arrays: number;
  objects: number;
}

export function jsonStats(value: unknown, serialized: string): JsonStats {
  let keys = 0;
  let arrays = 0;
  let objects = 0;
  let depth = 0;

  const walk = (node: unknown, level: number) => {
    if (level > depth) depth = level;
    if (Array.isArray(node)) {
      arrays++;
      for (const item of node) walk(item, level + 1);
    } else if (node && typeof node === 'object') {
      objects++;
      for (const [, v] of Object.entries(node as Record<string, unknown>)) {
        keys++;
        walk(v, level + 1);
      }
    }
  };
  walk(value, 1);

  return {
    bytes: new TextEncoder().encode(serialized).length,
    lines: serialized.split('\n').length,
    keys,
    depth,
    arrays,
    objects,
  };
}

/**
 * Syntax-highlight already-valid JSON.
 *
 * The input is escaped before any markup is added, so the result is safe to
 * assign to innerHTML. Tokenising by regex is acceptable here because the
 * string is known to be JSON.stringify output, not arbitrary user text.
 */
export function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'tok-num';
      if (match.startsWith('"')) {
        cls = match.trimEnd().endsWith(':') ? 'tok-key' : 'tok-str';
      } else if (match === 'true' || match === 'false') {
        cls = 'tok-bool';
      } else if (match === 'null') {
        cls = 'tok-null';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

/**
 * Find keys that appear twice inside the same object.
 *
 * `JSON.parse` keeps the last one and says nothing, so `{"a":1,"a":2}` parses
 * cleanly and silently loses a value. RFC 8259 §4 calls duplicate names
 * "unpredictable" rather than illegal, which is exactly why it is worth
 * flagging. Runs a small string-aware scan; only meaningful on valid JSON.
 */
export function findDuplicateKeys(text: string): { key: string; line: number }[] {
  const duplicates: { key: string; line: number }[] = [];
  // A Set per object level; `null` marks an array level, where there are no keys.
  const stack: (Set<string> | null)[] = [];
  let i = 0;
  let line = 1;

  while (i < text.length) {
    const c = text[i]!;

    if (c === '\n') {
      line++;
      i++;
    } else if (c === '"') {
      const startLine = line;
      let value = '';
      i++;
      while (i < text.length) {
        const ch = text[i]!;
        if (ch === '\\') {
          value += ch + (text[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (ch === '"') {
          i++;
          break;
        }
        if (ch === '\n') line++;
        value += ch;
        i++;
      }
      const container = stack[stack.length - 1];
      if (container instanceof Set) {
        let j = i;
        while (j < text.length && /\s/.test(text[j]!)) j++;
        if (text[j] === ':') {
          if (container.has(value)) duplicates.push({ key: value, line: startLine });
          else container.add(value);
        }
      }
    } else if (c === '{') {
      stack.push(new Set());
      i++;
    } else if (c === '[') {
      stack.push(null);
      i++;
    } else if (c === '}' || c === ']') {
      stack.pop();
      i++;
    } else {
      i++;
    }
  }

  return duplicates;
}

/** The JSON type name shown on a badge in the viewer. */
export function jsonTypeOf(value: unknown): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  return t === 'object' ? 'object' : (t as 'string' | 'number' | 'boolean');
}

/** A representative, non-trivial sample used by the Example buttons. */
export const SAMPLE_JSON = `{
  "id": "evt_1P9xKlC2eZvKYlo2",
  "type": "checkout.session.completed",
  "created": 1735689600,
  "livemode": false,
  "data": {
    "object": {
      "id": "cs_test_a1B2c3D4",
      "amount_total": 4999,
      "currency": "usd",
      "customer_email": "ada@example.com",
      "line_items": [
        { "description": "Pro plan (annual)", "quantity": 1, "amount": 4999 }
      ],
      "metadata": { "plan": "pro", "seats": "3" },
      "payment_status": "paid"
    }
  },
  "pending_webhooks": 1
}`;

/** Deliberately broken JSON: four separate mistakes, one per exercise. */
export const SAMPLE_JSON_INVALID = `{
  "service": "checkout-api",
  "replicas": 3,
  "flags": ['beta', 'canary'],
  "limits": {
    "cpu": "500m",
    "memory": "512Mi",
  }
}`;

/** A deeper document with repeated structures, used by the tree viewer. */
export const SAMPLE_JSON_DEEP = `{
  "org": {
    "id": "org_8fK2",
    "name": "Northwind Robotics",
    "plan": { "tier": "enterprise", "seats": 250, "renews_at": "2027-01-31" },
    "regions": ["eu-west-1", "us-east-1", "ap-southeast-2"]
  },
  "projects": [
    {
      "id": "prj_01",
      "name": "warehouse-vision",
      "archived": false,
      "environments": [
        { "name": "production", "url": "https://wv.example.com", "replicas": 6, "healthy": true },
        { "name": "staging", "url": "https://wv.staging.example.com", "replicas": 1, "healthy": true }
      ],
      "owners": [
        { "email": "ada@example.com", "role": "admin", "mfa": true },
        { "email": "grace@example.com", "role": "maintainer", "mfa": false }
      ],
      "settings": { "retention_days": 90, "alerts": { "email": true, "slack": "#wv-alerts", "pagerduty": null } }
    },
    {
      "id": "prj_02",
      "name": "fleet-telemetry",
      "archived": true,
      "environments": [
        { "name": "production", "url": "https://ft.example.com", "replicas": 0, "healthy": false }
      ],
      "owners": [{ "email": "alan@example.com", "role": "admin", "mfa": true }],
      "settings": { "retention_days": 30, "alerts": { "email": false, "slack": null, "pagerduty": null } }
    }
  ],
  "usage": { "events_30d": 18422931, "storage_gb": 412.75, "overage_usd": 0 }
}`;
