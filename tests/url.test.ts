import { describe, it, expect } from 'vitest';
import {
  encodeUrl,
  encodeWithReport,
  decodeUrl,
  decodeUrlLatin1,
  decodeUrlDeep,
  encodingDepth,
  parseQueryString,
  buildQueryString,
  splitUrl,
  classifyValue,
  UrlDecodeError,
  SAMPLE_ENCODED,
} from '~/lib/url';

describe('encodeUrl', () => {
  it('escapes a space, an ampersand and a slash in component mode', () => {
    expect(encodeUrl('a b&c/d')).toBe('a%20b%26c%2Fd');
  });

  it('preserves URL structure in uri mode', () => {
    const url = 'https://example.com/a path?x=1&y=2#top';
    expect(encodeUrl(url, 'uri')).toBe('https://example.com/a%20path?x=1&y=2#top');
    // The same string in component mode escapes everything structural.
    expect(encodeUrl(url, 'component')).toContain('%3A%2F%2F');
  });

  it('uses + for space in form mode', () => {
    expect(encodeUrl('hello world', 'form')).toBe('hello+world');
    expect(encodeUrl('a+b', 'form')).toBe('a%2Bb');
  });

  it('escapes the sub-delimiters encodeURIComponent leaves alone in rfc3986 mode', () => {
    expect(encodeUrl("!'()*")).toBe("!'()*");
    expect(encodeUrl("!'()*", 'rfc3986')).toBe('%21%27%28%29%2A');
  });

  it('encodes non-ASCII as UTF-8, not Latin-1', () => {
    expect(encodeUrl('é')).toBe('%C3%A9');
    expect(encodeUrl(String.fromCodePoint(0x1f6e0))).toBe('%F0%9F%9B%A0');
  });

  it('round-trips through decodeUrl', () => {
    const original = 'naïve? 100% — yes/no & "quotes" 🛠';
    expect(decodeUrl(encodeUrl(original))).toBe(original);
    expect(decodeUrl(encodeUrl(original, 'form'), { plusAsSpace: true })).toBe(original);
    expect(decodeUrl(encodeUrl(original, 'rfc3986'))).toBe(original);
  });
});

describe('encodeWithReport', () => {
  it('lists only the characters that actually changed', () => {
    const report = encodeWithReport('a b&b');
    const chars = report.changed.map((c) => c.char).sort();
    expect(chars).toEqual([' ', '&']);
    expect(report.changed.find((c) => c.char === '&')?.escaped).toBe('%26');
  });

  it('counts repeats', () => {
    const report = encodeWithReport('a b c');
    expect(report.changed[0]?.count).toBe(2);
  });

  it('reports growth as a percentage', () => {
    expect(encodeWithReport('abc').growth).toBe(0);
    expect(encodeWithReport('').growth).toBe(0);
    expect(encodeWithReport(' ').growth).toBe(200);
  });
});

describe('decodeUrl', () => {
  it('reassembles multi-byte characters across several escapes', () => {
    expect(decodeUrl('%F0%9F%9B%A0')).toBe(String.fromCodePoint(0x1f6e0));
    expect(decodeUrl('caf%C3%A9')).toBe('café');
  });

  it('leaves + alone unless asked to treat it as a space', () => {
    expect(decodeUrl('a+b')).toBe('a+b');
    expect(decodeUrl('a+b', { plusAsSpace: true })).toBe('a b');
  });

  it('explains a truncated escape at the end of the string', () => {
    expect(() => decodeUrl('abc%4')).toThrow(UrlDecodeError);
    expect(() => decodeUrl('abc%4')).toThrow(/two hex digits/);
  });

  it('explains a bare percent sign', () => {
    try {
      decodeUrl('100% sure');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UrlDecodeError);
      expect((err as UrlDecodeError).position).toBe(3);
      expect((err as Error).message).toMatch(/%25/);
    }
  });

  it('explains Latin-1 escapes produced by the legacy escape()', () => {
    expect(() => decodeUrl('caf%E9')).toThrow(/not valid UTF-8/);
    expect(decodeUrlLatin1('caf%E9')).toBe('café');
  });

  it('leaves broken escapes in place in lenient mode', () => {
    expect(decodeUrl('100% sure', { lenient: true })).toBe('100% sure');
    expect(decodeUrl('a%C3%A9b', { lenient: true })).toBe('aéb');
  });

  it('handles empty input', () => {
    expect(decodeUrl('')).toBe('');
  });
});

