/**
 * Base64 helpers shared by the Base64 encoder and decoder.
 *
 * Pure and DOM-free so they can be unit-tested in Node. The implementation is
 * deliberately hand-rolled rather than delegating to `btoa`/`atob`, for three
 * reasons:
 *
 *  1. `btoa` throws on any code unit above U+00FF, so it cannot encode "héllo"
 *     — let alone an emoji — without a lossy pre-step. Everything here goes
 *     through `TextEncoder`/`TextDecoder`, so UTF-8 is handled correctly.
 *  2. `atob` silently accepts input that RFC 4648 rejects and gives no clue
 *     about *why* something failed. We want to tell the user which character
 *     at which offset is the problem.
 *  3. The URL-safe alphabet (RFC 4648 §5) and line wrapping (RFC 2045's
 *     76-column MIME rule) need explicit support anyway.
 */

const STANDARD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URLSAFE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Reverse lookup accepting both alphabets, so decoding never needs a mode. */
const DECODE_TABLE: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < STANDARD_ALPHABET.length; i++) table[STANDARD_ALPHABET[i]!] = i;
  table['-'] = 62;
  table['_'] = 63;
  return table;
})();

/** The MIME line length from RFC 2045 §6.8. */
export const MIME_LINE_LENGTH = 76;

export interface EncodeOptions {
  /** Use the URL-safe alphabet from RFC 4648 §5: `-` and `_` for `+` and `/`. */
  urlSafe?: boolean;
  /** Emit `=` padding. Default true; JWTs and many APIs want it off. */
  padding?: boolean;
  /** Insert a line break every N characters. 0 (default) means one long line. */
  wrap?: number;
  /** Line ending used by `wrap`. RFC 2045 specifies CRLF; `\n` is friendlier. */
  newline?: string;
}

export class Base64Error extends Error {
  /** 0-based offset of the offending character, when one can be identified. */
  readonly position?: number;
  constructor(message: string, position?: number) {
    super(message);
    this.name = 'Base64Error';
    this.position = position;
  }
}

// ─── Encoding ─────────────────────────────────────────────────────────────

/** Encode raw bytes. Every other encode path funnels through this one. */
export function encodeBytes(bytes: Uint8Array, opts: EncodeOptions = {}): string {
  const { urlSafe = false, padding = true, wrap = 0, newline = '\n' } = opts;
  const alphabet = urlSafe ? URLSAFE_ALPHABET : STANDARD_ALPHABET;

  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];

    if (b1 === undefined) {
      if (padding) out += '==';
      break;
    }
    out += alphabet[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];

    if (b2 === undefined) {
      if (padding) out += '=';
      break;
    }
    out += alphabet[b2 & 0b111111];
  }

  return wrap > 0 ? wrapLines(out, wrap, newline) : out;
}

/** Encode a string as UTF-8, then as Base64. Safe for any Unicode input. */
export function encodeBase64(text: string, opts: EncodeOptions = {}): string {
  return encodeBytes(new TextEncoder().encode(text), opts);
}

/** Break a string into fixed-width lines (RFC 2045 uses 76 characters). */
export function wrapLines(text: string, width = MIME_LINE_LENGTH, newline = '\n'): string {
  if (width <= 0) return text;
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join(newline);
}

// ─── Decoding ─────────────────────────────────────────────────────────────

/**
 * Strip everything a real-world Base64 blob picks up in transit: line breaks
 * from an email header, spaces from a wrapped log line, and the `data:` URI
 * preamble when someone pastes a whole `src` attribute.
 */
export function normalizeBase64(input: string): string {
  let text = input.trim();
  const dataUri = parseDataUri(text);
  if (dataUri?.base64) text = dataUri.data;
  return text.replace(/[\s\r\n]+/g, '');
}

export interface Base64Validation {
  valid: boolean;
  /** A user-facing explanation of the first problem found. */
  reason?: string;
  position?: number;
  /** True when the input uses `-`/`_` rather than `+`/`/`. */
  urlSafe: boolean;
  /** Number of `=` characters at the end (0, 1 or 2). */
  padding: number;
  /** Length after whitespace and any data-URI prefix is removed. */
  length: number;
}

