/**
 * HTML entity encoding and decoding, shared by the encoder and the decoder.
 *
 * No dependency: the named-entity table below is written out by hand. The full
 * WHATWG list has 2,231 entries, most of them mathematical, and shipping it
 * would cost more than it is worth on a page this size. What is here is the
 * Latin-1 supplement, the punctuation and symbols that appear in real content,
 * the Greek alphabet and the common arrows and operators — the set that covers
 * text scraped from a CMS, an RSS feed or a legacy database.
 *
 * DOM-free by design: decoding via a throwaway `<div>` and `innerHTML` is the
 * usual shortcut and it is unsafe, because it will happily run an `onerror`
 * handler out of `&lt;img src=x onerror=...&gt;` once decoded and re-inserted.
 */

/** Named references → the text they represent. */
export const NAMED_ENTITIES: Record<string, string> = {
  // Markup-significant
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",

  // Latin-1 punctuation and symbols (U+00A0–U+00BF)
  nbsp: ' ', iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥',
  brvbar: '¦', sect: '§', uml: '¨', copy: '©', ordf: 'ª', laquo: '«',
  not: '¬', shy: '­', reg: '®', macr: '¯', deg: '°', plusmn: '±',
  sup2: '²', sup3: '³', acute: '´', micro: 'µ', para: '¶', middot: '·',
  cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»', frac14: '¼', frac12: '½',
  frac34: '¾', iquest: '¿',

  // Latin-1 letters (U+00C0–U+00FF)
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ',
  Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×',
  Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  THORN: 'Þ', szlig: 'ß', agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã',
  auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è', eacute: 'é',
  ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ',
  ouml: 'ö', divide: '÷', oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û',
  uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',

  // Latin Extended-A / B and spacing modifiers
  OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ', fnof: 'ƒ',
  circ: 'ˆ', tilde: '˜',

  // Greek
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ',
  Eta: 'Η', Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ',
  Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ',
  Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigmaf: 'ς',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ',
  omega: 'ω', thetasym: 'ϑ', upsih: 'ϒ', piv: 'ϖ',

  // General punctuation
  ensp: ' ', emsp: ' ', thinsp: ' ', zwnj: '‌',
  zwj: '‍', lrm: '‎', rlm: '‏',
  ndash: '–', mdash: '—', horbar: '―', lsquo: '‘', rsquo: '’',
  sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  dagger: '†', Dagger: '‡', bull: '•', hellip: '…', permil: '‰',
  prime: '′', Prime: '″', lsaquo: '‹', rsaquo: '›', oline: '‾',
  frasl: '⁄', euro: '€', trade: '™',

  // Arrows
  larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔', crarr: '↵',
  lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔',

  // Mathematical operators
  forall: '∀', part: '∂', exist: '∃', empty: '∅', nabla: '∇', isin: '∈',
  notin: '∉', ni: '∋', prod: '∏', sum: '∑', minus: '−', lowast: '∗',
  radic: '√', prop: '∝', infin: '∞', ang: '∠', and: '∧', or: '∨',
  cap: '∩', cup: '∪', int: '∫', there4: '∴', sim: '∼', cong: '≅',
  asymp: '≈', ne: '≠', equiv: '≡', le: '≤', ge: '≥', sub: '⊂', sup: '⊃',
  nsub: '⊄', sube: '⊆', supe: '⊇', oplus: '⊕', otimes: '⊗', perp: '⊥',
  sdot: '⋅',

  // Technical and shapes
  lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', lang: '〈', rang: '〉',
  loz: '◊', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦',

  // Letterlike
  weierp: '℘', image: 'ℑ', real: 'ℜ', alefsym: 'ℵ',
};

/** Character → shortest named reference, built once from the table above. */
const CHAR_TO_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [name, char] of Object.entries(NAMED_ENTITIES)) {
    const existing = map[char];
    if (!existing || name.length < existing.length) map[char] = name;
  }
  // `apos` is XML/HTML5 only; HTML 4 documents need the numeric form. The
  // encoder prefers &#39; for the apostrophe for exactly that reason.
  return map;
})();

