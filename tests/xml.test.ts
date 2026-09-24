import { describe, it, expect } from 'vitest';
import {
  tokenizeXml,
  decodeXmlEntities,
  escapeXml,
  checkWellFormed,
  formatXml,
  minifyXml,
  parseXml,
  buildFallbackTree,
  elementToJson,
  xmlToJson,
  xmlStats,
  parserErrorMessage,
  XmlParseError,
  ELEMENT_NODE,
  TEXT_NODE,
  SAMPLE_XML,
  SAMPLE_SOAP_XML,
  type XmlDomParser,
} from '~/lib/xml';

describe('tokenizeXml', () => {
  it('separates tags, attributes and text', () => {
    const tokens = tokenizeXml('<a href="x">hi</a>');
    expect(tokens.map((t) => t.kind)).toEqual(['open', 'text', 'close']);
    expect(tokens[0]).toMatchObject({ name: 'a', selfClosing: false });
    expect((tokens[0] as any).attributes).toEqual([{ name: 'href', value: 'x' }]);
  });

  it('recognises self-closing tags', () => {
    expect(tokenizeXml('<br/>')[0]).toMatchObject({ kind: 'open', selfClosing: true });
    expect(tokenizeXml('<br />')[0]).toMatchObject({ kind: 'open', selfClosing: true });
  });

  it('reads the declaration, doctype, comments and CDATA', () => {
    const tokens = tokenizeXml(
      '<?xml version="1.0"?><!DOCTYPE note><!-- c --><n><![CDATA[a < b]]></n>',
    );
    expect(tokens.map((t) => t.kind)).toEqual(['pi', 'doctype', 'comment', 'open', 'cdata', 'close']);
    expect((tokens[4] as any).value).toBe('a < b');
  });

  it('does not end a tag on a ">" inside an attribute value', () => {
    const tokens = tokenizeXml('<a t="1 > 0">x</a>');
    expect((tokens[0] as any).attributes).toEqual([{ name: 't', value: '1 > 0' }]);
    expect(tokens).toHaveLength(3);
  });

  it('accepts single-quoted and valueless attributes', () => {
    const attrs = (tokenizeXml("<input type='checkbox' checked/>")[0] as any).attributes;
    expect(attrs).toEqual([
      { name: 'type', value: 'checkbox' },
      { name: 'checked', value: '' },
    ]);
  });

  it('decodes entities in attribute values', () => {
    const attrs = (tokenizeXml('<a t="a &amp; b &#65;"/>')[0] as any).attributes;
    expect(attrs[0].value).toBe('a & b A');
  });

  it('tracks line numbers across the document', () => {
    const tokens = tokenizeXml('<a>\n  <b>\n    <c/>\n  </b>\n</a>');
    const c = tokens.find((t) => t.kind === 'open' && (t as any).name === 'c')!;
    expect(c.line).toBe(3);
  });

  it('keeps namespace prefixes on names and attributes', () => {
    const token = tokenizeXml('<soap:Body xmlns:soap="urn:x"/>')[0] as any;
    expect(token.name).toBe('soap:Body');
    expect(token.attributes[0].name).toBe('xmlns:soap');
  });

  // ── error cases ──
  it('reports an unterminated comment', () => {
    expect(() => tokenizeXml('<a><!-- never closed</a>')).toThrow(/comment/i);
  });

  it('reports an unterminated CDATA section', () => {
    expect(() => tokenizeXml('<a><![CDATA[oops</a>')).toThrow(/CDATA/i);
  });

  it('reports a tag that is never closed with ">"', () => {
    expect(() => tokenizeXml('<a attr="x"')).toThrow(/never closed/i);
  });
});

