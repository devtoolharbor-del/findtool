/**
 * A CSS minifier built on a tokenizer.
 *
 * The naive version of this tool is four regular expressions: strip
 * `/\*…\*&#47;`, collapse whitespace, remove `;}` and remove spaces around
 * punctuation. It works on the author's own stylesheet and silently destroys
 * everybody else's, because CSS is full of places where those characters are
 * data rather than syntax:
 *
 *   content: "a; b {c}"         a semicolon and braces inside a string
 *   content: "/* not a comment" a comment opener inside a string
 *   background: url(a(1).png)   brackets inside an unquoted URL
 *   --json: {"a": 1};           a custom property whose value is not CSS at all
 *   /*! (c) 2026 …             a licence banner that must survive
 *
 * So the source is scanned once into tokens that know what they are, and the
 * serializer then decides — per token pair, in context — whether whitespace
 * between them is syntax or padding. Inside a string, a URL or a custom
 * property value, nothing is touched at all.
 *
 * DOM-free and dependency-free, so `tests/css.test.ts` can exercise it in Node.
 */

export type CssTokenType =
  | 'ws'
  | 'comment'
  | 'string'
  | 'url'
  | 'ident'
  | 'number'
  | 'at'
  | 'punct';

export interface CssToken {
  type: CssTokenType;
  /** The raw source text of the token, unmodified. */
  value: string;
  start: number;
  end: number;
  line: number;
  /** Set on `/*!` comments, which carry licence text and must be kept. */
  licence?: boolean;
}

export class CssParseError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = 'CssParseError';
    this.line = line;
  }
}

const isNameStart = (ch: string | undefined) =>
  ch !== undefined && (/[a-zA-Z_]/.test(ch) || ch.charCodeAt(0) > 0x7f || ch === '\\');
const isNameChar = (ch: string | undefined) =>
  ch !== undefined && (/[a-zA-Z0-9_-]/.test(ch) || ch.charCodeAt(0) > 0x7f || ch === '\\');
const isDigit = (ch: string | undefined) => ch !== undefined && ch >= '0' && ch <= '9';

// ─── Tokenizer ────────────────────────────────────────────────────────────

/**
 * Scan CSS into tokens. Throws `CssParseError` only for damage the scanner
 * genuinely cannot get past: an unterminated comment, string or `url()`.
 * Unknown characters become single-character `punct` tokens and pass through,
 * because refusing to minify a stylesheet over one stray `§` helps nobody.
 */
