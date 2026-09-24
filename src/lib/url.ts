/**
 * Percent-encoding helpers shared by the URL encoder and decoder.
 *
 * The built-in functions are close but not sufficient on their own:
 *
 *  - `encodeURIComponent` leaves `!'()*` alone. Those are legal in a query
 *    string but not in every consumer, and RFC 3986 lists them as reserved
 *    sub-delimiters, so a strict mode has to escape them.
 *  - `encodeURI` preserves reserved characters so a whole URL survives, which
 *    is what you want for a link and exactly wrong for a parameter value.
 *  - `decodeURIComponent` throws a bare `URIError: URI malformed` that tells a
 *    user nothing about which escape is broken.
 *
 * Everything here is pure and DOM-free so it can be unit-tested in Node.
 */

export class UrlDecodeError extends Error {
  /** 0-based offset of the escape that failed. */
  readonly position?: number;
  constructor(message: string, position?: number) {
    super(message);
    this.name = 'UrlDecodeError';
    this.position = position;
  }
}

export type EncodeMode =
  /** `encodeURIComponent`: for one parameter value or path segment. */
  | 'component'
  /** `encodeURI`: for a whole URL, preserving `:/?#[]@` and friends. */
  | 'uri'
  /** `application/x-www-form-urlencoded`: like component, but space → `+`. */
  | 'form'
  /** RFC 3986 strict: component plus `!'()*`. */
  | 'rfc3986';

// ─── Encoding ─────────────────────────────────────────────────────────────

/**
 * Percent-encode `text` according to `mode`.
 *
 * All four modes encode as UTF-8 first, so "é" becomes `%C3%A9` (two bytes,
 * two escapes) rather than the single-byte Latin-1 `%E9` that the long-dead
 * `escape()` produced.
 */
