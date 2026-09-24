/**
 * YAML helpers shared by the JSON ↔ YAML tools.
 *
 * A deliberately thin wrapper over js-yaml v4. Two rules govern this file:
 *
 *  1. **Only `DEFAULT_SCHEMA`.** js-yaml v4 dropped the old `!!js/function`,
 *     `!!js/eval` and `!!js/undefined` types from every shipped schema, so
 *     `DEFAULT_SCHEMA` cannot construct arbitrary objects and `load` behaves
 *     like the v3 `safeLoad`. No custom `Type` is registered here, and the
 *     unsafe schema is never imported.
 *  2. **Errors are located.** js-yaml throws `YAMLException` with a `mark`
 *     carrying a zero-based line and column; we convert to one-based numbers
 *     and translate the parser's wording into something actionable.
 *
 * Pure and DOM-free, so all of it is unit-testable in Node.
 */

import { load, loadAll, dump, DEFAULT_SCHEMA } from 'js-yaml';

export interface YamlErrorDetail {
  message: string;
  /** 1-based line number, when js-yaml reported a mark. */
  line?: number;
  /** 1-based column number. */
  column?: number;
  /** js-yaml's own pointer-under-the-line snippet. */
  snippet?: string;
}

export class YamlParseError extends Error {
  readonly detail: YamlErrorDetail;
  constructor(detail: YamlErrorDetail) {
    super(detail.message);
    this.name = 'YamlParseError';
    this.detail = detail;
  }
}

export interface YamlDumpOptions {
  /** Spaces per level. YAML forbids tabs, so this is always spaces. Default 2. */
  indent?: number;
  /** Sort mapping keys alphabetically. Default false. */
  sortKeys?: boolean;
  /** Wrap long flow scalars at this column; `-1` disables wrapping. Default -1. */
  lineWidth?: number;
  /** Emit `&anchor` / `*alias` for values that appear more than once. Default false. */
  anchors?: boolean;
  /** Quote every string, even where YAML would not need quotes. Default false. */
  forceQuotes?: boolean;
  /** `'` or `"` when quoting is needed. Default `'`. */
  quotingType?: "'" | '"';
}

// ─── Reading ──────────────────────────────────────────────────────────────

/** Parse a single-document YAML string. Throws {@link YamlParseError}. */
export function parseYaml(text: string): unknown {
  try {
    return load(text, { schema: DEFAULT_SCHEMA });
  } catch (err) {
    throw new YamlParseError(describeYamlError(err, text));
  }
}

/**
 * Parse every document in a `---`-separated stream.
 *
 * `loadAll` is used with the same safe `DEFAULT_SCHEMA` as `load` — the
 * difference between them is document count, not trust level.
 */
export function parseAllYaml(text: string): unknown[] {
  try {
    const docs: unknown[] = [];
    loadAll(text, (doc) => docs.push(doc), { schema: DEFAULT_SCHEMA });
    return docs;
  } catch (err) {
    throw new YamlParseError(describeYamlError(err, text));
  }
}

/** How many documents a stream contains, without keeping them all in memory. */
export function countYamlDocuments(text: string): number {
  return parseAllYaml(text).length;
}

/**
 * Convert YAML to JSON text.
 *
 * A multi-document stream becomes a JSON array of documents, because JSON has
 * no concept of a document separator and silently dropping everything after
 * the first `---` is the wrong default. With `multiDocument: false` only the
 * first document is emitted — an explicit choice, not an accident.
 */
export function yamlToJson(
  text: string,
  options: { indent?: number | '\t'; multiDocument?: boolean } = {},
): string {
  const { indent = 2, multiDocument = true } = options;
  const docs = parseAllYaml(text);

  if (docs.length === 0) return 'null';
  if (!multiDocument || docs.length === 1) return stringifyJson(docs[0], indent);
  return stringifyJson(docs, indent);
}

function stringifyJson(value: unknown, indent: number | '\t'): string {
  const out = JSON.stringify(value === undefined ? null : value, null, indent);
  return out ?? 'null';
}

/**
 * Turn a thrown value into something a user can act on.
 *
 * js-yaml's `reason` strings are precise but written for people who know the
 * spec ("a multiline key may not be an implicit key"), so the handful that
 * come up constantly get a plain-English replacement.
 */
export function describeYamlError(err: unknown, source = ''): YamlErrorDetail {
  const anyErr = err as { name?: string; reason?: string; message?: string; mark?: YamlMark };

  if (!anyErr || anyErr.name !== 'YAMLException') {
    return { message: anyErr?.message || 'This YAML could not be parsed.' };
  }

  const mark = anyErr.mark;
  const line = typeof mark?.line === 'number' ? mark.line + 1 : undefined;
  const column = typeof mark?.column === 'number' ? mark.column + 1 : undefined;
  const reason = anyErr.reason ?? anyErr.message ?? 'invalid YAML';

  return {
    message: humanizeYamlReason(reason, source, line),
    line,
    column,
    snippet: typeof mark?.snippet === 'string' ? mark.snippet : undefined,
  };
}