describe('decodeXmlEntities / escapeXml', () => {
  it('decodes the five predefined entities', () => {
    expect(decodeXmlEntities('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;')).toBe(`<a> & "b" 'c'`);
  });

  it('decodes decimal and hex character references', () => {
    expect(decodeXmlEntities('&#65;&#x42;&#x1F600;')).toBe('AB😀');
  });

  it('leaves an unknown entity untouched rather than guessing', () => {
    expect(decodeXmlEntities('&nbsp;')).toBe('&nbsp;');
  });

  it('escapes the characters that need escaping', () => {
    expect(escapeXml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
  });
});

describe('checkWellFormed', () => {
  it('accepts a well-formed document', () => {
    expect(() => checkWellFormed('<a><b/><c>text</c></a>')).not.toThrow();
  });

  it('reports mismatched tags with both line numbers', () => {
    let detail: any;
    try {
      checkWellFormed('<root>\n  <a>\n  </b>\n</root>');
    } catch (err) {
      detail = (err as XmlParseError).detail;
    }
    expect(detail.message).toMatch(/Mismatched tags/);
    expect(detail.message).toMatch(/line 2/);
    expect(detail.line).toBe(3);
  });

  it('reports an element that is never closed', () => {
    let detail: any;
    try {
      checkWellFormed('<root>\n  <item>\n</root>');
    } catch (err) {
      detail = (err as XmlParseError).detail;
    }
    expect(detail.message).toMatch(/Mismatched tags|never closed/);
  });

  it('reports a stray closing tag', () => {
    expect(() => checkWellFormed('<a></a></b>')).toThrow(/no matching opening tag/);
  });

  it('refuses a second root element', () => {
    expect(() => checkWellFormed('<a/><b/>')).toThrow(/only have one root element/);
  });

  it('refuses text outside the root element', () => {
    expect(() => checkWellFormed('<a/>trailing')).toThrow(/outside the root element/);
  });

  it('refuses a document with no elements', () => {
    expect(() => checkWellFormed('<!-- just a comment -->')).toThrow(/no elements/);
  });

  it('accepts the bundled RSS and SOAP samples', () => {
    expect(() => checkWellFormed(SAMPLE_XML)).not.toThrow();
    expect(() => checkWellFormed(SAMPLE_SOAP_XML)).not.toThrow();
  });
});

describe('formatXml', () => {
  it('indents nested elements', () => {
    expect(formatXml('<a><b><c/></b></a>')).toBe('<a>\n  <b>\n    <c/>\n  </b>\n</a>');
  });

  it('keeps a text-only element on one line', () => {
    expect(formatXml('<a><t>Release 2.1</t></a>')).toBe('<a>\n  <t>Release 2.1</t>\n</a>');
  });

  it('honours the indent width and tabs', () => {
    expect(formatXml('<a><b/></a>', { indent: 4 })).toBe('<a>\n    <b/>\n</a>');
    expect(formatXml('<a><b/></a>', { indent: '\t' })).toBe('<a>\n\t<b/>\n</a>');
  });

  it('collapses empty elements only when asked', () => {
    expect(formatXml('<a><b></b></a>')).toBe('<a>\n  <b></b>\n</a>');
    expect(formatXml('<a><b></b></a>', { collapseEmpty: true })).toBe('<a>\n  <b/>\n</a>');
  });

  it('keeps the declaration, doctype, comments and CDATA', () => {
    const out = formatXml('<?xml version="1.0"?><!-- hi --><a><![CDATA[x>y]]></a>');
    expect(out).toBe('<?xml version="1.0"?>\n<!-- hi -->\n<a><![CDATA[x>y]]></a>');
  });

  it('can drop comments and the declaration', () => {
    const out = formatXml('<?xml version="1.0"?><!-- hi --><a/>', {
      keepComments: false,
      keepDeclaration: false,
    });
    expect(out).toBe('<a/>');
  });

  it('normalises attribute quoting to double quotes', () => {
    expect(formatXml("<a t='x'/>")).toBe('<a t="x"/>');
  });

  it('re-escapes attribute values it decoded', () => {
    expect(formatXml('<a t="1 &lt; 2"/>')).toBe('<a t="1 &lt; 2"/>');
  });

  it('returns an empty string for empty input', () => {
    expect(formatXml('   ')).toBe('');
  });

  it('is idempotent on the SOAP sample', () => {
    const once = formatXml(SAMPLE_SOAP_XML);
    expect(formatXml(once)).toBe(once);
    expect(once.split('\n')[0]).toBe('<?xml version="1.0"?>');
  });

  it('expands the minified RSS sample into indented lines', () => {
    const out = formatXml(SAMPLE_XML);
    expect(out).toContain('\n  <channel>');
    expect(out).toContain('<title>ByteCabin Changelog</title>');
    expect(out.split('\n').length).toBeGreaterThan(15);
  });

  it('throws on malformed input before producing output', () => {
    expect(() => formatXml('<a><b></a>')).toThrow(XmlParseError);
  });

  it('can skip validation when the caller wants best effort', () => {
    expect(() => formatXml('<a><b></a>', { validate: false })).not.toThrow();
  });
});

describe('minifyXml', () => {
  it('removes whitespace between tags and drops comments', () => {
    expect(minifyXml('<a>\n  <!-- x -->\n  <b>1</b>\n</a>')).toBe('<a><b>1</b></a>');
  });

  it('keeps significant text', () => {
    expect(minifyXml('<a> hello  world </a>')).toBe('<a>hello world</a>');
  });

  it('round-trips with the formatter', () => {
    expect(minifyXml(formatXml(SAMPLE_SOAP_XML))).toBe(minifyXml(SAMPLE_SOAP_XML));
  });
});

describe('buildFallbackTree', () => {
  it('produces DOM-shaped nodes', () => {
    const root = buildFallbackTree('<a id="1">text<b/></a>');
    expect(root.nodeType).toBe(ELEMENT_NODE);
    expect(root.nodeName).toBe('a');
    expect(root.attributes![0]).toEqual({ name: 'id', value: '1' });
    expect(root.childNodes[0]!.nodeType).toBe(TEXT_NODE);
    expect(root.childNodes[1]!.nodeName).toBe('b');
  });

  it('decodes entities in text', () => {
    const root = buildFallbackTree('<a>1 &lt; 2</a>');
    expect(root.childNodes[0]!.nodeValue).toBe('1 < 2');
  });
});

describe('elementToJson', () => {
  const json = (xml: string, options = {}) => xmlToJson(xml, options);

  it('turns a text-only element into a string', () => {
    expect(json('<a>hello</a>')).toEqual({ a: 'hello' });
  });

  it('prefixes attributes with @ by default', () => {
    expect(json('<a id="1">x</a>')).toEqual({ a: { '@id': '1', '#text': 'x' } });
  });

  it('accepts a different attribute prefix and text key', () => {
    expect(json('<a id="1">x</a>', { attributePrefix: '_', textKey: 'value' })).toEqual({
      a: { _id: '1', value: 'x' },
    });
  });

  it('can merge attributes in with no prefix at all', () => {
    expect(json('<a id="1"><b>2</b></a>', { attributePrefix: '' })).toEqual({
      a: { id: '1', b: '2' },
    });
  });

  it('can ignore attributes entirely', () => {
    expect(json('<a id="1">x</a>', { ignoreAttributes: true })).toEqual({ a: 'x' });
  });

  it('collects repeated child names into an array', () => {
    expect(json('<r><i>1</i><i>2</i><i>3</i></r>')).toEqual({ r: { i: ['1', '2', '3'] } });
  });

  it('can force every child into an array for a stable shape', () => {
    expect(json('<r><i>1</i></r>', { forceArrays: true })).toEqual({ r: { i: ['1'] } });
  });

  it('represents an empty element as an empty string', () => {
    expect(json('<r><a/><b></b></r>')).toEqual({ r: { a: '', b: '' } });
  });

  it('keeps text that sits alongside child elements', () => {
    expect(json('<p>before<b>bold</b>after</p>')).toEqual({
      p: { b: 'bold', '#text': 'beforeafter' },
    });
  });

  it('treats CDATA as ordinary text', () => {
    expect(json('<a><![CDATA[x < y]]></a>')).toEqual({ a: 'x < y' });
  });

  it('drops comments by default and keeps them on request', () => {
    expect(json('<a><!-- note --><b>1</b></a>')).toEqual({ a: { b: '1' } });
    expect(json('<a><!-- note --><b>1</b></a>', { ignoreComments: false })).toEqual({
      a: { b: '1', '#comment': 'note' },
    });
  });

  it('leaves values as strings unless parsing is requested', () => {
    expect(json('<a><n>42</n><ok>true</ok></a>')).toEqual({ a: { n: '42', ok: 'true' } });
    expect(json('<a><n>42</n><ok>true</ok></a>', { parseValues: true })).toEqual({
      a: { n: 42, ok: true },
    });
  });

  it('keeps a leading-zero value as a string even when parsing', () => {
    expect(json('<a>007</a>', { parseValues: true })).toEqual({ a: '007' });
  });

  it('can omit the root wrapper', () => {
    expect(json('<a><b>1</b></a>', { includeRoot: false })).toEqual({ b: '1' });
  });

  it('collapses insignificant whitespace in text', () => {
    expect(json('<a>\n  spaced   out\n</a>')).toEqual({ a: 'spaced out' });
  });

  it('keeps namespace prefixes in keys', () => {
    const value = json(SAMPLE_SOAP_XML) as any;
    expect(Object.keys(value)).toEqual(['soap:Envelope']);
    expect(value['soap:Envelope']['soap:Body']['GetQuoteResponse']['Price']).toEqual({
      '@currency': 'USD',
      '#text': '184.25',
    });
  });

  it('converts the RSS sample with repeated items and categories', () => {
    const value = xmlToJson(SAMPLE_XML) as any;
    const channel = value.rss.channel;
    expect(channel.item).toHaveLength(2);
    expect(channel.item[0].category).toEqual(['release', 'json']);
    expect(channel.item[1].category).toBe('ui');
    expect(channel.item[0].description).toContain('<b>viewer</b>');
  });

  it('works on a hand-built node literal, no DOM required', () => {
    const element = {
      nodeType: ELEMENT_NODE,
      nodeName: 'item',
      attributes: [{ name: 'id', value: '7' }],
      childNodes: [{ nodeType: TEXT_NODE, nodeName: '#text', nodeValue: 'hi', childNodes: [] }],
    };
    expect(elementToJson(element)).toEqual({ '@id': '7', '#text': 'hi' });
  });
});

describe('parseXml', () => {
  it('uses an injected parser when one is given', () => {
    const calls: string[] = [];
    const fake: XmlDomParser = {
      parseFromString(source, mime) {
        calls.push(mime);
        return {
          documentElement: buildFallbackTree(source),
          getElementsByTagName: () => [],
        };
      },
    };
    const root = parseXml('<a>1</a>', fake);
    expect(calls).toEqual(['application/xml']);
    expect(root.nodeName).toBe('a');
  });

  it('surfaces a parsererror from an injected parser', () => {
    const fake: XmlDomParser = {
      parseFromString() {
        return {
          documentElement: null,
          getElementsByTagName: (name: string) =>
            name === 'parsererror'
              ? [{ textContent: 'error on line 2 at column 5: Opening and ending tag mismatch' }]
              : [],
        };
      },
    };
    // The structural check has the better message, so it wins.
    expect(() => parseXml('<a>\n  <b></a>', fake)).toThrow(/Mismatched tags/);
  });

  it('falls back to the built-in parser in Node', () => {
    expect(parseXml('<a><b/></a>').nodeName).toBe('a');
  });

  it('refuses empty input politely', () => {
    expect(() => parseXml('  ')).toThrow(/nothing to parse/);
  });

  it('refuses malformed input with a line number', () => {
    let detail: any;
    try {
      parseXml('<a>\n<b>\n</a>');
    } catch (err) {
      detail = (err as XmlParseError).detail;
    }
    expect(detail.line).toBeDefined();
  });
});

describe('parserErrorMessage', () => {
  it('returns null when there is no parsererror element', () => {
    expect(parserErrorMessage({ getElementsByTagName: () => [] })).toBeNull();
  });

  it('cleans up the browser wording and extracts the position', () => {
    const detail = parserErrorMessage({
      getElementsByTagName: () => [
        {
          textContent:
            'This page contains the following errors:\nerror on line 3 at column 12: Extra content at the end of the document\nBelow is a rendering of the page up to the first error.',
        },
      ],
    })!;
    expect(detail.message).not.toMatch(/This page contains/);
    expect(detail.line).toBe(3);
    expect(detail.column).toBe(12);
  });
});

describe('xmlStats', () => {
  it('counts elements, attributes, text nodes and depth', () => {
    const stats = xmlStats(buildFallbackTree('<a id="1"><b>x</b><b>y</b></a>'));
    expect(stats.elements).toBe(3);
    expect(stats.attributes).toBe(1);
    expect(stats.textNodes).toBe(2);
    expect(stats.depth).toBe(2);
  });
});