describe('decodeUrlDeep', () => {
  it('unwraps a double-encoded value', () => {
    const once = encodeUrl('https://example.com/next?id=42');
    const twice = encodeUrl(once);
    const result = decodeUrlDeep(twice);
    expect(result.value).toBe('https://example.com/next?id=42');
    expect(result.passes).toBe(2);
  });

  it('stops when the string stops changing', () => {
    expect(decodeUrlDeep('plain text').passes).toBe(0);
    expect(decodeUrlDeep('plain text').value).toBe('plain text');
  });

  it('reports the encoding depth', () => {
    expect(encodingDepth('%253A')).toBe(2);
    expect(encodingDepth('%3A')).toBe(1);
    expect(encodingDepth(':')).toBe(0);
  });

  it('keeps every intermediate step', () => {
    const result = decodeUrlDeep(encodeUrl(encodeUrl('a b')));
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]).toBe('a b');
  });
});

describe('parseQueryString', () => {
  it('preserves order and duplicates', () => {
    const params = parseQueryString('?tag=a&tag=b&z=1&a=2');
    expect(params.map((p) => `${p.key}=${p.value}`)).toEqual(['tag=a', 'tag=b', 'z=1', 'a=2']);
  });

  it('accepts a whole URL', () => {
    const params = parseQueryString('https://example.com/search?q=hello+world&page=2');
    expect(params).toHaveLength(2);
    expect(params[0]!.value).toBe('hello world');
  });

  it('drops the fragment', () => {
    expect(parseQueryString('?a=1#section')).toHaveLength(1);
    expect(parseQueryString('?a=1#section')[0]!.value).toBe('1');
  });

  it('distinguishes a valueless flag from an empty value', () => {
    const params = parseQueryString('?flag&empty=');
    expect(params[0]!.valueless).toBe(true);
    expect(params[1]!.valueless).toBe(false);
    expect(params[1]!.value).toBe('');
  });

  it('decodes both key and value', () => {
    const params = parseQueryString('?user%20name=Ren%C3%A9e');
    expect(params[0]!.key).toBe('user name');
    expect(params[0]!.value).toBe('Renée');
  });

  it('records a per-parameter error instead of failing the whole parse', () => {
    const params = parseQueryString('?good=1&bad=%ZZ');
    expect(params).toHaveLength(2);
    expect(params[0]!.error).toBeUndefined();
    expect(params[1]!.error).toBeTruthy();
    expect(params[1]!.value).toBe('%ZZ');
  });

  it('returns an empty array for nothing', () => {
    expect(parseQueryString('')).toEqual([]);
    expect(parseQueryString('?')).toEqual([]);
  });

  it('parses the shipped sample', () => {
    const params = parseQueryString(SAMPLE_ENCODED);
    expect(params.map((p) => p.key)).toEqual(['q', 'redirect', 'note', 'tag', 'tag']);
    expect(params[1]!.value).toBe('https://example.com/next?id=42');
    expect(params[2]!.value).toBe('100% "worth it"');
  });
});

describe('buildQueryString', () => {
  it('round-trips through parseQueryString', () => {
    const original = [
      { key: 'q', value: 'a b & c' },
      { key: 'tag', value: 'x' },
      { key: 'tag', value: 'y' },
    ];
    const built = buildQueryString(original);
    expect(parseQueryString(built).map((p) => ({ key: p.key, value: p.value }))).toEqual(original);
  });

  it('keeps a valueless flag valueless', () => {
    expect(buildQueryString([{ key: 'debug', value: '', valueless: true }])).toBe('debug');
  });
});

describe('splitUrl', () => {
  it('splits a full URL', () => {
    const parts = splitUrl('https://user@example.com:8443/a/b?x=1#frag');
    expect(parts.scheme).toBe('https');
    expect(parts.authority).toBe('user@example.com:8443');
    expect(parts.path).toBe('/a/b');
    expect(parts.query).toBe('x=1');
    expect(parts.fragment).toBe('frag');
    expect(parts.params).toHaveLength(1);
  });

  it('handles a relative reference', () => {
    const parts = splitUrl('/search?q=1');
    expect(parts.scheme).toBeUndefined();
    expect(parts.path).toBe('/search');
  });
});

describe('classifyValue', () => {
  it('spots the things worth decoding twice', () => {
    expect(classifyValue('https://example.com/a')).toBe('url');
    expect(classifyValue('{"a":1}')).toBe('json');
    expect(classifyValue('eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.abc')).toBe('jwt');
    expect(classifyValue('Zm9vYmFyYmF6')).toBe('base64');
    expect(classifyValue('hello')).toBe('text');
  });
});