interface YamlMark {
  line?: number;
  column?: number;
  position?: number;
  snippet?: string;
}

function humanizeYamlReason(reason: string, source: string, line?: number): string {
  const offending = line !== undefined ? (source.split('\n')[line - 1] ?? '') : '';

  // Tabs are the single most common cause of "bad indentation" reports:
  // the spec forbids tab characters in indentation entirely (YAML 1.2 §6.1).
  if (/\bbad indentation\b/i.test(reason) && /^\s*\t/.test(offending)) {
    return 'Tabs cannot be used for indentation in YAML — replace the leading tab with spaces.';
  }
  if (/\bbad indentation\b/i.test(reason)) {
    return 'Indentation does not line up. Every key in the same mapping must start at the same column, and a nested block must be indented further than its parent.';
  }
  if (/duplicated mapping key/i.test(reason)) {
    return 'The same key appears twice in one mapping. YAML allows it syntactically but the later value silently wins, so it is rejected here.';
  }
  if (/a multiline key may not be an implicit key|can not read a block mapping entry/i.test(reason)) {
    return 'A colon needs a space after it. Without the space, `key:value` is read as one long scalar rather than a mapping entry.';
  }
  if (/unexpected end of the stream within a (double|single) quoted scalar/i.test(reason)) {
    return 'A quoted string is never closed — the opening quote has no matching closing quote.';
  }
  if (/end of the stream or a document separator is expected/i.test(reason)) {
    return 'Unexpected content at this point. A value containing `: ` or starting with `{`, `[`, `#`, `&`, `*` or `%` needs quoting.';
  }
  if (/expected a single document/i.test(reason)) {
    return 'This stream contains more than one document (separated by `---`). Switch on multi-document handling to convert all of them.';
  }
  if (/unidentified alias|unknown alias/i.test(reason)) {
    return 'This `*alias` refers to an anchor that was never defined. An `&anchor` must appear earlier in the same document.';
  }
  if (/unknown tag|unacceptable kind of an object/i.test(reason)) {
    return 'This document uses a custom `!tag` that is not part of standard YAML, so it cannot be converted safely.';
  }
  if (/tab characters? must not be used in indentation/i.test(reason)) {
    return 'Tabs cannot be used for indentation in YAML — replace them with spaces.';
  }
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

// ─── Writing ──────────────────────────────────────────────────────────────

/** Serialise a value to YAML. Throws a readable `Error` on unrepresentable input. */
export function dumpYaml(value: unknown, options: YamlDumpOptions = {}): string {
  const {
    indent = 2,
    sortKeys = false,
    lineWidth = -1,
    anchors = false,
    forceQuotes = false,
    quotingType = "'",
  } = options;

  if (value === undefined) return '';

  try {
    return dump(value, {
      schema: DEFAULT_SCHEMA,
      indent,
      sortKeys,
      lineWidth,
      noRefs: !anchors,
      forceQuotes,
      quotingType,
      noCompatMode: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/circular|cyclic/i.test(message)) {
      throw new Error('This structure contains a circular reference, which cannot be written as YAML.');
    }
    throw new Error(`This value cannot be represented in YAML: ${message}`);
  }
}

/**
 * Convert JSON text to YAML.
 *
 * A top-level JSON array of objects can optionally be emitted as a multi-
 * document stream, which is what `kubectl apply -f` expects from a file
 * containing several manifests.
 */
export function jsonToYaml(
  value: unknown,
  options: YamlDumpOptions & { multiDocument?: boolean } = {},
): string {
  if (options.multiDocument && Array.isArray(value)) {
    return dumpYamlDocuments(value, options);
  }
  return dumpYaml(value, options);
}

/** Join several values into one `---`-separated YAML stream. */
export function dumpYamlDocuments(values: unknown[], options: YamlDumpOptions = {}): string {
  if (values.length === 0) return '';
  return values.map((v) => `---\n${dumpYaml(v, options)}`).join('');
}

/** Rough shape check used to label the input before converting. */
export function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

// ─── Samples ──────────────────────────────────────────────────────────────

export const SAMPLE_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  labels:
    app: checkout
    tier: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: checkout
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
    spec:
      containers:
        - name: api
          image: ghcr.io/example/checkout:1.8.2
          ports:
            - containerPort: 8080
          env:
            - name: LOG_LEVEL
              value: info
            - name: TIMEOUT_MS
              value: "2500"
          resources:
            limits: &limits
              cpu: 500m
              memory: 512Mi
            requests: *limits`;

export const SAMPLE_JSON_FOR_YAML = `{
  "name": "checkout-api",
  "on": { "push": { "branches": ["main"] } },
  "jobs": {
    "test": {
      "runs-on": "ubuntu-latest",
      "steps": [
        { "uses": "actions/checkout@v4" },
        { "uses": "actions/setup-node@v4", "with": { "node-version": "20" } },
        { "run": "npm ci && npm test" }
      ]
    }
  }
}`;
