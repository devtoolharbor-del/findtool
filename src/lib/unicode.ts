/**
 * Unicode inspection and conversion.
 *
 * The recurring problem this backs is that "character" means four different
 * things at once, and a bug usually lives in the gap between them:
 *
 *   The family emoji is 1 grapheme, 5 code points, 8 UTF-16 code units and
 *   18 UTF-8 bytes. The letter e-acute may be one code point (U+00E9) or two
 *   (U+0065 U+0301) and look pixel-identical either way.
 *
 * Everything here is pure and DOM-free so it can be unit-tested in Node.
 * Code point constants are written as numbers rather than string literals so
 * the source stays greppable — a file full of invisible characters is exactly
 * the problem this module exists to solve.
 */

export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

export interface CodePointInfo {
  /** The character itself — a full code point, never half a surrogate pair. */
  char: string;
  codePoint: number;
  /** `U+1F6E0` style notation, at least four digits. */
  notation: string;
  /** Best-effort name or description; the full UCD is not bundled. */
  name: string;
  block: string;
  /** UTF-8 bytes for this code point. */
  utf8: number[];
  /** UTF-16 code units — two for anything above U+FFFF. */
  utf16: number[];
  /** Backslash-u escapes, surrogate pairs included: JSON, Java, C#. */
  escapeJs: string;
  /** The ES2015 brace form, also used by Rust. */
  escapeEs6: string;
  /** The eight-digit capital-U form used by Python and C. */
  escapePython: string;
  /** `&#128736;` */
  htmlDecimal: string;
  /** `&#x1F6E0;` */
  htmlHex: string;
  /** CSS escapes are hex with a trailing space terminator. */
  escapeCss: string;
  /** `%F0%9F%9B%A0` */
  percentEncoded: string;
  /** True for a combining mark, which has no width of its own. */
  combining: boolean;
  /** True above U+FFFF, i.e. needs a surrogate pair in UTF-16. */
  astral: boolean;
  /** True for controls, zero-width characters and other invisibles. */
  invisible: boolean;
}

// ─── Named code points ────────────────────────────────────────────────────

export const CP = {
  TAB: 0x09,
  LF: 0x0a,
  CR: 0x0d,
  ZWJ: 0x200d,
  VARIATION_START: 0xfe00,
  VARIATION_END: 0xfe0f,
  SKIN_TONE_START: 0x1f3fb,
  SKIN_TONE_END: 0x1f3ff,
  REGIONAL_START: 0x1f1e6,
  REGIONAL_END: 0x1f1ff,
  BOM: 0xfeff,
  REPLACEMENT: 0xfffd,
  MAX: 0x10ffff,
} as const;

const REPLACEMENT_CHAR = String.fromCodePoint(CP.REPLACEMENT);

// ─── Block and name lookup ────────────────────────────────────────────────

/**
 * A pragmatic subset of the Unicode block ranges. The complete list has 327
 * entries; these cover everything a developer is likely to paste in.
 */