export function tokenizeCss(source: string): CssToken[] {
  const tokens: CssToken[] = [];
  let i = 0;
  let line = 1;

  const push = (type: CssTokenType, start: number, end: number, extra?: Partial<CssToken>) => {
    tokens.push({ type, value: source.slice(start, end), start, end, line, ...extra });
  };

  const countLines = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (source[k] === '\n') line++;
  };

  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];

    // Whitespace
    if (/\s/.test(ch)) {
      const start = i;
      while (i < source.length && /\s/.test(source[i]!)) i++;
      push('ws', start, i);
      countLines(start, i);
      continue;
    }

    // Comment
    if (ch === '/' && next === '*') {
      const start = i;
      const end = source.indexOf('*/', i + 2);
      if (end === -1) {
        throw new CssParseError(
          'A comment opened with /* is never closed. Everything after it would be swallowed, so minifying would change what the stylesheet means',
          line,
        );
      }
      i = end + 2;
      push('comment', start, i, { licence: source.startsWith('/*!', start) });
      countLines(start, i);
      continue;
    }

    // String
    if (ch === '"' || ch === "'") {
      const start = i;
      i++;
      let closed = false;
      while (i < source.length) {
        const c = source[i]!;
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '\n') {
          throw new CssParseError(
            `A ${ch === '"' ? 'double' : 'single'}-quoted string contains a raw line break. Escape it as \\A or close the quote`,
            line,
          );
        }
        if (c === ch) {
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) {
        throw new CssParseError(`A string opened with ${ch} is never closed`, line);
      }
      push('string', start, i);
      countLines(start, i);
      continue;
    }

    // url( … ) with an unquoted value: a single token, preserved verbatim.
    // A quoted url("…") is left to the normal ident + punct + string path.
    if (/^url\(/i.test(source.slice(i, i + 4))) {
      let j = i + 4;
      while (j < source.length && /\s/.test(source[j]!)) j++;
      if (source[j] !== '"' && source[j] !== "'") {
        const start = i;
        // Balance brackets rather than stopping at the first ")". Strictly,
        // an unquoted URL may not contain one, but `url(hero(1).png)` is
        // common enough in the wild that swallowing half of it would be the
        // exact silent corruption this tokenizer exists to avoid.
        let depth = 1;
        let k = j;
        while (k < source.length && depth > 0) {
          const c = source[k]!;
          if (c === '\\') k++;
          else if (c === '(') depth++;
          else if (c === ')') depth--;
          k++;
        }
        if (depth > 0) {
          throw new CssParseError('A url( is never closed with )', line);
        }
        i = k;
        push('url', start, i);
        countLines(start, i);
        continue;
      }
    }

    // At-keyword
    if (ch === '@' && isNameStart(next)) {
      const start = i;
      i++;
      while (isNameChar(source[i])) i++;
      push('at', start, i);
      continue;
    }

    // Hash: #id, #fff. Behaves like an ident for every spacing decision.
    if (ch === '#' && isNameChar(next)) {
      const start = i;
      i++;
      while (isNameChar(source[i])) i++;
      push('ident', start, i);
      continue;
    }

    // Number, possibly signed, possibly with a unit or %
    const startsNumber =
      isDigit(ch) ||
      (ch === '.' && isDigit(next)) ||
      ((ch === '-' || ch === '+') && (isDigit(next) || (next === '.' && isDigit(source[i + 2]))));
    if (startsNumber) {
      const start = i;
      if (ch === '-' || ch === '+') i++;
      while (isDigit(source[i])) i++;
      if (source[i] === '.' && isDigit(source[i + 1])) {
        i++;
        while (isDigit(source[i])) i++;
      }
      if (
        (source[i] === 'e' || source[i] === 'E') &&
        (isDigit(source[i + 1]) ||
          ((source[i + 1] === '+' || source[i + 1] === '-') && isDigit(source[i + 2])))
      ) {
        i += 2;
        while (isDigit(source[i])) i++;
      }
      if (source[i] === '%') i++;
      else while (isNameChar(source[i])) i++;
      push('number', start, i);
      continue;
    }

    // Ident, including custom properties (--x) and vendor prefixes (-webkit-x)
    if (isNameStart(ch) || (ch === '-' && (isNameStart(next) || next === '-'))) {
      const start = i;
      i++;
      while (isNameChar(source[i])) i++;
      push('ident', start, i);
      continue;
    }

    // Anything else is a single punctuation character.
    push('punct', i, i + 1);
    i++;
  }

  return tokens;
}

// ─── Number minification ──────────────────────────────────────────────────

/**
 * `0.50px` → `.5px`, `1.0` → `1`, `0` → `0`.
 *
 * Only leading and trailing zeros go. Units are never dropped: `0px` and `0`
 * are interchangeable in most properties but not in `calc()`, where a unitless
 * zero is invalid, and not in `flex-basis`, where they differ.
 */
export function minifyNumber(raw: string): string {
  const m = /^([+-]?(?:\d*\.\d+|\d+\.?\d*))(?:([eE][+-]?\d+))?(.*)$/.exec(raw);
  if (!m) return raw;
  const [, body, exponent, unit] = m;
  if (exponent) return raw; // scientific notation is rare; leave it exactly as written

  const sign = /^[+-]/.test(body!) ? body![0]! : '';
  const digits = sign ? body!.slice(1) : body!;
  const dot = digits.indexOf('.');

  let intPart = dot === -1 ? digits : digits.slice(0, dot);
  let fracPart = dot === -1 ? '' : digits.slice(dot + 1);

  intPart = intPart.replace(/^0+/, '');
  fracPart = fracPart.replace(/0+$/, '');

  const value = fracPart ? `${intPart}.${fracPart}` : intPart;
  return `${sign}${value === '' || value === '.' ? '0' : value}${unit ?? ''}`;
}

// ─── Serializer ───────────────────────────────────────────────────────────

type Context = 'prelude' | 'property' | 'value';

const isPunct = (token: CssToken | null, ch: string) =>
  token !== null && token.type === 'punct' && token.value === ch;

/**
 * Decide whether the whitespace between two tokens carries meaning.
 *
 * Everything here is a "when in doubt, keep the space" rule. One wrongly
 * deleted space turns `@media screen and (min-width:40em)` into a function
 * token and silently disables a whole breakpoint.
 */
