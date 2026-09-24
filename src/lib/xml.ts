/**
 * XML helpers shared by the XML formatter and the XML → JSON converter.
 *
 * Zero dependencies. Two separate pieces of machinery live here, on purpose:
 *
 *  - A small **tokeniser** (`tokenizeXml`) that the pretty-printer and the
 *    structural well-formedness check run on. Working from tokens rather than
 *    a parsed tree is what lets the formatter keep comments, CDATA sections,
 *    processing instructions and the DOCTYPE exactly as written.
 *  - A **tree walker** (`elementToJson`) that turns a parsed document into
 *    JSON. In a browser the tree comes from the platform's own `DOMParser`,
 *    which is the most correct XML parser already on the machine.
 *
 * `DOMParser` only exists in a browser, so nothing here touches it at import
 * time: every entry point takes an optional parser, falls back to the global
 * `DOMParser` when there is one, and finally to the tokeniser-backed parser
 * below — which is what makes this module importable and testable in Node.
 */

// ─── Node type constants (the DOM values, so a real DOM node fits) ────────

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const CDATA_SECTION_NODE = 4;
export const PROCESSING_INSTRUCTION_NODE = 7;
export const COMMENT_NODE = 8;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_TYPE_NODE = 10;

/**
 * The slice of the DOM the walker actually needs.
 * A real `Element` from `DOMParser` satisfies this structurally, and so does a
 * plain object literal in a test.
 */
export interface XmlLikeNode {
  nodeType: number;
  nodeName: string;
  nodeValue?: string | null;
  attributes?: ArrayLike<{ name: string; value: string }> | null;
  childNodes: ArrayLike<XmlLikeNode>;
}

/** Anything shaped like `DOMParser`. */
export interface XmlDomParser {
  parseFromString(source: string, mimeType: string): any;
}

export interface XmlErrorDetail {
  message: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
  /** The source line the error points at. */
  excerpt?: string;
}

export class XmlParseError extends Error {
  readonly detail: XmlErrorDetail;
  constructor(detail: XmlErrorDetail) {
    super(detail.message);
    this.name = 'XmlParseError';
    this.detail = detail;
  }
}

// ─── Tokeniser ────────────────────────────────────────────────────────────

export interface XmlAttribute {
  name: string;
  value: string;
}

export type XmlToken =
  | { kind: 'text'; value: string; line: number }
  | { kind: 'open'; name: string; attributes: XmlAttribute[]; selfClosing: boolean; line: number }
  | { kind: 'close'; name: string; line: number }
  | { kind: 'comment'; value: string; line: number }
  | { kind: 'cdata'; value: string; line: number }
  | { kind: 'pi'; target: string; value: string; line: number }
  | { kind: 'doctype'; value: string; line: number };