const BLOCKS: Array<[number, number, string]> = [
  [0x0000, 0x001f, 'C0 Control'],
  [0x0020, 0x007f, 'Basic Latin'],
  [0x0080, 0x009f, 'C1 Control'],
  [0x00a0, 0x00ff, 'Latin-1 Supplement'],
  [0x0100, 0x017f, 'Latin Extended-A'],
  [0x0180, 0x024f, 'Latin Extended-B'],
  [0x0250, 0x02af, 'IPA Extensions'],
  [0x02b0, 0x02ff, 'Spacing Modifier Letters'],
  [0x0300, 0x036f, 'Combining Diacritical Marks'],
  [0x0370, 0x03ff, 'Greek and Coptic'],
  [0x0400, 0x04ff, 'Cyrillic'],
  [0x0590, 0x05ff, 'Hebrew'],
  [0x0600, 0x06ff, 'Arabic'],
  [0x0900, 0x097f, 'Devanagari'],
  [0x0e00, 0x0e7f, 'Thai'],
  [0x1000, 0x109f, 'Myanmar'],
  [0x1e00, 0x1eff, 'Latin Extended Additional'],
  [0x2000, 0x206f, 'General Punctuation'],
  [0x2070, 0x209f, 'Superscripts and Subscripts'],
  [0x20a0, 0x20cf, 'Currency Symbols'],
  [0x2100, 0x214f, 'Letterlike Symbols'],
  [0x2150, 0x218f, 'Number Forms'],
  [0x2190, 0x21ff, 'Arrows'],
  [0x2200, 0x22ff, 'Mathematical Operators'],
  [0x2300, 0x23ff, 'Miscellaneous Technical'],
  [0x2400, 0x243f, 'Control Pictures'],
  [0x2500, 0x257f, 'Box Drawing'],
  [0x2580, 0x259f, 'Block Elements'],
  [0x25a0, 0x25ff, 'Geometric Shapes'],
  [0x2600, 0x26ff, 'Miscellaneous Symbols'],
  [0x2700, 0x27bf, 'Dingbats'],
  [0x2e80, 0x2eff, 'CJK Radicals Supplement'],
  [0x3000, 0x303f, 'CJK Symbols and Punctuation'],
  [0x3040, 0x309f, 'Hiragana'],
  [0x30a0, 0x30ff, 'Katakana'],
  [0x4e00, 0x9fff, 'CJK Unified Ideographs'],
  [0xac00, 0xd7af, 'Hangul Syllables'],
  [0xd800, 0xdfff, 'Surrogates'],
  [0xe000, 0xf8ff, 'Private Use Area'],
  [0xfb00, 0xfb4f, 'Alphabetic Presentation Forms'],
  [0xfe00, 0xfe0f, 'Variation Selectors'],
  [0xfe70, 0xfeff, 'Arabic Presentation Forms-B'],
  [0xff00, 0xffef, 'Halfwidth and Fullwidth Forms'],
  [0xfff0, 0xffff, 'Specials'],
  [0x1d400, 0x1d7ff, 'Mathematical Alphanumeric Symbols'],
  [0x1f000, 0x1f02f, 'Mahjong Tiles'],
  [0x1f100, 0x1f1ff, 'Enclosed Alphanumeric Supplement'],
  [0x1f300, 0x1f5ff, 'Miscellaneous Symbols and Pictographs'],
  [0x1f600, 0x1f64f, 'Emoticons'],
  [0x1f680, 0x1f6ff, 'Transport and Map Symbols'],
  [0x1f900, 0x1f9ff, 'Supplemental Symbols and Pictographs'],
  [0x1fa70, 0x1faff, 'Symbols and Pictographs Extended-A'],
  [0x20000, 0x2a6df, 'CJK Unified Ideographs Extension B'],
  [0xe0000, 0xe007f, 'Tags'],
  [0xf0000, 0xffffd, 'Supplementary Private Use Area-A'],
];

export function blockOf(codePoint: number): string {
  for (const [start, end, name] of BLOCKS) {
    if (codePoint >= start && codePoint <= end) return name;
  }
  return 'Unassigned or uncommon block';
}

/** C0 control names — the ones that actually show up in bug reports. */
const CONTROL_NAMES: Record<number, string> = {
  0x00: 'NULL',
  0x07: 'BELL',
  0x08: 'BACKSPACE',
  0x09: 'CHARACTER TABULATION (tab)',
  0x0a: 'LINE FEED (newline)',
  0x0b: 'LINE TABULATION',
  0x0c: 'FORM FEED',
  0x0d: 'CARRIAGE RETURN',
  0x1b: 'ESCAPE',
  0x7f: 'DELETE',
};

/** Characters worth calling out because they are invisible or confusable. */
const NOTABLE_NAMES: Record<number, string> = {
  0x0020: 'SPACE',
  0x00a0: 'NO-BREAK SPACE',
  0x00ad: 'SOFT HYPHEN',
  0x034f: 'COMBINING GRAPHEME JOINER',
  0x061c: 'ARABIC LETTER MARK',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR',
  0x202a: 'LEFT-TO-RIGHT EMBEDDING',
  0x202e: 'RIGHT-TO-LEFT OVERRIDE',
  0x2060: 'WORD JOINER',
  0x20ac: 'EURO SIGN',
  0x3000: 'IDEOGRAPHIC SPACE',
  0xfe0e: 'VARIATION SELECTOR-15 (text presentation)',
  0xfe0f: 'VARIATION SELECTOR-16 (emoji presentation)',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE (byte order mark)',
  0xfffd: 'REPLACEMENT CHARACTER',
};