function needsSpace(
  prev: CssToken | null,
  next: CssToken | null,
  ctx: Context,
  parenDepth: number,
  bracketDepth: number,
): boolean {
  if (!prev || !next) return false;

  // Never meaningful next to block and list punctuation, in any context.
  for (const ch of ['{', '}', ';', ',']) {
    if (isPunct(prev, ch) || isPunct(next, ch)) return false;
  }

  if (ctx === 'value' || ctx === 'property') {
    // calc() requires whitespace around + and -; this check comes first so
    // no later rule can strip it. `calc(1px +(2px))` is invalid CSS.
    for (const ch of ['+', '-']) {
      if (isPunct(prev, ch) || isPunct(next, ch)) return true;
    }
    if (isPunct(prev, '(') || isPunct(next, ')') || isPunct(next, '(')) return false;
    if (isPunct(prev, ':') || isPunct(next, ':')) return false;
    if (isPunct(prev, '!') || isPunct(next, '!')) return false;
    for (const ch of ['*', '/', '=', '[', ']']) {
      if (isPunct(prev, ch) || isPunct(next, ch)) return false;
    }
    return true;
  }

  // Selector / at-rule prelude.
  if (isPunct(prev, '(')) return false;
  if (isPunct(next, ')')) return false;
  // `and (` must keep its space or the two fuse into a function token.
  if (isPunct(next, '(')) return true;
  if (isPunct(prev, '[') || isPunct(next, ']')) return false;

  if (bracketDepth > 0) {
    // Attribute selector: [href ^= "https"] → [href^="https"]. The trailing
    // case-sensitivity flag, [href$=".pdf" i], is two word-ish tokens and so
    // keeps its space through the final rule below.
    for (const ch of ['=', '~', '^', '$', '|', '*']) {
      if (isPunct(prev, ch) || isPunct(next, ch)) return false;
    }
  }

  if (parenDepth > 0 && (isPunct(prev, ':') || isPunct(next, ':'))) return false;

  // Outside brackets a colon is a pseudo-class, and the space before it is a
  // descendant combinator: `div :hover` and `div:hover` are different rules.
  if (isPunct(prev, ':') || isPunct(next, ':')) return true;

  for (const ch of ['>', '+', '~']) {
    if (isPunct(prev, ch) || isPunct(next, ch)) return false;
  }

  return true; // descendant combinator, or two idents that must stay apart
}

export interface MinifyOptions {
  /** Keep `/*!` banners. On by default: they are usually a licence condition. */
  preserveLicenceComments?: boolean;
}

export interface MinifyResult {
  css: string;
  originalBytes: number;
  minifiedBytes: number;
  /** Bytes removed. Never negative in practice, but not guaranteed by maths. */
  saved: number;
  /** 0–100, one decimal place of meaning. */
  savedPercent: number;
  commentsRemoved: number;
  licencesKept: number;
  /** Number of `{` seen: a rough rule count, at-rules included. */
  blocks: number;
}

const bytes = (text: string) => new TextEncoder().encode(text).length;

/**
 * Minify a stylesheet.
 *
 * Removes comments, redundant whitespace, the final semicolon in every block,
 * and leading and trailing zeros in numbers. Leaves strings, `url()` values,
 * custom property values and licence banners exactly as written.
 */