const ATTR_RE = /([^\s"'=/<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

/**
 * Split XML source into tokens.
 *
 * Deliberately forgiving about content it does not need to understand (a
 * DOCTYPE internal subset, unknown processing instructions) and strict about
 * anything it cannot resume from, such as an unterminated comment.
 */
export function tokenizeXml(source: string): XmlToken[] {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const tokens: XmlToken[] = [];
  let i = 0;
  let line = 1;

  const countLines = (chunk: string) => {
    for (let k = 0; k < chunk.length; k++) if (chunk.charCodeAt(k) === 10) line++;
  };

  const fail = (message: string, atLine: number) => {
    throw new XmlParseError({ message, line: atLine, excerpt: sourceLine(text, atLine) });
  };

  while (i < text.length) {
    const lt = text.indexOf('<', i);

    if (lt === -1) {
      const rest = text.slice(i);
      if (rest) tokens.push({ kind: 'text', value: rest, line });
      break;
    }
    if (lt > i) {
      const chunk = text.slice(i, lt);
      tokens.push({ kind: 'text', value: chunk, line });
      countLines(chunk);
      i = lt;
    }

    const startLine = line;

    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) fail('A comment is opened with <!-- and never closed with -->.', startLine);
      const value = text.slice(i + 4, end);
      tokens.push({ kind: 'comment', value, line: startLine });
      countLines(text.slice(i, end + 3));
      i = end + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end === -1) fail('A CDATA section is opened and never closed with ]]>.', startLine);
      const value = text.slice(i + 9, end);
      tokens.push({ kind: 'cdata', value, line: startLine });
      countLines(text.slice(i, end + 3));
      i = end + 3;
      continue;
    }

    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) fail('A processing instruction is opened with <? and never closed with ?>.', startLine);
      const inner = text.slice(i + 2, end);
      const space = inner.search(/\s/);
      const target = space === -1 ? inner : inner.slice(0, space);
      tokens.push({
        kind: 'pi',
        target,
        value: space === -1 ? '' : inner.slice(space + 1).trim(),
        line: startLine,
      });
      countLines(text.slice(i, end + 2));
      i = end + 2;
      continue;
    }

    if (text.startsWith('<!', i)) {
      // DOCTYPE, possibly with an internal subset in square brackets.
      let end = text.indexOf('>', i);
      const bracket = text.indexOf('[', i);
      if (bracket !== -1 && end !== -1 && bracket < end) {
        const close = text.indexOf(']', bracket);
        end = close === -1 ? -1 : text.indexOf('>', close);
      }
      if (end === -1) fail('A <!DOCTYPE …> declaration is never closed.', startLine);
      const raw = text.slice(i, end + 1);
      tokens.push({ kind: 'doctype', value: raw, line: startLine });
      countLines(raw);
      i = end + 1;
      continue;
    }

    if (text.startsWith('</', i)) {
      const end = text.indexOf('>', i);
      if (end === -1) fail('A closing tag is missing its ">".', startLine);
      const name = text.slice(i + 2, end).trim();
      if (!name) fail('An empty closing tag "</>" is not valid XML.', startLine);
      tokens.push({ kind: 'close', name, line: startLine });
      countLines(text.slice(i, end + 1));
      i = end + 1;
      continue;
    }

    // An opening tag: find its ">" without stopping inside a quoted value.
    let j = i + 1;
    let quote: string | null = null;
    while (j < text.length) {
      const c = text[j]!;
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    if (j >= text.length) fail('A tag is opened with "<" and never closed with ">".', startLine);

    const raw = text.slice(i + 1, j);
    const selfClosing = raw.trimEnd().endsWith('/');
    const body = selfClosing ? raw.trimEnd().slice(0, -1) : raw;
    const nameMatch = body.match(/^[^\s/>]+/);
    if (!nameMatch) fail('A "<" is followed by something that is not a tag name. Escape it as &lt;.', startLine);
    const name = nameMatch![0];

    const attributes: XmlAttribute[] = [];
    ATTR_RE.lastIndex = name.length;
    let m: RegExpExecArray | null;
    while ((m = ATTR_RE.exec(body))) {
      const value = m[2] ?? m[3] ?? m[4] ?? '';
      attributes.push({ name: m[1]!, value: decodeXmlEntities(value) });
    }

    tokens.push({ kind: 'open', name, attributes, selfClosing, line: startLine });
    countLines(text.slice(i, j + 1));
    i = j + 1;
  }

  return tokens;
}