const DIGIT_NAMES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

export function nameOf(codePoint: number): string {
  const notable = NOTABLE_NAMES[codePoint];
  if (notable) return notable;
  const control = CONTROL_NAMES[codePoint];
  if (control) return control;

  if (codePoint < 0x20 || (codePoint >= 0x80 && codePoint <= 0x9f)) {
    return `CONTROL U+${hex(codePoint)}`;
  }
  if (codePoint >= 0x41 && codePoint <= 0x5a) {
    return `LATIN CAPITAL LETTER ${String.fromCodePoint(codePoint)}`;
  }
  if (codePoint >= 0x61 && codePoint <= 0x7a) {
    return `LATIN SMALL LETTER ${String.fromCodePoint(codePoint).toUpperCase()}`;
  }
  if (codePoint >= 0x30 && codePoint <= 0x39) {
    return `DIGIT ${DIGIT_NAMES[codePoint - 0x30]}`;
  }
  if (codePoint >= CP.REGIONAL_START && codePoint <= CP.REGIONAL_END) {
    const letter = String.fromCodePoint(codePoint - CP.REGIONAL_START + 0x41);
    return `REGIONAL INDICATOR SYMBOL LETTER ${letter}`;
  }
  if (codePoint >= CP.SKIN_TONE_START && codePoint <= CP.SKIN_TONE_END) {
    return `EMOJI MODIFIER FITZPATRICK TYPE-${codePoint - CP.SKIN_TONE_START + 1}`;
  }
  if (codePoint >= 0x0300 && codePoint <= 0x036f) {
    return `COMBINING DIACRITICAL MARK U+${hex(codePoint)}`;
  }
  if (codePoint >= CP.VARIATION_START && codePoint <= CP.VARIATION_END) {
    return `VARIATION SELECTOR-${codePoint - CP.VARIATION_START + 1}`;
  }
  return `${blockOf(codePoint)} U+${hex(codePoint)}`;
}

function hex(cp: number): string {
  return cp.toString(16).toUpperCase().padStart(4, '0');
}

// ─── Invisible characters ─────────────────────────────────────────────────

/**
 * Ranges that render as nothing, or as something other than they appear in an
 * editor. These are behind "the two strings look identical but do not compare
 * equal": a copied no-break space, a zero-width joiner that survived a paste
 * from a design tool, a byte order mark at the head of a CSV.
 */
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x0000, 0x0008],
  [0x000b, 0x001f],
  [0x007f, 0x009f],
  [0x00a0, 0x00a0],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180e],
  [0x2000, 0x200f],
  [0x2028, 0x202f],
  [0x205f, 0x206f],
  [0x3000, 0x3000],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff9, 0xfffb],
  [0xe0000, 0xe007f],
];

/** True for a character with no visible width, or a misleading one. */
export function isInvisible(char: string): boolean {
  const cp = char.codePointAt(0);
  if (cp === undefined) return false;
  if (cp === CP.TAB || cp === CP.LF || cp === CP.CR) return false;
  return INVISIBLE_RANGES.some(([start, end]) => cp >= start && cp <= end);
}

const COMBINING = /\p{M}/u;

/** True for a combining mark — a character that attaches to the one before. */
export function isCombining(char: string): boolean {
  return COMBINING.test(char);
}

// ─── Byte views ───────────────────────────────────────────────────────────

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** UTF-16 code units — what `String.length` counts and `charCodeAt` returns. */
export function utf16Units(text: string): number[] {
  const units: number[] = [];
  for (let i = 0; i < text.length; i++) units.push(text.charCodeAt(i));
  return units;
}

const BACKSLASH = String.fromCharCode(0x5c);

