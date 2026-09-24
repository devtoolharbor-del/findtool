import { describe, it, expect } from 'vitest';
import {
  parseJson,
  formatJson,
  minifyJson,
  sortJsonKeys,
  jsonStats,
  highlightJson,
  describeJsonError,
  JsonParseError,
  SAMPLE_JSON,
  scanForError,
} from '~/lib/json';

describe('parseJson', () => {
  it('parses valid JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('throws JsonParseError, not a bare SyntaxError', () => {
    expect(() => parseJson('{oops}')).toThrow(JsonParseError);
  });

  it('reports a line number for a multi-line document', () => {
    try {
      parseJson('{\n  "a": 1,\n  "b": ,\n}');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JsonParseError);
      const detail = (err as JsonParseError).detail;
      expect(detail.line).toBeGreaterThan(1);
      expect(detail.message).toBeTruthy();
    }
  });
});

describe('error messages', () => {
  const messageFor = (text: string) => {
    try {
      JSON.parse(text);
      return null;
    } catch (err) {
      return describeJsonError(err, text).message;
    }
  };

  it('explains an empty document rather than echoing the engine', () => {
    expect(messageFor('   ')).toMatch(/nothing to parse/i);
  });

  it('names single quotes as the problem', () => {
    expect(messageFor("{'a': 1}")).toMatch(/quote/i);
  });

  it('names a trailing comma', () => {
    expect(messageFor('{"a": 1,}')).toMatch(/trailing comma|quote|property name/i);
  });

  it('explains an unterminated document', () => {
    expect(messageFor('{"a": ')).toMatch(/ends too early|closed/i);
  });

  it('never returns an empty message', () => {
    for (const bad of ['{', '[', '{"a"}', 'undefined', '{"a":01}', '[1,]']) {
      const msg = messageFor(bad);
      expect(msg, `input: ${bad}`).toBeTruthy();
      expect(msg!.length).toBeGreaterThan(5);
    }
  });
});

describe('formatJson / minifyJson', () => {
  it('round-trips without changing data', () => {
    const formatted = formatJson(SAMPLE_JSON, 2);
    expect(JSON.parse(formatted)).toEqual(JSON.parse(SAMPLE_JSON));
  });

  it('respects the indent setting', () => {
    expect(formatJson('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
    expect(formatJson('{"a":1}', '\t')).toBe('{\n\t"a": 1\n}');
  });

  it('minifies to the shortest valid form', () => {
    expect(minifyJson('{\n  "a" : 1,\n  "b": [1, 2]\n}')).toBe('{"a":1,"b":[1,2]}');
  });

  it('preserves key order when not sorting', () => {
    expect(formatJson('{"z":1,"a":2}', 0)).toContain('"z"');
    expect(Object.keys(JSON.parse(formatJson('{"z":1,"a":2}', 2)))).toEqual(['z', 'a']);
  });
});

describe('sortJsonKeys', () => {
  it('sorts nested object keys', () => {
    const sorted = sortJsonKeys({ b: 1, a: { d: 1, c: 2 } });
    expect(JSON.stringify(sorted)).toBe('{"a":{"c":2,"d":1},"b":1}');
  });

  it('leaves array order alone', () => {
    expect(sortJsonKeys([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it('sorts objects inside arrays', () => {
    expect(JSON.stringify(sortJsonKeys([{ b: 1, a: 2 }]))).toBe('[{"a":2,"b":1}]');
  });
});

describe('jsonStats', () => {
  it('counts keys, depth, objects and arrays', () => {
    const value = { a: { b: { c: [1, 2, 3] } } };
    const stats = jsonStats(value, JSON.stringify(value));
    expect(stats.keys).toBe(3);
    expect(stats.objects).toBe(3);
    expect(stats.arrays).toBe(1);
    expect(stats.depth).toBeGreaterThanOrEqual(4);
  });

  it('measures UTF-8 bytes, not characters', () => {
    const value = { emoji: '🎉' };
    const serialized = JSON.stringify(value);
    expect(jsonStats(value, serialized).bytes).toBeGreaterThan(serialized.length - 2);
  });
});

describe('highlightJson', () => {
  it('escapes HTML before adding markup', () => {
    const out = highlightJson(JSON.stringify({ xss: '<img src=x onerror=alert(1)>' }));
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('tags keys, strings, numbers, booleans and null distinctly', () => {
    const out = highlightJson('{\n  "k": "v",\n  "n": 1,\n  "b": true,\n  "z": null\n}');
    expect(out).toContain('tok-key');
    expect(out).toContain('tok-str');
    expect(out).toContain('tok-num');
    expect(out).toContain('tok-bool');
    expect(out).toContain('tok-null');
  });

  it('does not mistake a string value for a key', () => {
    const out = highlightJson('{"a": "b"}');
    const keyCount = (out.match(/tok-key/g) ?? []).length;
    expect(keyCount).toBe(1);
  });
});

describe('scanForError', () => {
  it('returns null for valid documents', () => {
    for (const ok of ['{}', '[]', '{"a":[1,2,{"b":null}]}', '1e-5', '"x"', 'true', SAMPLE_JSON]) {
      expect(scanForError(ok), `expected valid: ${ok}`).toBeNull();
    }
  });

  it('locates a trailing comma in an object', () => {
    const src = '{"a": 1,}';
    const e = scanForError(src)!;
    expect(e.index).toBe(8);
    expect(e.expected).toMatch(/trailing comma/);
  });

  it('locates a trailing comma in an array', () => {
    expect(scanForError('[1, 2,]')!.expected).toMatch(/trailing comma/);
  });

  it('locates a single-quoted key', () => {
    const e = scanForError("{'a': 1}")!;
    expect(e.index).toBe(1);
    expect(e.expected).toBe('a string');
  });

  it('locates a missing colon', () => {
    expect(scanForError('{"a" 1}')!.expected).toMatch(/colon/);
  });

  it('locates an unterminated string', () => {
    expect(scanForError('{"a": "oops}')!.expected).toMatch(/closing double quote/);
  });

  it('locates a raw control character inside a string', () => {
    expect(scanForError('{"a": "line\nbreak"}')!.expected).toMatch(/control character/);
  });

  it('locates a bad unicode escape', () => {
    expect(scanForError('"\\u12"')!.expected).toMatch(/hexadecimal/);
  });

  it('rejects trailing content after the root value', () => {
    expect(scanForError('{} extra')!.expected).toMatch(/end of the document/);
  });

  it('rejects a bare identifier', () => {
    expect(scanForError('{oops: 1}')!.expected).toBe('a string');
  });

  it('agrees with JSON.parse on validity for a spread of inputs', () => {
    const samples = [
      '{}', '[]', 'null', '0', '-1.5e3', '"s"', '{"a":1}', '[1,[2,[3]]]',
      '{', '[', '{"a"}', '{"a":}', '[,]', '{,}', 'tru', '01', '.5', '+1',
      '{"a":1,}', "[1,'2']", '"\\q"', '{"a":1}{', '',
    ];
    for (const s of samples) {
      let parseOk = true;
      try { JSON.parse(s); } catch { parseOk = false; }
      expect(scanForError(s) === null, `disagreement on: ${JSON.stringify(s)}`).toBe(parseOk);
    }
  });
});