function sourceLine(text: string, line: number): string | undefined {
  const value = text.split('\n')[line - 1];
  if (value === undefined) return undefined;
  return value.length > 200 ? `${value.slice(0, 200)}…` : value;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Resolve the five predefined entities plus numeric character references. */
export function decodeXmlEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/** Escape text for use as XML character data or an attribute value. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Well-formedness ──────────────────────────────────────────────────────

/**
 * Structural check: every open tag is closed by the matching name, in order,
 * and there is exactly one root element. Throws {@link XmlParseError}.
 *
 * This is not a full XML validator — it is the part that produces a useful
 * line number, which is exactly what `DOMParser`'s `<parsererror>` is bad at
 * in some browsers.
 */
export function checkWellFormed(source: string): void {
  const tokens = tokenizeXml(source);
  const stack: { name: string; line: number }[] = [];
  let roots = 0;
  let sawElement = false;

  for (const token of tokens) {
    if (token.kind === 'open') {
      sawElement = true;
      if (stack.length === 0) {
        roots++;
        if (roots > 1) {
          throw new XmlParseError({
            message: `A second root element <${token.name}> starts here. An XML document may only have one root element — wrap them in a common parent.`,
            line: token.line,
            excerpt: sourceLine(source, token.line),
          });
        }
      }
      if (!token.selfClosing) stack.push({ name: token.name, line: token.line });
    } else if (token.kind === 'close') {
      const open = stack.pop();
      if (!open) {
        throw new XmlParseError({
          message: `Closing tag </${token.name}> has no matching opening tag.`,
          line: token.line,
          excerpt: sourceLine(source, token.line),
        });
      }
      if (open.name !== token.name) {
        throw new XmlParseError({
          message: `Mismatched tags: <${open.name}> opened on line ${open.line} is closed by </${token.name}>.`,
          line: token.line,
          excerpt: sourceLine(source, token.line),
        });
      }
    } else if (token.kind === 'text' && stack.length === 0 && token.value.trim() !== '') {
      throw new XmlParseError({
        message: 'Text appears outside the root element. All character data must live inside an element.',
        line: token.line,
        excerpt: sourceLine(source, token.line),
      });
    }
  }

  if (stack.length > 0) {
    const open = stack[stack.length - 1]!;
    throw new XmlParseError({
      message: `<${open.name}> is opened on line ${open.line} and never closed.`,
      line: open.line,
      excerpt: sourceLine(source, open.line),
    });
  }
  if (!sawElement) {
    throw new XmlParseError({ message: 'This document contains no elements at all.' });
  }
}

/**
 * Read the `<parsererror>` a browser inserts when `parseFromString` fails, and
 * turn it into one readable sentence. Returns null when the document parsed.
 */
export function parserErrorMessage(doc: any): XmlErrorDetail | null {
  const node = doc?.getElementsByTagName?.('parsererror')?.[0];
  if (!node) return null;

  const raw = String(node.textContent ?? 'The XML could not be parsed.')
    .replace(/This page contains the following errors:?/i, '')
    .replace(/Below is a rendering of the page up to the first error\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const lineMatch = raw.match(/line[: ]+(\d+)/i);
  const columnMatch = raw.match(/column[: ]+(\d+)/i);

  return {
    message: raw || 'The XML could not be parsed.',
    line: lineMatch ? Number(lineMatch[1]) : undefined,
    column: columnMatch ? Number(columnMatch[1]) : undefined,
  };
}

// ─── Pretty-printing ──────────────────────────────────────────────────────

export interface XmlFormatOptions {
  /** Spaces per level, or `'\t'`. Default 2. */
  indent?: number | '\t';
  /** Rewrite `<a></a>` as `<a/>`. Default false. */
  collapseEmpty?: boolean;
  /** Keep comments. Default true. */
  keepComments?: boolean;
  /** Keep the XML declaration and DOCTYPE. Default true. */
  keepDeclaration?: boolean;
  /** Check structure before formatting. Default true. */
  validate?: boolean;
}

/**
 * Re-indent XML.
 *
 * An element whose children are only text stays on one line, so
 * `<title>Release 2.1</title>` is not blown up into three. Whitespace between
 * elements is treated as insignificant, which is the right call for data XML
 * (SOAP, RSS, config) and the wrong call for mixed content — see the tool page.
 */
export function formatXml(source: string, options: XmlFormatOptions = {}): string {
  const {
    indent = 2,
    collapseEmpty = false,
    keepComments = true,
    keepDeclaration = true,
    validate = true,
  } = options;

  if (!source.trim()) return '';
  if (validate) checkWellFormed(source);

  const pad = indent === '\t' ? '\t' : ' '.repeat(Math.max(0, indent));
  const tokens = tokenizeXml(source);
  const out: string[] = [];
  let depth = 0;

  const push = (text: string) => out.push(pad.repeat(depth) + text);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    switch (token.kind) {
      case 'pi':
        if (keepDeclaration || token.target !== 'xml') {
          push(token.value ? `<?${token.target} ${token.value}?>` : `<?${token.target}?>`);
        }
        break;

      case 'doctype':
        if (keepDeclaration) push(token.value);
        break;

      case 'comment':
        if (keepComments) push(`<!--${token.value}-->`);
        break;

      case 'cdata':
        push(`<![CDATA[${token.value}]]>`);
        break;

      case 'text': {
        const trimmed = token.value.trim();
        if (trimmed) push(collapseWhitespace(trimmed));
        break;
      }

      case 'open': {
        const tag = openTag(token);
        if (token.selfClosing) {
          push(tag);
          break;
        }

        // `<a>text</a>` and `<a></a>` collapse onto a single line.
        const inline = inlineContent(tokens, i);
        if (inline) {
          if (inline.text === '' && collapseEmpty) {
            push(selfCloseTag(token));
          } else {
            push(`${tag}${inline.text}</${token.name}>`);
          }
          i = inline.nextIndex;
          break;
        }

        push(tag);
        depth++;
        break;
      }

      case 'close':
        depth = Math.max(0, depth - 1);
        push(`</${token.name}>`);
        break;
    }
  }

  return out.join('\n');
}

/** Strip every bit of whitespace between tags. */
export function minifyXml(source: string, options: { validate?: boolean } = {}): string {
  if (!source.trim()) return '';
  if (options.validate !== false) checkWellFormed(source);

  const tokens = tokenizeXml(source);
  const out: string[] = [];

  for (const token of tokens) {
    switch (token.kind) {
      case 'pi':
        out.push(token.value ? `<?${token.target} ${token.value}?>` : `<?${token.target}?>`);
        break;
      case 'doctype':
        out.push(token.value);
        break;
      case 'comment':
        break;
      case 'cdata':
        out.push(`<![CDATA[${token.value}]]>`);
        break;
      case 'text': {
        const trimmed = token.value.trim();
        if (trimmed) out.push(collapseWhitespace(trimmed));
        break;
      }
      case 'open':
        out.push(openTag(token));
        break;
      case 'close':
        out.push(`</${token.name}>`);
        break;
    }
  }
  return out.join('');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ');
}

function openTag(token: Extract<XmlToken, { kind: 'open' }>): string {
  const attrs = token.attributes
    .map((a) => ` ${a.name}="${escapeXml(a.value)}"`)
    .join('');
  return token.selfClosing ? `<${token.name}${attrs}/>` : `<${token.name}${attrs}>`;
}

function selfCloseTag(token: Extract<XmlToken, { kind: 'open' }>): string {
  const attrs = token.attributes.map((a) => ` ${a.name}="${escapeXml(a.value)}"`).join('');
  return `<${token.name}${attrs}/>`;
}

/**
 * If the element opened at `start` contains nothing but text and CDATA, return
 * that text plus the index of its closing tag. Otherwise null.
 */
function inlineContent(
  tokens: XmlToken[],
  start: number,
): { text: string; nextIndex: number } | null {
  const open = tokens[start] as Extract<XmlToken, { kind: 'open' }>;
  let text = '';

  for (let i = start + 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === 'close') {
      return token.name === open.name ? { text: text.trim(), nextIndex: i } : null;
    }
    if (token.kind === 'text') {
      text += token.value;
      continue;
    }
    if (token.kind === 'cdata') {
      text += `<![CDATA[${token.value}]]>`;
      continue;
    }
    return null; // an element, comment or PI child — needs real indentation
  }
  return null;
}