/**
 * Explain *why* a string is not valid Base64, rather than just refusing it.
 *
 * The checks run in the order a person would look for problems: characters
 * first (a stray `.` or a pasted ellipsis), then padding placement, then
 * length — because a length complaint is useless if the real issue is that
 * a newline got turned into a `?`.
 */
export function validateBase64(input: string): Base64Validation {
  const text = normalizeBase64(input);
  const padMatch = text.match(/=*$/);
  const padding = padMatch ? padMatch[0].length : 0;
  const body = text.slice(0, text.length - padding);

  const result: Base64Validation = {
    valid: false,
    urlSafe: /[-_]/.test(body),
    padding,
    length: text.length,
  };

  if (text.length === 0) {
    result.reason = 'There is nothing to decode yet — paste some Base64 first.';
    return result;
  }

  if (/[-_]/.test(body) && /[+/]/.test(body)) {
    result.reason =
      'This mixes both Base64 alphabets: it contains `-` or `_` (URL-safe, RFC 4648 §5) as well as `+` or `/` (standard). One string cannot use both.';
    return result;
  }

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (!(ch in DECODE_TABLE)) {
      result.position = i;
      result.reason =
        ch === '='
          ? `There is a "=" at position ${i}, in the middle of the data. Padding is only allowed at the very end. This usually means two Base64 strings were concatenated.`
          : `"${describeChar(ch)}" at position ${i} is not a Base64 character. Valid characters are A–Z, a–z, 0–9 and either + / (standard) or - _ (URL-safe).`;
      return result;
    }
  }

  if (padding > 2) {
    result.reason = `There are ${padding} "=" characters at the end. Base64 padding is never more than two.`;
    return result;
  }

  const remainder = body.length % 4;
  if (remainder === 1) {
    result.reason =
      'This is not valid Base64 — the data length leaves a remainder of 1 when divided by 4, which no sequence of bytes can produce. A character was probably lost when the string was copied.';
    return result;
  }

  if (padding > 0 && (body.length + padding) % 4 !== 0) {
    result.reason = `The padding does not line up: ${body.length} data characters plus ${padding} "=" is ${body.length + padding}, which is not a multiple of 4.`;
    return result;
  }

  if (padding > 0 && ((remainder === 2 && padding !== 2) || (remainder === 3 && padding !== 1))) {
    result.reason = `This needs ${remainder === 2 ? 'two' : 'one'} "=" of padding, not ${padding}.`;
    return result;
  }

  result.valid = true;
  return result;
}

function describeChar(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (cp < 0x20 || cp === 0x7f) return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  return ch;
}

/** Decode to raw bytes. Throws a `Base64Error` written for a user. */
export function decodeToBytes(input: string): Uint8Array {
  const check = validateBase64(input);
  if (!check.valid) throw new Base64Error(check.reason ?? 'This is not valid Base64.', check.position);

  const text = normalizeBase64(input).replace(/=+$/, '');
  const byteLength = Math.floor((text.length * 6) / 8);
  const out = new Uint8Array(byteLength);

  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < text.length; i++) {
    buffer = (buffer << 6) | DECODE_TABLE[text[i]!]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

/** True when the bytes decode as well-formed UTF-8 (no replacement characters). */
export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode to text. Throws when the bytes are not valid UTF-8, because showing
 * a screen of `����` is worse than saying "this is binary, download it".
 */
export function decodeBase64(input: string): string {
  const bytes = decodeToBytes(input);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Base64Error(
      `This decodes to ${bytes.length.toLocaleString()} bytes that are not valid UTF-8 text — it is binary data such as an image, an archive or an encrypted blob. Download it as a file instead.`,
    );
  }
}

/** Decode, replacing anything malformed with U+FFFD rather than throwing. */
export function decodeBase64Lossy(input: string): string {
  return new TextDecoder('utf-8').decode(decodeToBytes(input));
}