export function minifyCss(source: string, options: MinifyOptions = {}): MinifyResult {
  const { preserveLicenceComments = true } = options;
  const tokens = tokenizeCss(source);

  const out: string[] = [];
  let ctx: Context = 'prelude';
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let commentsRemoved = 0;
  let licencesKept = 0;
  let blocks = 0;
  /** The last ident emitted at the head of a declaration, to spot `--custom`. */
  let pendingProperty: string | null = null;

  /** Index of the next significant (non-whitespace, non-dropped) token. */
  const significantAfter = (from: number): CssToken | null => {
    for (let k = from; k < tokens.length; k++) {
      const t = tokens[k]!;
      if (t.type === 'ws') continue;
      if (t.type === 'comment' && !(t.licence && preserveLicenceComments)) continue;
      return t;
    }
    return null;
  };

  let lastSignificant: CssToken | null = null;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;

    if (token.type === 'ws') {
      const next = significantAfter(index + 1);
      // The `!== ' '` guard keeps output idempotent: two whitespace runs
      // separated by a dropped comment must not become two spaces.
      if (
        needsSpace(lastSignificant, next, ctx, parenDepth, bracketDepth) &&
        out[out.length - 1] !== ' '
      ) {
        out.push(' ');
      }
      continue;
    }

    if (token.type === 'comment') {
      if (token.licence && preserveLicenceComments) {
        out.push(token.value);
        licencesKept++;
        lastSignificant = token;
      } else {
        commentsRemoved++;
        // A dropped comment can be a token separator — `a/**/b` must not fuse.
        const next = significantAfter(index + 1);
        if (
          lastSignificant &&
          next &&
          lastSignificant.type !== 'punct' &&
          next.type !== 'punct' &&
          !out[out.length - 1]?.endsWith(' ')
        ) {
          out.push(' ');
        }
      }
      continue;
    }

    // ── Custom properties: the value is an arbitrary token stream, so it is
    //    copied straight out of the source rather than re-serialized. ──
    if (ctx === 'value' && pendingProperty?.startsWith('--') && out[out.length - 1] === ':') {
      let depth = 0;
      let end = index - 1; // stays here when the value is empty, e.g. `--x:;`
      for (let k = index; k < tokens.length; k++) {
        const t = tokens[k]!;
        if (t.type === 'punct') {
          if (t.value === '{' || t.value === '(' || t.value === '[') depth++;
          else if (t.value === '}' || t.value === ')' || t.value === ']') {
            if (depth === 0) break; // the } that closes the declaration block
            depth--;
          } else if (t.value === ';' && depth === 0) break;
        }
        end = k;
      }
      if (end >= index) {
        out.push(source.slice(token.start, tokens[end]!.end).trim());
        lastSignificant = tokens[end]!;
        index = end;
        continue;
      }
    }

    // ── Context transitions ──
    if (token.type === 'punct') {
      switch (token.value) {
        case '{':
          braceDepth++;
          blocks++;
          ctx = 'property';
          pendingProperty = null;
          break;
        case '}':
          braceDepth--;
          if (braceDepth < 0) {
            throw new CssParseError(
              'There is a } with no matching {. The block structure cannot be read, so minifying would produce a different stylesheet',
              token.line,
            );
          }
          // Drop the final semicolon of the block we are closing.
          if (out[out.length - 1] === ';') out.pop();
          ctx = braceDepth > 0 ? 'property' : 'prelude';
          pendingProperty = null;
          break;
        case ';':
          if (parenDepth === 0) {
            ctx = braceDepth > 0 ? 'property' : 'prelude';
            pendingProperty = null;
          }
          break;
        case ':':
          if (ctx === 'property' && parenDepth === 0) ctx = 'value';
          break;
        case '(':
          parenDepth++;
          break;
        case ')':
          parenDepth = Math.max(0, parenDepth - 1);
          break;
        case '[':
          bracketDepth++;
          if (ctx === 'property') ctx = 'prelude'; // a nested attribute selector
          break;
        case ']':
          bracketDepth = Math.max(0, bracketDepth - 1);
          break;
        case '&':
        case '.':
        case '*':
        case '>':
          // CSS nesting: these can only begin a selector, never a property.
          if (ctx === 'property') ctx = 'prelude';
          break;
        default:
          break;
      }
    } else if (token.type === 'at' && ctx === 'property') {
      ctx = 'prelude'; // a nested at-rule such as @media inside a rule
    } else if (token.type === 'ident' && ctx === 'property') {
      pendingProperty = token.value;
    }

    out.push(token.type === 'number' ? minifyNumber(token.value) : token.value);
    lastSignificant = token;
  }

  if (braceDepth > 0) {
    throw new CssParseError(
      `The stylesheet ends with ${braceDepth} block${braceDepth === 1 ? '' : 's'} still open — a } is missing`,
      tokens[tokens.length - 1]?.line ?? 1,
    );
  }

  const css = out.join('').trim();
  const originalBytes = bytes(source);
  const minifiedBytes = bytes(css);

  return {
    css,
    originalBytes,
    minifiedBytes,
    saved: originalBytes - minifiedBytes,
    savedPercent:
      originalBytes === 0 ? 0 : ((originalBytes - minifiedBytes) / originalBytes) * 100,
    commentsRemoved,
    licencesKept,
    blocks,
  };
}

export const SAMPLE_CSS = `/*! FindTool demo stylesheet v1.0 | MIT licence */

/* This comment is removed. The one above is not. */
:root {
  --brand: #4f46e5;
  --shadow: 0 1px 2px rgba(0,0,0,.08);
  --content-hack: "a; b { c } /* not a comment */";
}

.card   >   .title,
.card   >   .subtitle {
  margin : 0.5rem   0 ;
  color  : var( --brand ) ;
  background : url(images/hero(1).png) no-repeat center / cover ;
  width  : calc( 100% - 2.0rem ) ;
}

.card[data-state = "open"] .badge::after {
  content : "};" ;
  opacity : 0.50 ;
}

@media screen and (min-width: 48rem) {
  .card {
    padding : 1.25rem   2rem ;
  }
}
`;