function hexPad(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

export function describeCodePoint(char: string): CodePointInfo {
  const cp = char.codePointAt(0)!;
  const bytes = [...utf8Bytes(char)];
  const units = utf16Units(char);

  return {
    char,
    codePoint: cp,
    notation: `U+${hex(cp)}`,
    name: nameOf(cp),
    block: blockOf(cp),
    utf8: bytes,
    utf16: units,
    escapeJs: units.map((u) => `${BACKSLASH}u${hexPad(u, 4)}`).join(''),
    escapeEs6: `${BACKSLASH}u{${cp.toString(16).toUpperCase()}}`,
    escapePython: `${BACKSLASH}U${hexPad(cp, 8)}`,
    htmlDecimal: `&#${cp};`,
    htmlHex: `&#x${cp.toString(16).toUpperCase()};`,
    escapeCss: `${BACKSLASH}${hexPad(cp, 6)} `,
    percentEncoded: bytes.map((b) => `%${hexPad(b, 2)}`).join(''),
    combining: COMBINING.test(char),
    astral: cp > 0xffff,
    invisible: isInvisible(char),
  };
}

/** One entry per code point. Surrogate pairs are kept together. */
export function codePoints(text: string): CodePointInfo[] {
  return [...text].map(describeCodePoint);
}

// ─── Graphemes ────────────────────────────────────────────────────────────

/** True when `Intl.Segmenter` is available; the UI says so rather than guessing. */
export function hasSegmenter(): boolean {
  return typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function';
}

/**
 * Split into user-perceived characters.
 *
 * `Intl.Segmenter` implements UAX #29 and is the correct answer; it shipped in
 * Node 16, Chrome 87 and Safari 14.1, and finally in Firefox 125 (April 2024).
 *
 * The fallback matters only for older Firefox and for runtimes built without
 * full ICU. It approximates a cluster as a base character plus any run of
 * combining marks, variation selectors and emoji modifiers, glues ZWJ
 * sequences together, and pairs regional indicators. That covers flags, skin
 * tones, family emoji and stacked diacritics. It does *not* implement the
 * Indic conjunct rules, so Devanagari clusters such as क्षि will over-split —
 * which is exactly why the UI reports which method produced the count.
 */
export function splitGraphemes(text: string): string[] {
  if (hasSegmenter()) {
    const Segmenter = (Intl as unknown as { Segmenter: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
    const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map((s) => s.segment);
  }
  return fallbackGraphemes(text);
}

export function fallbackGraphemes(text: string): string[] {
  const chars = [...text];
  const out: string[] = [];
  let i = 0;

  const cpOf = (c: string) => c.codePointAt(0) ?? 0;

  const isExtend = (c: string) => {
    const cp = cpOf(c);
    if (COMBINING.test(c)) return true;
    if (cp >= CP.VARIATION_START && cp <= CP.VARIATION_END) return true;
    if (cp >= CP.SKIN_TONE_START && cp <= CP.SKIN_TONE_END) return true;
    return cp === CP.ZWJ;
  };

  const isRegional = (c: string) => {
    const cp = cpOf(c);
    return cp >= CP.REGIONAL_START && cp <= CP.REGIONAL_END;
  };

  while (i < chars.length) {
    let cluster = chars[i]!;
    i++;

    // Two regional indicators make one flag.
    if (isRegional(cluster) && i < chars.length && isRegional(chars[i]!)) {
      cluster += chars[i]!;
      i++;
    }

    // CR LF is a single grapheme cluster, per UAX #29 rule GB3.
    if (cpOf(cluster) === CP.CR && i < chars.length && cpOf(chars[i]!) === CP.LF) {
      cluster += chars[i]!;
      i++;
    }

    while (i < chars.length && isExtend(chars[i]!)) {
      const joiner = cpOf(chars[i]!) === CP.ZWJ;
      cluster += chars[i]!;
      i++;
      // A zero-width joiner always glues the next character on.
      if (joiner && i < chars.length) {
        cluster += chars[i]!;
        i++;
      }
    }

    out.push(cluster);
  }

  return out;
}

// ─── Escapes ──────────────────────────────────────────────────────────────

export type EscapeStyle =
  | 'js' // backslash-u, surrogate pairs: JSON, Java, C#
  | 'es6' // the brace form, also Rust
  | 'python' // eight-digit capital U
  | 'css' // hex plus a terminating space
  | 'html-dec'
  | 'html-hex'
  | 'percent'
  | 'codepoint'; // U+XXXX, space separated

export interface EscapeOptions {
  /** Leave printable ASCII alone and escape only what needs it. Default true. */
  asciiOnly?: boolean;
}

export function toEscapes(text: string, style: EscapeStyle, opts: EscapeOptions = {}): string {
  const { asciiOnly = true } = opts;
  const parts: string[] = [];

  for (const char of text) {
    const cp = char.codePointAt(0)!;
    const printableAscii = cp >= 0x20 && cp <= 0x7e;
    if (asciiOnly && printableAscii && style !== 'codepoint') {
      parts.push(char);
      continue;
    }
    const info = describeCodePoint(char);
    switch (style) {
      case 'js':
        parts.push(info.escapeJs);
        break;
      case 'es6':
        parts.push(info.escapeEs6);
        break;
      case 'python':
        parts.push(info.escapePython);
        break;
      case 'css':
        parts.push(info.escapeCss);
        break;
      case 'html-dec':
        parts.push(info.htmlDecimal);
        break;
      case 'html-hex':
        parts.push(info.htmlHex);
        break;
      case 'percent':
        parts.push(info.percentEncoded);
        break;
      case 'codepoint':
        parts.push(info.notation);
        break;
    }
  }

  return style === 'codepoint' ? parts.join(' ') : parts.join('');
}

/**
 * Matches the code-point escape forms: the brace form, the four-digit and
 * eight-digit forms, HTML decimal and hexadecimal references, and `U+XXXX`
 * notation. Byte-oriented forms are handled separately — see below.
 */
const ESCAPE_PATTERN = new RegExp(
  [
    BACKSLASH + BACKSLASH + 'u\\{([0-9a-fA-F]{1,6})\\}',
    BACKSLASH + BACKSLASH + 'u([0-9a-fA-F]{4})',
    BACKSLASH + BACKSLASH + 'U([0-9a-fA-F]{8})',
    '&#[xX]([0-9a-fA-F]+);',
    '&#([0-9]+);',
    '\\bU\\+([0-9a-fA-F]{4,6})\\b',
  ].join('|'),
  'g',
);

/** Runs of percent-escapes or backslash-x escapes, which encode *bytes*. */
const BYTE_ESCAPE_RUN = new RegExp(
  `(?:%[0-9a-fA-F]{2})+|(?:${BACKSLASH}${BACKSLASH}x[0-9a-fA-F]{2})+`,
  'g',
);

/**
 * Decode a run of byte escapes as UTF-8, falling back to one character per
 * byte when the run is not valid UTF-8.
 *
 * This is the step that separates a working converter from a broken one:
 * `%C3%A9` is two bytes that together mean one character. Decoding each escape
 * to its own code point produces "Ã©" — the single most recognisable symptom
 * of mojibake, and exactly what someone lands on this tool to fix.
 */
function decodeByteRun(run: string): string {
  const pairs = run.match(/[0-9a-fA-F]{2}/g) ?? [];
  const bytes = new Uint8Array(pairs.map((p) => parseInt(p, 16)));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    let out = '';
    for (const byte of bytes) out += String.fromCharCode(byte);
    return out;
  }
}

/**
 * Turn escape sequences back into characters. Deliberately tolerant: one
 * pasted blob often mixes an escape from a log file, a numeric reference from
 * an HTML attribute and `U+00E9` copied out of a spec.
 *
 * Surrogate halves are converted individually and land next to each other in
 * the result, so a pair written as two four-digit escapes recombines into the
 * single astral character it was meant to be.
 */
export function fromEscapes(text: string): string {
  const withBytes = text.replace(BYTE_ESCAPE_RUN, decodeByteRun);

  return withBytes.replace(
    ESCAPE_PATTERN,
    (match, braceHex, jsHex, pyHex, htmlHex, htmlDec, uPlus) => {
      const hexDigits = braceHex ?? jsHex ?? pyHex ?? htmlHex ?? uPlus;
      const value =
        hexDigits !== undefined
          ? parseInt(hexDigits, 16)
          : htmlDec !== undefined
            ? parseInt(htmlDec, 10)
            : NaN;

      if (!Number.isFinite(value) || value < 0 || value > CP.MAX) return match;
      try {
        return String.fromCodePoint(value);
      } catch {
        return match;
      }
    },
  );
}

/** Replace lone surrogates with U+FFFD so the string is safe to encode. */
export function wellFormed(text: string): string {
  const native = (text as unknown as { toWellFormed?: () => string }).toWellFormed;
  if (typeof native === 'function') return native.call(text);

  let out = '';
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const isHigh = unit >= 0xd800 && unit <= 0xdbff;
    const isLow = unit >= 0xdc00 && unit <= 0xdfff;
    if (isHigh) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i]! + text[i + 1]!;
        i++;
        continue;
      }
      out += REPLACEMENT_CHAR;
      continue;
    }
    out += isLow ? REPLACEMENT_CHAR : text[i]!;
  }
  return out;
}

