/**
 * Hexadecimal conversion, shared by the Text-to-Hex and Hex-to-Text tools.
 *
 * Two things make this less trivial than it first looks:
 *
 *  1. Hex arrives in a dozen shapes. A hexdump gives `48 65 6c`, a C array
 *     gives `0x48, 0x65, 0x6c`, a Wireshark copy gives `48656c`, a Python
 *     repr gives `\x48\x65\x6c`, and a database column gives `\\x48656c`.
 *     All of them mean the same three bytes, so the parser accepts all of them.
 *  2. Hex represents *bytes*, not characters. Converting text to hex means
 *     choosing an encoding first; UTF-8 is the default here, and the one-byte
 *     Latin-1 view is offered separately because legacy protocols use it.
 *
 * Pure and DOM-free so it can be unit-tested in Node.
 */

export class HexParseError extends Error {
  readonly position?: number;
  constructor(message: string, position?: number) {
    super(message);
    this.name = 'HexParseError';
    this.position = position;
  }
}

export type Separator = 'space' | 'none' | 'comma' | 'newline' | 'dash' | 'colon';
export type Prefix = 'none' | '0x' | 'backslash-x' | 'percent' | 'hash';

export interface FormatOptions {
  separator?: Separator;
  /** Uppercase A–F. Lowercase is the default; RFC hex dumps vary. */
  uppercase?: boolean;
  prefix?: Prefix;
  /** Insert a line break every N bytes. 0 means one continuous run. */
  bytesPerLine?: number;
}

const SEPARATORS: Record<Separator, string> = {
  space: ' ',
  none: '',
  comma: ', ',
  newline: '\n',
  dash: '-',
  colon: ':',
};

const BACKSLASH = String.fromCharCode(0x5c);

const PREFIXES: Record<Prefix, string> = {
  none: '',
  '0x': '0x',
  'backslash-x': BACKSLASH + 'x',
  percent: '%',
  hash: '#',
};

// ─── Formatting ───────────────────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array, opts: FormatOptions = {}): string {
  const { separator = 'space', uppercase = false, prefix = 'none', bytesPerLine = 0 } = opts;
  const sep = SEPARATORS[separator];
  const pre = PREFIXES[prefix];

  const cells: string[] = [];
  for (const byte of bytes) {
    const pair = byte.toString(16).padStart(2, '0');
    cells.push(pre + (uppercase ? pair.toUpperCase() : pair));
  }

  if (bytesPerLine > 0) {
    const lines: string[] = [];
    for (let i = 0; i < cells.length; i += bytesPerLine) {
      lines.push(cells.slice(i, i + bytesPerLine).join(sep || ' '));
    }
    return lines.join('\n');
  }

  return cells.join(sep);
}

/** Encode text as UTF-8, then as hex. */
export function textToHex(text: string, opts: FormatOptions = {}): string {
  return bytesToHex(new TextEncoder().encode(text), opts);
}

/** Encode text as Latin-1 bytes. Throws on any character above U+00FF. */
export function textToHexLatin1(text: string, opts: FormatOptions = {}): string {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      throw new HexParseError(
        `"${text[i]}" (U+${code.toString(16).toUpperCase().padStart(4, '0')}) at position ${i} cannot be represented as a single Latin-1 byte. Latin-1 covers only U+0000 to U+00FF — switch to UTF-8.`,
        i,
      );
    }
    bytes[i] = code;
  }
  return bytesToHex(bytes, opts);
}

export function bytesToBinary(bytes: Uint8Array, separator = ' '): string {
  return [...bytes].map((b) => b.toString(2).padStart(8, '0')).join(separator);
}

export function bytesToDecimal(bytes: Uint8Array, separator = ' '): string {
  return [...bytes].map((b) => String(b)).join(separator);
}

export function bytesToOctal(bytes: Uint8Array, separator = ' '): string {
  return [...bytes].map((b) => b.toString(8).padStart(3, '0')).join(separator);
}

/**
 * A classic hexdump: offset, 16 hex bytes, then the printable ASCII column.
 * Non-printable bytes show as `.`, exactly as `hexdump -C` renders them.
 */