/**
 * Numeric references in the 0x80–0x9F range are a documented HTML parsing
 * quirk: authors meant Windows-1252, not the C1 control characters those code
 * points actually name, so the spec (WHATWG §13.2.5.80) mandates this mapping.
 * `&#147;` is a left double quote in every real browser.
 */
const WINDOWS_1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

// ─── Encoding ─────────────────────────────────────────────────────────────

export type EntityStyle = 'named' | 'decimal' | 'hex';

export interface EncodeOptions {
  /** `named` prefers `&amp;`, `decimal` gives `&#38;`, `hex` gives `&#x26;`. */
  style?: EntityStyle;
  /**
   * `minimal` escapes only what can break markup — the safe default for body
   * text. `aggressive` also escapes every non-ASCII character, which is what
   * you want when a downstream system mangles UTF-8.
   */
  scope?: 'minimal' | 'aggressive';
  /** Escape `'` as well as `"`. On by default: attribute values need it. */
  quotes?: boolean;
}

/** The five characters that can change how a document parses. */
const MARKUP_SIGNIFICANT = new Set(['&', '<', '>', '"', "'"]);

export function encodeHtmlEntities(text: string, opts: EncodeOptions = {}): string {
  const { style = 'named', scope = 'minimal', quotes = true } = opts;
  let out = '';

  for (const char of text) {
    const significant =
      MARKUP_SIGNIFICANT.has(char) && (quotes || (char !== '"' && char !== "'"));
    const nonAscii = char.codePointAt(0)! > 0x7f;

    if (!significant && !(scope === 'aggressive' && nonAscii)) {
      out += char;
      continue;
    }
    out += referenceFor(char, style);
  }

  return out;
}

function referenceFor(char: string, style: EntityStyle): string {
  const cp = char.codePointAt(0)!;

  if (style === 'named') {
    // The apostrophe is the one exception: `&apos;` is not in HTML 4, so the
    // numeric form is the safer named-mode output.
    if (char === "'") return '&#39;';
    const name = CHAR_TO_NAME[char];
    if (name) return `&${name};`;
    // No name exists (most emoji, CJK, rarer symbols) — fall back to numeric.
    return `&#${cp};`;
  }
  if (style === 'hex') return `&#x${cp.toString(16).toUpperCase()};`;
  return `&#${cp};`;
}

/** Escape only the five markup-significant characters. Never fails. */
export function escapeMarkup(text: string): string {
  return encodeHtmlEntities(text, { style: 'named', scope: 'minimal', quotes: true });
}

/**
 * Escape for use inside a `<script>` or `<style>` block, where entity
 * references are *not* decoded and `</` is the only real hazard.
 */
export function escapeForRawTextElement(text: string): string {
  return text.replace(/<\/(?=[a-z]|\/)/gi, '<\\/');
}

// ─── Decoding ─────────────────────────────────────────────────────────────

/**
 * Matches named references with or without the closing semicolon, plus decimal
 * and hexadecimal numeric references. Browsers accept `&amp` without the
 * semicolon for a fixed legacy list, and scraped content is full of them.
 */