/** Decode treating each byte as one Latin-1 (ISO-8859-1) character. */
export function decodeBase64Latin1(input: string): string {
  const bytes = decodeToBytes(input);
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

// ─── Data URIs ────────────────────────────────────────────────────────────

export interface DataUri {
  mime: string;
  /** Extra parameters such as `charset=utf-8`. */
  params: string;
  base64: boolean;
  /** The payload after the comma. */
  data: string;
}

/** Build `data:<mime>;base64,<payload>` from already-encoded Base64. */
export function toDataUri(mime: string, base64: string): string {
  const type = mime.trim() || 'application/octet-stream';
  return `data:${type};base64,${base64.replace(/\s+/g, '')}`;
}

/** Parse a data URI. Returns null when the string is not one. */
export function parseDataUri(input: string): DataUri | null {
  const match = input.trim().match(/^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/i);
  if (!match) return null;
  const params = match[2] ?? '';
  return {
    mime: match[1] || 'text/plain',
    params: params.replace(/;base64$/i, ''),
    base64: /;base64$/i.test(params),
    data: match[3] ?? '',
  };
}

/**
 * Sniff a MIME type from leading bytes (magic numbers), so a decoded blob can
 * be offered with a sensible filename instead of `download.bin`.
 */
export function sniffMimeType(bytes: Uint8Array): { mime: string; extension: string } {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const ascii = (offset: number, text: string) =>
    [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', extension: 'png' };
  if (starts(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', extension: 'jpg' };
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return { mime: 'image/gif', extension: 'gif' };
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { mime: 'image/webp', extension: 'webp' };
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return { mime: 'audio/wav', extension: 'wav' };
  if (starts(0x42, 0x4d)) return { mime: 'image/bmp', extension: 'bmp' };
  if (starts(0x00, 0x00, 0x01, 0x00)) return { mime: 'image/x-icon', extension: 'ico' };
  if (ascii(0, '%PDF-')) return { mime: 'application/pdf', extension: 'pdf' };
  if (starts(0x1f, 0x8b)) return { mime: 'application/gzip', extension: 'gz' };
  if (starts(0x50, 0x4b, 0x03, 0x04)) return { mime: 'application/zip', extension: 'zip' };
  if (ascii(0, 'OggS')) return { mime: 'audio/ogg', extension: 'ogg' };
  if (starts(0x49, 0x44, 0x33) || starts(0xff, 0xfb)) return { mime: 'audio/mpeg', extension: 'mp3' };
  if (ascii(4, 'ftyp')) return { mime: 'video/mp4', extension: 'mp4' };
  if (ascii(0, 'wOFF')) return { mime: 'font/woff', extension: 'woff' };
  if (ascii(0, 'wOF2')) return { mime: 'font/woff2', extension: 'woff2' };
  if (starts(0x00, 0x01, 0x00, 0x00, 0x00)) return { mime: 'font/ttf', extension: 'ttf' };
  if (isValidUtf8(bytes)) {
    const head = new TextDecoder().decode(bytes.slice(0, 200)).trimStart();
    if (/^<svg[\s>]/i.test(head)) return { mime: 'image/svg+xml', extension: 'svg' };
    if (/^<\?xml/i.test(head)) return { mime: 'application/xml', extension: 'xml' };
    if (/^[[{]/.test(head)) return { mime: 'application/json', extension: 'json' };
    return { mime: 'text/plain', extension: 'txt' };
  }
  return { mime: 'application/octet-stream', extension: 'bin' };
}

/** Base64 grows by exactly 4 characters for every 3 bytes, before wrapping. */
export function encodedLength(byteCount: number, padding = true): number {
  return padding
    ? Math.ceil(byteCount / 3) * 4
    : Math.ceil((byteCount * 4) / 3);
}

/** How many bytes a valid Base64 string of this length represents. */
export function decodedLength(base64: string): number {
  const text = normalizeBase64(base64);
  const padding = (text.match(/=*$/)?.[0].length ?? 0);
  return Math.floor(((text.length - padding) * 6) / 8);
}

export const SAMPLE_TEXT = 'ByteCabin — encode this, including an emoji 🛠 and an accent: café.';

export const SAMPLE_BASE64 =
  'Qnl0ZUNhYmluIOKAlCBkZWNvZGVkIGZyb20gQmFzZTY0LCBlbW9qaSBpbnRhY3Q6IPCfm6Au';