// ─── Normalisation ────────────────────────────────────────────────────────

export function normalize(text: string, form: NormalizationForm): string {
  return text.normalize(form);
}

export interface NormalizationReport {
  form: NormalizationForm;
  output: string;
  changed: boolean;
  codePointsBefore: number;
  codePointsAfter: number;
  bytesBefore: number;
  bytesAfter: number;
}

export function normalizationReport(text: string, form: NormalizationForm): NormalizationReport {
  const output = text.normalize(form);
  return {
    form,
    output,
    changed: output !== text,
    codePointsBefore: [...text].length,
    codePointsAfter: [...output].length,
    bytesBefore: utf8Bytes(text).length,
    bytesAfter: utf8Bytes(output).length,
  };
}

/** One-line description of what each form does, for the UI. */
export const NORMALIZATION_NOTES: Record<NormalizationForm, string> = {
  NFC: 'Canonical composition — combines base letters with their marks where a single code point exists. What you almost always want before storing or comparing text.',
  NFD: 'Canonical decomposition — splits accented letters into a base plus combining marks. What macOS filesystems historically produced.',
  NFKC: 'Compatibility composition — also folds ligatures, full-width forms and superscripts to plain equivalents. Lossy: it turns ﬁ into fi and ² into 2.',
  NFKD: 'Compatibility decomposition — the same folding as NFKC, then decomposed. Useful for building search keys, never for round-tripping.',
};