// ─── Parsing to a tree ────────────────────────────────────────────────────

/**
 * Parse XML and return the root element.
 *
 * Resolution order: the injected parser, then the platform `DOMParser`, then
 * the tokeniser-backed fallback used by Node. Well-formedness is checked
 * either way, so an error always carries a line number.
 */
export function parseXml(source: string, parser?: XmlDomParser | null): XmlLikeNode {
  if (!source.trim()) {
    throw new XmlParseError({ message: 'There is nothing to parse yet — paste some XML first.' });
  }

  const dom = parser ?? globalDomParser();
  if (!dom) {
    checkWellFormed(source);
    return buildFallbackTree(source);
  }

  const doc = dom.parseFromString(source, 'application/xml');
  const error = parserErrorMessage(doc);
  if (error) {
    // The structural check usually has the better message and a line number,
    // so prefer it and fall back to the browser's own wording.
    try {
      checkWellFormed(source);
    } catch (err) {
      if (err instanceof XmlParseError) throw err;
    }
    throw new XmlParseError({ ...error, excerpt: error.line ? sourceLine(source, error.line) : undefined });
  }

  const root = doc.documentElement as XmlLikeNode | null;
  if (!root) throw new XmlParseError({ message: 'This document has no root element.' });
  return root;
}

function globalDomParser(): XmlDomParser | null {
  const ctor = (globalThis as { DOMParser?: new () => XmlDomParser }).DOMParser;
  return typeof ctor === 'function' ? new ctor() : null;
}

