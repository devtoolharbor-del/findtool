import { describe, it, expect } from 'vitest';
import {
  textToHex,
  textToHexLatin1,
  bytesToHex,
  bytesToBinary,
  bytesToDecimal,
  bytesToOctal,
  hexDump,
  parseHex,
  parseHexDetailed,
  hexToText,
  bytesToText,
  isValidUtf8,
  analyseBytes,
  HexParseError,
  SAMPLE_HEX,
} from '~/lib/hex';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('textToHex', () => {
  it('encodes ASCII', () => {
    expect(textToHex('Hi', { separator: 'none' })).toBe('4869');
    expect(textToHex('Hi')).toBe('48 69');
  });

  it('encodes non-ASCII as UTF-8 bytes', () => {
    expect(textToHex('é', { separator: 'none' })).toBe('c3a9');
    expect(textToHex(String.fromCodePoint(0x1f6e0), { separator: 'none' })).toBe('f09f9ba0');
  });

  it('honours every separator', () => {
    expect(textToHex('abc', { separator: 'space' })).toBe('61 62 63');
    expect(textToHex('abc', { separator: 'none' })).toBe('616263');
    expect(textToHex('abc', { separator: 'comma' })).toBe('61, 62, 63');
    expect(textToHex('abc', { separator: 'dash' })).toBe('61-62-63');
    expect(textToHex('abc', { separator: 'colon' })).toBe('61:62:63');
    expect(textToHex('abc', { separator: 'newline' })).toBe('61\n62\n63');
  });

  it('honours casing and prefixes', () => {
    expect(textToHex('abc', { uppercase: true, separator: 'none' })).toBe('616263');
    expect(textToHex('Hi', { uppercase: true })).toBe('48 69');
    expect(textToHex('é', { uppercase: true, separator: 'none' })).toBe('C3A9');
    expect(textToHex('Hi', { prefix: '0x' })).toBe('0x48 0x69');
    expect(textToHex('Hi', { prefix: 'percent', separator: 'none' })).toBe('%48%69');
  });

  it('wraps at a byte count', () => {
    const output = textToHex('abcdef', { bytesPerLine: 2 });
    expect(output).toBe('61 62\n63 64\n65 66');
  });

  it('handles empty input', () => {
    expect(textToHex('')).toBe('');
  });
});

describe('textToHexLatin1', () => {
  it('uses one byte per character', () => {
    expect(textToHexLatin1('é', { separator: 'none' })).toBe('e9');
  });

  it('explains why an astral character cannot be Latin-1', () => {
    expect(() => textToHexLatin1(String.fromCodePoint(0x1f6e0))).toThrow(HexParseError);
    expect(() => textToHexLatin1('€')).toThrow(/U\+20AC/);
  });
});

describe('parseHex', () => {
  it('accepts every format people paste', () => {
    const expected = [0x48, 0x65, 0x6c];
    for (const input of [
      '48 65 6c',
      '48656c',
      '0x48, 0x65, 0x6c',
      '48:65:6C',
      '48-65-6c',
      '\\x48\\x65\\x6c',
      '%48%65%6c',
      '48\n65\n6c',
      '[0x48, 0x65, 0x6C]',
      '  48 65 6C  ',
    ]) {
      expect([...parseHex(input)], input).toEqual(expected);
    }
  });

  it('strips a leading hash from a colour', () => {
    expect([...parseHex('#ff8800')]).toEqual([255, 136, 0]);
  });

  it('reports the format it detected', () => {
    expect(parseHexDetailed('0x48 0x65').detected).toBe('0x-prefixed bytes');
    expect(parseHexDetailed('48:65:6c').detected).toMatch(/colon-separated/);
    expect(parseHexDetailed('48 65 6c').detected).toBe('space-separated');
  });

  it('explains an odd number of digits', () => {
    expect(() => parseHex('4865c')).toThrow(HexParseError);
    expect(() => parseHex('4865c')).toThrow(/odd number/);
  });

  it('explains a non-hex digit', () => {
    expect(() => parseHex('48 6g 6c')).toThrow(/not a hex digit/);
  });

  it('explains empty input without mentioning length', () => {
    expect(() => parseHex('   ')).toThrow(/nothing to convert/);
  });

  it('explains input that is all separators', () => {
    expect(() => parseHex('-- -- --')).toThrow(/no hex digits left/);
  });
});