// ─── Stats ────────────────────────────────────────────────────────────────

export interface TextStats {
  /** `String.length`: UTF-16 code units, the number most APIs limit on. */
  codeUnits: number;
  codePointCount: number;
  graphemes: number;
  utf8Bytes: number;
  utf16Bytes: number;
  lines: number;
  hasAstral: boolean;
  hasCombining: boolean;
  hasInvisible: boolean;
  /** True when NFC would change the text — i.e. it is not already composed. */
  needsNfc: boolean;
}

export function textStats(text: string): TextStats {
  const points = [...text];
  return {
    codeUnits: text.length,
    codePointCount: points.length,
    graphemes: splitGraphemes(text).length,
    utf8Bytes: utf8Bytes(text).length,
    utf16Bytes: text.length * 2,
    lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
    hasAstral: points.some((c) => c.codePointAt(0)! > 0xffff),
    hasCombining: points.some((c) => COMBINING.test(c)),
    hasInvisible: points.some(isInvisible),
    needsNfc: text.normalize('NFC') !== text,
  };
}

/**
 * Sample text chosen to exercise every hard case at once: a precomposed
 * accent, an emoji with a variation selector, a ZWJ sequence, a flag built
 * from regional indicators, and a decomposed e-acute that looks identical to
 * the composed one earlier in the string.
 */
export const SAMPLE_UNICODE = [
  'caf',
  String.fromCodePoint(0x00e9), // é, precomposed
  ' ',
  String.fromCodePoint(0x1f6e0, 0xfe0f), // hammer and wrench + VS16
  ' family ',
  String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467), // ZWJ family
  ' flag ',
  String.fromCodePoint(0x1f1ef, 0x1f1f5), // JP
  ' decomposed ',
  String.fromCodePoint(0x0065, 0x0301), // e + combining acute
].join('');