/**
 * Build an `XmlLikeNode` tree from the token stream.
 *
 * Only used where there is no `DOMParser` — i.e. in Node and in unit tests.
 * It produces the same node types and names a DOM would, so the walker below
 * cannot tell the two apart.
 */
export function buildFallbackTree(source: string): XmlLikeNode {
  const tokens = tokenizeXml(source);
  const root: XmlLikeNode & { childNodes: XmlLikeNode[] } = {
    nodeType: DOCUMENT_NODE,
    nodeName: '#document',
    childNodes: [],
  };
  const stack: (XmlLikeNode & { childNodes: XmlLikeNode[] })[] = [root];
  const top = () => stack[stack.length - 1]!;

  for (const token of tokens) {
    switch (token.kind) {
      case 'open': {
        const element: XmlLikeNode & { childNodes: XmlLikeNode[] } = {
          nodeType: ELEMENT_NODE,
          nodeName: token.name,
          attributes: token.attributes.map((a) => ({ name: a.name, value: a.value })),
          childNodes: [],
        };
        top().childNodes.push(element);
        if (!token.selfClosing) stack.push(element);
        break;
      }
      case 'close':
        if (stack.length > 1) stack.pop();
        break;
      case 'text':
        top().childNodes.push({
          nodeType: TEXT_NODE,
          nodeName: '#text',
          nodeValue: decodeXmlEntities(token.value),
          childNodes: [],
        });
        break;
      case 'cdata':
        top().childNodes.push({
          nodeType: CDATA_SECTION_NODE,
          nodeName: '#cdata-section',
          nodeValue: token.value,
          childNodes: [],
        });
        break;
      case 'comment':
        top().childNodes.push({
          nodeType: COMMENT_NODE,
          nodeName: '#comment',
          nodeValue: token.value,
          childNodes: [],
        });
        break;
      case 'pi':
      case 'doctype':
        break; // not represented in the JSON output
    }
  }

  const element = Array.from(root.childNodes).find((n) => n.nodeType === ELEMENT_NODE);
  if (!element) throw new XmlParseError({ message: 'This document has no root element.' });
  return element;
}

// ─── Tree → JSON ──────────────────────────────────────────────────────────

export interface XmlToJsonOptions {
  /** Prefix that marks a key as an attribute. Default `'@'`; `''` merges them in. */
  attributePrefix?: string;
  /** Key holding text that sits alongside attributes or elements. Default `'#text'`. */
  textKey?: string;
  /** Drop attributes entirely. Default false. */
  ignoreAttributes?: boolean;
  /** Drop comments. Default true. */
  ignoreComments?: boolean;
  /** Key used when comments are kept. Default `'#comment'`. */
  commentKey?: string;
  /** Trim and collapse whitespace in text nodes. Default true. */
  trimText?: boolean;
  /** Convert `"42"` and `"true"` into real JSON types. Default false. */
  parseValues?: boolean;
  /** Put every child element in an array, even when it occurs once. Default false. */
  forceArrays?: boolean;
  /** Wrap the result in `{ rootName: … }`. Default true. */
  includeRoot?: boolean;
}