const ENTITY_PATTERN = /&(#[xX][0-9a-fA-F]+;?|#[0-9]+;?|[a-zA-Z][a-zA-Z0-9]{1,31};?)/g;

export interface DecodeOptions {
  /** Require the closing semicolon. Off by default, matching browsers. */
  strict?: boolean;
}

export function decodeHtmlEntities(text: string, opts: DecodeOptions = {}): string {
  const { strict = false } = opts;

  return text.replace(ENTITY_PATTERN, (match, body: string) => {
    const terminated = body.endsWith(';');
    if (strict && !terminated) return match;
    const name = terminated ? body.slice(0, -1) : body;

    if (name.startsWith('#')) {
      const isHex = name[1] === 'x' || name[1] === 'X';
      const digits = isHex ? name.slice(2) : name.slice(1);
      if (!digits) return match;
      const raw = parseInt(digits, isHex ? 16 : 10);
      if (!Number.isFinite(raw)) return match;
      return fromCodePoint(raw) ?? match;
    }

    const exact = NAMED_ENTITIES[name];
    if (exact !== undefined) return exact;

    // Unterminated named references are matched greedily, so `&amptest` must
    // be retried against progressively shorter prefixes — exactly what the
    // HTML tokenizer's "flush code points consumed" step does.
    if (!terminated) {
      for (let len = name.length - 1; len >= 2; len--) {
        const prefix = name.slice(0, len);
        if (NAMED_ENTITIES[prefix] !== undefined) {
          return NAMED_ENTITIES[prefix] + name.slice(len);
        }
      }
    }

    return match;
  });
}

/** Apply the spec's numeric-reference fix-ups, then convert to a character. */
function fromCodePoint(raw: number): string | null {
  let cp = raw;
  if (cp === 0) return '�';
  if (cp in WINDOWS_1252) cp = WINDOWS_1252[cp]!;
  // Lone surrogates and anything past the Unicode range become U+FFFD, which
  // is what a browser does rather than throwing.
  if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
  return String.fromCodePoint(cp);
}

/** How many decode passes it takes before the text stops changing. */
export function entityDepth(text: string, maxPasses = 5): number {
  let current = text;
  let passes = 0;
  for (let i = 0; i < maxPasses; i++) {
    const next = decodeHtmlEntities(current);
    if (next === current) break;
    current = next;
    passes++;
  }
  return passes;
}

/** Decode repeatedly — the cure for `&amp;amp;nbsp;` from a double-escaped feed. */
export function decodeHtmlEntitiesDeep(text: string, maxPasses = 5): string {
  let current = text;
  for (let i = 0; i < maxPasses; i++) {
    const next = decodeHtmlEntities(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

export interface EntityHit {
  reference: string;
  character: string;
  codePoint: number;
  kind: 'named' | 'decimal' | 'hex';
  /** True when the reference had no closing semicolon. */
  unterminated: boolean;
}

/** List every reference found, for the decoder's breakdown table. */
export function findEntities(text: string): EntityHit[] {
  const hits: EntityHit[] = [];
  const seen = new Map<string, EntityHit>();

  for (const match of text.matchAll(ENTITY_PATTERN)) {
    const reference = match[0];
    if (seen.has(reference)) continue;
    const decoded = decodeHtmlEntities(reference);
    if (decoded === reference) continue;
    const body = match[1]!;
    const hit: EntityHit = {
      reference,
      character: decoded,
      codePoint: decoded.codePointAt(0) ?? 0,
      kind: body.startsWith('#x') || body.startsWith('#X') ? 'hex' : body.startsWith('#') ? 'decimal' : 'named',
      unterminated: !body.endsWith(';'),
    };
    seen.set(reference, hit);
    hits.push(hit);
  }

  return hits;
}

/** Characters that most often need escaping, for the encoder's legend. */
export const ENCODER_LEGEND: Array<{ char: string; named: string; numeric: string; why: string }> = [
  { char: '&', named: '&amp;', numeric: '&#38;', why: 'Starts every entity reference, so it must go first.' },
  { char: '<', named: '&lt;', numeric: '&#60;', why: 'Opens a tag. Unescaped, user text becomes markup.' },
  { char: '>', named: '&gt;', numeric: '&#62;', why: 'Closes a tag; escaped for symmetry and safety.' },
  { char: '"', named: '&quot;', numeric: '&#34;', why: 'Breaks out of a double-quoted attribute value.' },
  { char: "'", named: '&#39;', numeric: '&#39;', why: 'Breaks out of a single-quoted attribute. &apos; is HTML5-only.' },
];

export const SAMPLE_HTML = `<a href="/search?q=tea&sort=new" title="Hugo's picks">Tea & "biscuits" — 50% off</a>`;

export const SAMPLE_ENTITIES = `Caf&eacute; &amp; Co. &mdash; &ldquo;the best espresso in town,&rdquo; says Se&#241;or Garc&#237;a.&nbsp;Open 7&#x2013;11, &frac12; price before 9.`;