export function encodeUrl(text: string, mode: EncodeMode = 'component'): string {
  switch (mode) {
    case 'uri':
      return encodeURI(text);
    case 'form':
      return encodeURIComponent(text).replace(/%20/g, '+').replace(/[!'()*]/g, hexEscape);
    case 'rfc3986':
      return encodeURIComponent(text).replace(/[!'()*]/g, hexEscape);
    case 'component':
    default:
      return encodeURIComponent(text);
  }
}

function hexEscape(ch: string): string {
  return '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
}

/** Characters `encodeURIComponent` leaves untouched, for the UI to explain. */
export const COMPONENT_UNRESERVED = "A–Z a–z 0–9 - _ . ! ~ * ' ( )";

/** Characters `encodeURI` additionally preserves, because a URL needs them. */
export const URI_PRESERVED = "; / ? : @ & = + $ , #";

export interface EncodeReport {
  output: string;
  /** Distinct characters that were escaped, with what they became. */
  changed: Array<{ char: string; escaped: string; count: number }>;
  /** Percent growth in length, which matters for URL length budgets. */
  growth: number;
}

/**
 * Encode and report which characters actually changed. Seeing that only the
 * space and the ampersand moved is usually the answer to "why is my link
 * broken?".
 */
export function encodeWithReport(text: string, mode: EncodeMode = 'component'): EncodeReport {
  const output = encodeUrl(text, mode);
  const counts = new Map<string, { escaped: string; count: number }>();

  for (const ch of text) {
    const escaped = encodeUrl(ch, mode);
    if (escaped === ch) continue;
    const existing = counts.get(ch);
    if (existing) existing.count++;
    else counts.set(ch, { escaped, count: 1 });
  }

  return {
    output,
    changed: [...counts.entries()].map(([char, v]) => ({ char, escaped: v.escaped, count: v.count })),
    growth: text.length === 0 ? 0 : Math.round(((output.length - text.length) / text.length) * 100),
  };
}

// ─── Decoding ─────────────────────────────────────────────────────────────

export interface DecodeOptions {
  /** Treat `+` as a space, as `application/x-www-form-urlencoded` requires. */
  plusAsSpace?: boolean;
  /** Leave broken escapes as literal text instead of throwing. */
  lenient?: boolean;
}

const HEX = /^[0-9a-fA-F]{2}$/;

/**
 * Decode percent-escapes into text, explaining any failure precisely.
 *
 * Bytes are collected across consecutive escapes before decoding, because a
 * single character can span up to four of them — decoding `%F0`, `%9F`, `%9B`
 * and `%A0` one at a time can never produce 🛠.
 */
export function decodeUrl(text: string, opts: DecodeOptions = {}): string {
  const { plusAsSpace = false, lenient = false } = opts;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let out = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === '+' && plusAsSpace) {
      out += ' ';
      i++;
      continue;
    }

    if (ch !== '%') {
      out += ch;
      i++;
      continue;
    }

    // Collect the whole run of escapes so multi-byte characters survive.
    const start = i;
    const bytes: number[] = [];
    while (text[i] === '%' && HEX.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 3;
    }

    if (bytes.length === 0) {
      const snippet = text.slice(start, start + 3);
      if (lenient) {
        out += ch;
        i++;
        continue;
      }
      throw new UrlDecodeError(
        start + 3 > text.length
          ? `The string ends with "${snippet}". A percent sign must be followed by two hex digits, for example %20.`
          : `"${snippet}" at position ${start} is not a valid escape. A percent sign must be followed by two hex digits (0–9, A–F), so a literal "%" has to be written as %25.`,
        start,
      );
    }

    try {
      out += decoder.decode(new Uint8Array(bytes));
    } catch {
      if (lenient) {
        out += new TextDecoder('utf-8').decode(new Uint8Array(bytes));
      } else {
        throw new UrlDecodeError(
          `The escape sequence starting at position ${start} (${text.slice(start, i)}) is not valid UTF-8. It may have been encoded with the legacy escape() function, which produced Latin-1 bytes such as %E9 for "é" instead of %C3%A9.`,
          start,
        );
      }
    }
  }

  return out;
}

/** Decode treating each escaped byte as Latin-1 — what `unescape()` did. */
export function decodeUrlLatin1(text: string): string {
  return text.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

export interface DeepDecodeResult {
  value: string;
  /** How many decode passes ran before the string stopped changing. */
  passes: number;
  /** Each intermediate value, oldest first — useful to show the chain. */
  steps: string[];
}

/**
 * Decode repeatedly until the string stops changing.
 *
 * Double encoding is common and confusing: a value passed through a redirect
 * chain arrives as `%253A` — `%3A` that was itself encoded, because `%` became
 * `%25`. One decode leaves `%3A` on screen, which looks like a bug rather than
 * a half-finished job.
 */
export function decodeUrlDeep(text: string, maxPasses = 5, opts: DecodeOptions = {}): DeepDecodeResult {
  const steps: string[] = [];
  let current = text;

  for (let pass = 0; pass < maxPasses; pass++) {
    let next: string;
    try {
      next = decodeUrl(current, { ...opts, lenient: true });
    } catch {
      break;
    }
    if (next === current) break;
    steps.push(next);
    current = next;
  }

  return { value: current, passes: steps.length, steps };
}

/** How many times a string appears to have been percent-encoded. */
export function encodingDepth(text: string): number {
  return decodeUrlDeep(text).passes;
}

// ─── Query strings ────────────────────────────────────────────────────────

export interface QueryParam {
  key: string;
  value: string;
  /** The key exactly as it appeared, before decoding. */
  rawKey: string;
  rawValue: string;
  /** True for `?flag` with no `=` at all, which is not the same as `?flag=`. */
  valueless: boolean;
  /** Set when the key or value could not be decoded. */
  error?: string;
}

export interface ParsedUrl {
  scheme?: string;
  authority?: string;
  path: string;
  query: string;
  fragment?: string;
  params: QueryParam[];
}

/**
 * Split a URL into parts using the RFC 3986 §B reference regular expression,
 * rather than `new URL()`, which rejects relative references and query
 * fragments pasted on their own.
 */
export function splitUrl(input: string): ParsedUrl {
  const text = input.trim();
  const match = text.match(/^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/);

  const scheme = match?.[1];
  const authority = match?.[2];
  const path = match?.[3] ?? '';
  const query = match?.[4] ?? '';
  const fragment = match?.[5];

  return { scheme, authority, path, query, fragment, params: parseQueryString(query) };
}

/**
 * Parse a query string into ordered pairs.
 *
 * Order and duplicates are preserved, which `URLSearchParams` also does but
 * `Object.fromEntries` famously does not — `?tag=a&tag=b` is two parameters,
 * and many APIs treat the repetition as meaningful.
 */
export function parseQueryString(input: string): QueryParam[] {
  let text = input.trim();
  // Accept a whole URL, a bare query, or one with a leading "?".
  const qIndex = text.indexOf('?');
  if (qIndex >= 0 && /^[a-z][a-z0-9+.-]*:|^\/\//i.test(text)) text = text.slice(qIndex + 1);
  else if (text.startsWith('?')) text = text.slice(1);
  const hash = text.indexOf('#');
  if (hash >= 0) text = text.slice(0, hash);

  if (!text) return [];

  return text
    .split(/[&;]/)
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      const param: QueryParam = {
        key: rawKey,
        value: rawValue,
        rawKey,
        rawValue,
        valueless: eq === -1,
      };
      try {
        param.key = decodeUrl(rawKey, { plusAsSpace: true });
        param.value = decodeUrl(rawValue, { plusAsSpace: true });
      } catch (err) {
        param.error = err instanceof Error ? err.message : 'This parameter could not be decoded.';
        param.key = decodeUrl(rawKey, { plusAsSpace: true, lenient: true });
        param.value = decodeUrl(rawValue, { plusAsSpace: true, lenient: true });
      }
      return param;
    });
}

/** Rebuild a query string from pairs, form-encoding both sides. */
export function buildQueryString(params: Array<{ key: string; value: string; valueless?: boolean }>): string {
  return params
    .map((p) =>
      p.valueless
        ? encodeUrl(p.key, 'form')
        : `${encodeUrl(p.key, 'form')}=${encodeUrl(p.value, 'form')}`,
    )
    .join('&');
}

/**
 * True when a value looks like it holds JSON, Base64 or another URL — the
 * three things worth offering a second decode step for.
 */
export function classifyValue(value: string): 'json' | 'url' | 'base64' | 'jwt' | 'text' {
  const trimmed = value.trim();
  if (/^eyJ[\w-]*\.[\w-]+\.[\w-]*$/.test(trimmed)) return 'jwt';
  if (/^[{[]/.test(trimmed) && /[}\]]$/.test(trimmed)) return 'json';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return 'url';
  if (trimmed.length >= 8 && trimmed.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return 'base64';
  }
  return 'text';
}

export const SAMPLE_PLAIN =
  'search?q=café & crème brûlée&tags=coffee/dessert&note=100% "worth it"';

export const SAMPLE_ENCODED =
  'https://findtool.dev/search?q=caf%C3%A9%20%26%20cr%C3%A8me&redirect=https%3A%2F%2Fexample.com%2Fnext%3Fid%3D42&note=100%25%20%22worth%20it%22&tag=a&tag=b';