const NUMERIC = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function castText(value: string, options: XmlToJsonOptions): unknown {
  if (!options.parseValues) return value;
  const t = value.trim();
  if (t === '') return value;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (NUMERIC.test(t) && t.replace(/[^0-9]/g, '').length <= 15) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

/**
 * Walk one element into a JSON value.
 *
 * The shape follows the widely used "compact" convention: an element with no
 * attributes and only text becomes that text, repeated sibling names become an
 * array, and anything else becomes an object keyed by child name.
 */
export function elementToJson(element: XmlLikeNode, options: XmlToJsonOptions = {}): unknown {
  const {
    attributePrefix = '@',
    textKey = '#text',
    ignoreAttributes = false,
    ignoreComments = true,
    commentKey = '#comment',
    trimText = true,
    forceArrays = false,
  } = options;

  const result: Record<string, unknown> = {};
  let hasKeys = false;

  if (!ignoreAttributes && element.attributes) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i]!;
      result[`${attributePrefix}${attr.name}`] = castText(attr.value, options);
      hasKeys = true;
    }
  }

  const children = Array.from(element.childNodes ?? []);
  const elements = children.filter((c) => c.nodeType === ELEMENT_NODE);
  const comments = ignoreComments ? [] : children.filter((c) => c.nodeType === COMMENT_NODE);

  let text = children
    .filter((c) => c.nodeType === TEXT_NODE || c.nodeType === CDATA_SECTION_NODE)
    .map((c) => c.nodeValue ?? '')
    .join('');
  if (trimText) text = text.replace(/\s+/g, ' ').trim();

  if (elements.length === 0) {
    if (!hasKeys) return text === '' ? '' : castText(text, options);
    if (text !== '') result[textKey] = castText(text, options);
    return result;
  }

  for (const child of elements) {
    const name = child.nodeName;
    const value = elementToJson(child, options);
    const existing = result[name];

    if (existing === undefined) {
      result[name] = forceArrays ? [value] : value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[name] = [existing, value];
    }
    hasKeys = true;
  }

  if (text !== '') result[textKey] = castText(text, options);
  if (comments.length > 0) {
    const values = comments.map((c) => (c.nodeValue ?? '').trim());
    result[commentKey] = values.length === 1 ? values[0] : values;
  }

  return result;
}

/** Parse XML text and convert it to a JSON-ready value. */
export function xmlToJson(
  source: string,
  options: XmlToJsonOptions = {},
  parser?: XmlDomParser | null,
): unknown {
  const root = parseXml(source, parser);
  const value = elementToJson(root, options);
  return options.includeRoot === false ? value : { [root.nodeName]: value };
}

/** Count elements, attributes and depth — used for the tools' stat chips. */
export function xmlStats(element: XmlLikeNode): {
  elements: number;
  attributes: number;
  depth: number;
  textNodes: number;
} {
  let elements = 0;
  let attributes = 0;
  let textNodes = 0;
  let depth = 0;

  const walk = (node: XmlLikeNode, level: number) => {
    if (node.nodeType === ELEMENT_NODE) {
      elements++;
      attributes += node.attributes?.length ?? 0;
      if (level > depth) depth = level;
    } else if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
      if ((node.nodeValue ?? '').trim() !== '') textNodes++;
    }
    for (const child of Array.from(node.childNodes ?? [])) walk(child, level + 1);
  };
  walk(element, 1);

  return { elements, attributes, depth, textNodes };
}

// ─── Samples ──────────────────────────────────────────────────────────────

export const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>ByteCabin Changelog</title>
<link>https://bytecabin.dev/changelog</link><atom:link href="https://bytecabin.dev/feed.xml" rel="self"/>
<!-- newest first --><item><guid isPermaLink="false">bc-2026-09-24</guid><title>Ten JSON tools</title>
<pubDate>Thu, 24 Sep 2026 09:00:00 GMT</pubDate><category>release</category><category>json</category>
<description><![CDATA[Added the <b>viewer</b> and CSV converters.]]></description></item>
<item><guid isPermaLink="false">bc-2026-08-11</guid><title>Dark mode</title>
<pubDate>Tue, 11 Aug 2026 16:30:00 GMT</pubDate><category>ui</category>
<description>Respects prefers-color-scheme.</description></item></channel></rss>`;

export const SAMPLE_SOAP_XML = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <auth:Token xmlns:auth="urn:example:auth" expires="2026-09-24T12:00:00Z">a1b2c3</auth:Token>
  </soap:Header>
  <soap:Body>
    <GetQuoteResponse xmlns="urn:example:quotes">
      <Symbol>ANTH</Symbol>
      <Price currency="USD">184.25</Price>
      <Volume>1204993</Volume>
    </GetQuoteResponse>
  </soap:Body>
</soap:Envelope>`;