describe('hexToText', () => {
  it('round-trips text through hex', () => {
    for (const text of ['Hello', 'café', String.fromCodePoint(0x1f6e0), 'a\nb\tc']) {
      expect(hexToText(textToHex(text))).toBe(text);
      expect(hexToText(textToHex(text, { separator: 'none', prefix: '0x' }))).toBe(text);
    }
  });

  it('decodes the shipped sample', () => {
    const decoded = hexToText(SAMPLE_HEX);
    expect(decoded).toBe('Hello, hex! é ' + String.fromCodePoint(0x1f6e0));
  });

  it('refuses bytes that are not valid UTF-8, and says what to try', () => {
    expect(() => hexToText('ff fe 00')).toThrow(/not valid UTF-8/);
    expect(hexToText('e9 61', 'latin1')).toBe('éa');
  });

  it('decodes UTF-16 in both byte orders', () => {
    // "Hi" as UTF-16: 0048 0069
    expect(bytesToText(bytes(0x48, 0x00, 0x69, 0x00), 'utf-16le')).toBe('Hi');
    expect(bytesToText(bytes(0x00, 0x48, 0x00, 0x69), 'utf-16be')).toBe('Hi');
  });

  it('handles the empty byte array', () => {
    expect(bytesToText(new Uint8Array(0))).toBe('');
  });
});

describe('alternative views', () => {
  it('renders binary, decimal and octal', () => {
    expect(bytesToBinary(bytes(0x48, 0x01))).toBe('01001000 00000001');
    expect(bytesToDecimal(bytes(0, 127, 255))).toBe('0 127 255');
    expect(bytesToOctal(bytes(8, 64))).toBe('010 100');
  });

  it('renders a hexdump with an ASCII column', () => {
    const dump = hexDump(new TextEncoder().encode('Hello, hex!'));
    expect(dump).toContain('00000000');
    expect(dump).toContain('|Hello, hex!|');
  });

  it('replaces unprintable bytes with a dot in the ASCII column', () => {
    const dump = hexDump(bytes(0x00, 0x41, 0xff));
    expect(dump).toContain('|.A.|');
  });

  it('breaks a dump into 16-byte lines', () => {
    const dump = hexDump(new Uint8Array(40));
    expect(dump.split('\n')).toHaveLength(3);
  });
});

describe('analyseBytes', () => {
  it('recognises plain ASCII', () => {
    const analysis = analyseBytes(new TextEncoder().encode('hello there'));
    expect(analysis.looksLike).toBe('plain ASCII text');
    expect(analysis.validUtf8).toBe(true);
  });

  it('recognises UTF-8 text with high bytes', () => {
    expect(analyseBytes(new TextEncoder().encode('a café in Paris today')).looksLike).toBe('UTF-8 text');
  });

  it('recognises something with many null bytes', () => {
    const utf16 = bytes(0x48, 0x00, 0x69, 0x00, 0x21, 0x00, 0x3f, 0x00);
    expect(analyseBytes(utf16).looksLike).toMatch(/UTF-16/);
  });

  it('counts bytes by class', () => {
    const analysis = analyseBytes(bytes(0x00, 0x41, 0xff, 0x20));
    expect(analysis.count).toBe(4);
    expect(analysis.nullBytes).toBe(1);
    expect(analysis.highBytes).toBe(1);
    expect(analysis.printableAscii).toBe(2);
  });

  it('handles nothing', () => {
    expect(analyseBytes(new Uint8Array(0)).looksLike).toBe('nothing');
  });
});

describe('isValidUtf8', () => {
  it('rejects a truncated sequence', () => {
    expect(isValidUtf8(bytes(0xe2, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xe2, 0x80, 0x94))).toBe(true);
  });
});

describe('bytesToHex', () => {
  it('always pads to two digits', () => {
    expect(bytesToHex(bytes(0, 1, 15, 16), { separator: 'none' })).toBe('00010f10');
    expect(bytesToHex(bytes(0, 1, 15, 16), { separator: 'space' })).toBe('00 01 0f 10');
  });

  it('round-trips every possible byte value', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    expect([...parseHex(bytesToHex(all))]).toEqual([...all]);
    expect([...parseHex(bytesToHex(all, { prefix: '0x', separator: 'comma', uppercase: true }))]).toEqual([...all]);
  });
});