export function hexDump(bytes: Uint8Array, bytesPerLine = 16): string {
  const lines: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const slice = bytes.slice(offset, offset + bytesPerLine);
    const hexPart = [...slice]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(bytesPerLine * 3 - 1, ' ');
    const asciiPart = [...slice]
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hexPart}  |${asciiPart}|`);
  }

  return lines.join('\n');
}

// ─── Parsing ──────────────────────────────────────────────────────────────

/**
 * Strip every separator and prefix people actually paste, leaving bare hex
 * digits. Everything removed here is a formatting artefact, never data.
 */
function stripDecoration(input: string): string {
  return input
    .replace(/^["'`]|["'`]$/g, '') // quoted blob from a log line
    .replace(/0[xX]/g, '') // C, JavaScript, Go literals
    .replace(new RegExp(BACKSLASH + BACKSLASH + '{1,2}[xX]', 'g'), '') // \x48 and Postgres \\x
    .replace(/[uU]\+/g, '') // U+0041 code point notation
    .replace(/%/g, '') // percent-escapes
    .replace(/#/g, '') // CSS colours
    .replace(/[\s,;:|_-]+/g, '') // every common separator
    .replace(/\[|\]|\{|\}|\(|\)/g, ''); // array literal brackets
}

export interface HexParseResult {
  bytes: Uint8Array;
  /** How the input appeared to be formatted, for the UI to confirm. */
  detected: string;
}

/**
 * Parse tolerant hex input into bytes, explaining any failure precisely.
 */
export function parseHex(input: string): Uint8Array {
  return parseHexDetailed(input).bytes;
}

export function parseHexDetailed(input: string): HexParseResult {
  const raw = input.trim();
  if (!raw) throw new HexParseError('There is nothing to convert yet — paste some hex first.');

  const detected = detectFormat(raw);
  const digits = stripDecoration(raw);

  if (!digits) {
    throw new HexParseError(
      'After removing separators and prefixes there are no hex digits left. Hex uses 0–9 and A–F.',
    );
  }

  const bad = digits.match(/[^0-9a-fA-F]/);
  if (bad) {
    const index = digits.indexOf(bad[0]);
    throw new HexParseError(
      `"${bad[0]}" is not a hex digit. Hex uses 0–9 and A–F only; "g" through "z" are the usual typos, and the letter O is often a zero.`,
      index,
    );
  }

  if (digits.length % 2 !== 0) {
    throw new HexParseError(
      `This has ${digits.length} hex digits, which is an odd number. Each byte is exactly two digits, so one digit is missing — a leading zero is the usual culprit (write 0F, not F).`,
      digits.length - 1,
    );
  }

  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  }

  return { bytes, detected };
}

function detectFormat(raw: string): string {
  if (/0[xX][0-9a-fA-F]{2}\b/.test(raw)) return '0x-prefixed bytes';
  if (new RegExp(BACKSLASH + BACKSLASH + '[xX][0-9a-fA-F]{2}').test(raw)) return 'backslash-x escapes';
  if (/%[0-9a-fA-F]{2}/.test(raw)) return 'percent-escapes';
  if (/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2})+/.test(raw)) return 'colon-separated (MAC or certificate style)';
  if (/[0-9a-fA-F]{2}(,\s*[0-9a-fA-F]{2})+/.test(raw)) return 'comma-separated';
  if (/[0-9a-fA-F]{2}(\s+[0-9a-fA-F]{2})+/.test(raw)) return 'space-separated';
  if (/^#?[0-9a-fA-F]{6,8}$/.test(raw.trim())) return 'continuous (colour or short blob)';
  return 'continuous';
}

// ─── Decoding to text ─────────────────────────────────────────────────────

export type ByteEncoding = 'utf-8' | 'latin1' | 'utf-16le' | 'utf-16be';

/** True when the bytes decode as well-formed UTF-8. */
export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function bytesToText(bytes: Uint8Array, encoding: ByteEncoding = 'utf-8'): string {
  if (encoding === 'latin1') {
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return out;
  }

  if (encoding === 'utf-16be') {
    // TextDecoder supports utf-16be in browsers but not in every Node build,
    // so the swap is done by hand and then decoded as little-endian.
    const swapped = new Uint8Array(bytes.length);
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      swapped[i] = bytes[i + 1]!;
      swapped[i + 1] = bytes[i]!;
    }
    if (bytes.length % 2 === 1) swapped[bytes.length - 1] = bytes[bytes.length - 1]!;
    return new TextDecoder('utf-16le').decode(swapped);
  }

  if (encoding === 'utf-16le') return new TextDecoder('utf-16le').decode(bytes);

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new HexParseError(
      `These ${bytes.length.toLocaleString()} bytes are not valid UTF-8. They may be Latin-1 (every byte one character), UTF-16, or not text at all. Switch the encoding, or treat the result as binary.`,
    );
  }
}

/** Parse hex and decode it as text in one step. */
export function hexToText(input: string, encoding: ByteEncoding = 'utf-8'): string {
  return bytesToText(parseHex(input), encoding);
}

// ─── Analysis ─────────────────────────────────────────────────────────────

export interface ByteAnalysis {
  count: number;
  printableAscii: number;
  nullBytes: number;
  highBytes: number;
  validUtf8: boolean;
  /** A guess at what the bytes are, shown as a hint rather than a verdict. */
  looksLike: string;
}

export function analyseBytes(bytes: Uint8Array): ByteAnalysis {
  let printable = 0;
  let nulls = 0;
  let high = 0;

  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) printable++;
    if (b === 0) nulls++;
    if (b >= 0x80) high++;
  }

  const validUtf8 = isValidUtf8(bytes);
  const ratio = bytes.length === 0 ? 0 : printable / bytes.length;

  let looksLike = 'binary data';
  if (bytes.length === 0) looksLike = 'nothing';
  else if (ratio === 1) looksLike = 'plain ASCII text';
  else if (validUtf8 && ratio > 0.7) looksLike = 'UTF-8 text';
  else if (nulls > bytes.length / 4) looksLike = 'UTF-16 text or a padded binary structure';
  else if (high > bytes.length / 2) looksLike = 'compressed or encrypted data';

  return { count: bytes.length, printableAscii: printable, nullBytes: nulls, highBytes: high, validUtf8, looksLike };
}

export const SAMPLE_TEXT = 'ByteCabin: 0x48 says hi.';

/** "Hello, hex!" plus a multi-byte character, spaced the way a dump shows it. */
export const SAMPLE_HEX = '48 65 6c 6c 6f 2c 20 68 65 78 21 20 c3 a9 20 f0 9f 9b a0';
