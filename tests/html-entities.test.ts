import { describe, it, expect } from 'vitest';
import {
  encodeHtmlEntities,
  escapeMarkup,
  escapeForRawTextElement,
  decodeHtmlEntities,
  decodeHtmlEntitiesDeep,
  entityDepth,
  findEntities,
  NAMED_ENTITIES,
  SAMPLE_HTML,
  SAMPLE_ENTITIES,
} from '~/lib/html-entities';

describe('encodeHtmlEntities', () => {
  it('escapes the five markup-significant characters by default', () => {
    expect(encodeHtmlEntities(`<a href="x">Tea & 'biscuits'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tea &amp; &#39;biscuits&#39;&lt;/a&gt;',
    );
  });

  it('escapes the ampersand first, so nothing is double-escaped', () => {
    expect(encodeHtmlEntities('&lt;')).toBe('&amp;lt;');
    expect(decodeHtmlEntities(encodeHtmlEntities('&lt;'))).toBe('&lt;');
  });

  it('leaves ordinary text and accented letters alone in minimal mode', () => {
    expect(encodeHtmlEntities('Café — 100% fine')).toBe('Café — 100% fine');
  });

  it('escapes every non-ASCII character in aggressive mode', () => {
    expect(encodeHtmlEntities('Café', { scope: 'aggressive' })).toBe('Caf&eacute;');
    expect(encodeHtmlEntities('—', { scope: 'aggressive' })).toBe('&mdash;');
  });

  it('emits decimal and hexadecimal references on request', () => {
    expect(encodeHtmlEntities('<&>', { style: 'decimal' })).toBe('&#60;&#38;&#62;');
    expect(encodeHtmlEntities('<&>', { style: 'hex' })).toBe('&#x3C;&#x26;&#x3E;');
  });

  it('uses &#39; rather than &apos;, which HTML 4 does not define', () => {
    expect(encodeHtmlEntities("'")).toBe('&#39;');
  });

  it('falls back to a numeric reference when no name exists', () => {
    const hammer = String.fromCodePoint(0x1f6e0);
    expect(encodeHtmlEntities(hammer, { scope: 'aggressive' })).toBe('&#128736;');
    // And the numeric reference must survive a round trip as one code point.
    expect(decodeHtmlEntities('&#128736;')).toBe(hammer);
  });

  it('can be told to leave quotes alone', () => {
    expect(encodeHtmlEntities(`a "b" 'c' <d>`, { quotes: false })).toBe(`a "b" 'c' &lt;d&gt;`);
  });

  it('round-trips the shipped sample', () => {
    expect(decodeHtmlEntities(escapeMarkup(SAMPLE_HTML))).toBe(SAMPLE_HTML);
  });

  it('handles empty input', () => {
    expect(encodeHtmlEntities('')).toBe('');
  });
});

describe('escapeForRawTextElement', () => {
  it('neutralises a closing tag inside script content', () => {
    const escaped = escapeForRawTextElement('const s = "</script>";');
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('<\\/script>');
  });

  it('leaves a lone less-than alone, since entities are not parsed there', () => {
    expect(escapeForRawTextElement('if (a < b)')).toBe('if (a < b)');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named references', () => {
    expect(decodeHtmlEntities('&amp;&lt;&gt;&quot;&apos;')).toBe(`&<>"'`);
    expect(decodeHtmlEntities('Caf&eacute; &mdash; open')).toBe('Café — open');
  });

  it('decodes decimal and hexadecimal references', () => {
    expect(decodeHtmlEntities('&#233;')).toBe('é');
    expect(decodeHtmlEntities('&#xE9;')).toBe('é');
    expect(decodeHtmlEntities('&#X2014;')).toBe('—');
  });

  it('decodes astral code points to a single character', () => {
    const hammer = String.fromCodePoint(0x1f6e0);
    expect(decodeHtmlEntities('&#x1F6E0;')).toBe(hammer);
    expect([...decodeHtmlEntities('&#x1F6E0;')]).toHaveLength(1);
  });

  it('applies the Windows-1252 fix-up the HTML spec mandates', () => {
    // U+0093 is a C1 control; browsers render it as a left double quote.
    expect(decodeHtmlEntities('&#147;quoted&#148;')).toBe('“quoted”');
    expect(decodeHtmlEntities('&#151;')).toBe('—');
  });

  it('replaces lone surrogates and out-of-range values', () => {
    expect(decodeHtmlEntities('&#xD800;')).toBe('�');
    expect(decodeHtmlEntities('&#x110000;')).toBe('�');
    expect(decodeHtmlEntities('&#0;')).toBe('�');
  });

  it('accepts a named reference without its semicolon, as browsers do', () => {
    expect(decodeHtmlEntities('AT&amp T')).toBe('AT& T');
    expect(decodeHtmlEntities('&notit')).toBe('¬it');
  });

  it('honours strict mode', () => {
    expect(decodeHtmlEntities('&amp', { strict: true })).toBe('&amp');
    expect(decodeHtmlEntities('&amp;', { strict: true })).toBe('&');
  });

  it('leaves unknown references untouched rather than eating them', () => {
    expect(decodeHtmlEntities('&notarealentity;')).toBe('&notarealentity;');
    expect(decodeHtmlEntities('R&D budget')).toBe('R&D budget');
    expect(decodeHtmlEntities('a & b')).toBe('a & b');
  });

  it('handles malformed numeric references', () => {
    expect(decodeHtmlEntities('&#;')).toBe('&#;');
    expect(decodeHtmlEntities('&#x;')).toBe('&#x;');
  });

  it('decodes the shipped sample into readable text', () => {
    const decoded = decodeHtmlEntities(SAMPLE_ENTITIES);
    expect(decoded).toContain('Café');
    expect(decoded).toContain('“the best espresso in town,”');
    expect(decoded).toContain('Señor García');
    expect(decoded).toContain('½');
  });

  it('handles empty input', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });
});

describe('double escaping', () => {
  it('measures how many passes a string needs', () => {
    expect(entityDepth('plain')).toBe(0);
    expect(entityDepth('&amp;')).toBe(1);
    expect(entityDepth('&amp;amp;')).toBe(2);
    expect(entityDepth('&amp;amp;nbsp;')).toBe(3);
  });

  it('decodes all the way down when asked', () => {
    expect(decodeHtmlEntitiesDeep('&amp;amp;lt;')).toBe('<');
  });

  it('stops rather than looping forever', () => {
    expect(decodeHtmlEntitiesDeep('&amp;'.repeat(3), 2)).toBeTruthy();
  });
});

describe('findEntities', () => {
  it('lists each distinct reference once, with its kind', () => {
    const hits = findEntities('&amp; &amp; &#233; &#xE9; &nbsp;');
    expect(hits.map((h) => h.reference)).toEqual(['&amp;', '&#233;', '&#xE9;', '&nbsp;']);
    expect(hits.map((h) => h.kind)).toEqual(['named', 'decimal', 'hex', 'named']);
  });

  it('records the code point', () => {
    const hits = findEntities('&nbsp;');
    expect(hits[0]!.codePoint).toBe(0x00a0);
  });

  it('flags a reference missing its semicolon', () => {
    const hits = findEntities('AT&amp T');
    expect(hits[0]!.unterminated).toBe(true);
  });

  it('ignores text that only looks like an entity', () => {
    expect(findEntities('R&D and M&A')).toEqual([]);
  });
});

describe('the named-entity table', () => {
  it('maps every name to exactly one character or cluster', () => {
    for (const [name, value] of Object.entries(NAMED_ENTITIES)) {
      expect(value.length, `${name} should not be empty`).toBeGreaterThan(0);
      expect([...value].length, `${name} should be one code point`).toBe(1);
    }
  });

  it('has the entries people actually search for', () => {
    for (const name of ['nbsp', 'amp', 'copy', 'mdash', 'hellip', 'euro', 'rsquo', 'ldquo', 'frac12', 'deg']) {
      expect(NAMED_ENTITIES[name], name).toBeDefined();
    }
  });

  it('agrees with the character the numeric reference produces', () => {
    expect(NAMED_ENTITIES.nbsp).toBe(decodeHtmlEntities('&#160;'));
    expect(NAMED_ENTITIES.euro).toBe(decodeHtmlEntities('&#8364;'));
    expect(NAMED_ENTITIES.mdash).toBe(decodeHtmlEntities('&#8212;'));
  });
});
