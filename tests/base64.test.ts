import { describe, it, expect } from 'vitest';
import {
  encodeBase64,
  encodeBytes,
  decodeBase64,
  decodeBase64Latin1,
  decodeBase64Lossy,
  decodeToBytes,
  validateBase64,
  normalizeBase64,
  toDataUri,
  parseDataUri,
  sniffMimeType,
  isValidUtf8,
  wrapLines,
  encodedLength,
  decodedLength,
  Base64Error,
  SAMPLE_BASE64,
  MIME_LINE_LENGTH,
} from '~/lib/base64';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('encodeBase64', () => {
  it('matches the RFC 4648 §10 test vectors', () => {
    expect(encodeBase64('')).toBe('');
    expect(encodeBase64('f')).toBe('Zg==');
    expect(encodeBase64('fo')).toBe('Zm8=');
    expect(encodeBase64('foo')).toBe('Zm9v');
    expect(encodeBase64('foob')).toBe('Zm9vYg==');
    expect(encodeBase64('fooba')).toBe('Zm9vYmE=');
    expect(encodeBase64('foobar')).toBe('Zm9vYmFy');
  });

  it('encodes non-ASCII as UTF-8, where naive btoa would throw', () => {
    // "é" is two UTF-8 bytes (C3 A9), not one Latin-1 byte.
    expect(encodeBase64('é')).toBe('w6k=');
    expect(encodeBase64('café')).toBe('Y2Fmw6k=');
  });

  it('encodes astral characters (emoji) correctly', () => {
    const hammer = String.fromCodePoint(0x1f6e0);
    expect(encodeBase64(hammer)).toBe('8J+boA==');
    expect(decodeBase64(encodeBase64(hammer))).toBe(hammer);
  });

  it('supports the URL-safe alphabet from RFC 4648 §5', () => {
    const input = bytes(0xfb, 0xff, 0xbf);
    expect(encodeBytes(input)).toBe('+/+/');
    expect(encodeBytes(input, { urlSafe: true })).toBe('-_-_');
  });

  it('can omit padding', () => {
    expect(encodeBase64('f', { padding: false })).toBe('Zg');
    expect(encodeBase64('fo', { padding: false })).toBe('Zm8');
    expect(encodeBase64('foo', { padding: false })).toBe('Zm9v');
  });

  it('wraps at the MIME line length', () => {
    const encoded = encodeBase64('a'.repeat(200), { wrap: MIME_LINE_LENGTH });
    const lines = encoded.split('\n');
    expect(lines.every((l) => l.length <= MIME_LINE_LENGTH)).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
    // Wrapping must be cosmetic only.
    expect(decodeBase64(encoded)).toBe('a'.repeat(200));
  });

  it('round-trips arbitrary byte values', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    expect([...decodeToBytes(encodeBytes(all))]).toEqual([...all]);
  });
});

describe('decodeBase64', () => {
  it('decodes the shipped sample, emoji intact', () => {
    const decoded = decodeBase64(SAMPLE_BASE64);
    expect(decoded).toContain('ByteCabin');
    expect(decoded).toContain(String.fromCodePoint(0x1f6e0));
  });

  it('accepts URL-safe input without being told', () => {
    expect(decodeBase64('aGVsbG8-d29ybGQ_')).toBe(decodeBase64('aGVsbG8+d29ybGQ/'));
  });

  it('accepts unpadded input', () => {
    expect(decodeBase64('Zm9vYmE')).toBe('fooba');
  });

  it('ignores whitespace and line breaks', () => {
    expect(decodeBase64('Zm9v\n  YmFy\t')).toBe('foobar');
  });

  it('strips a data URI prefix', () => {
    expect(normalizeBase64('data:text/plain;base64,Zm9vYmFy')).toBe('Zm9vYmFy');
    expect(decodeBase64('data:text/plain;base64,Zm9vYmFy')).toBe('foobar');
  });

  it('refuses binary data rather than showing mojibake', () => {
    // 0xFF 0xFE is not valid UTF-8.
    const encoded = encodeBytes(bytes(0xff, 0xfe, 0x00, 0x01));
    expect(() => decodeBase64(encoded)).toThrow(Base64Error);
    expect(() => decodeBase64(encoded)).toThrow(/not valid UTF-8/);
  });

  it('offers a lossy and a Latin-1 view of the same bytes', () => {
    const encoded = encodeBytes(bytes(0xe9, 0x61));
    expect(decodeBase64Latin1(encoded)).toBe('éa');
    expect(decodeBase64Lossy(encoded)).toContain('�');
  });
});

describe('validateBase64', () => {
  it('accepts valid input', () => {
    expect(validateBase64('Zm9vYmFy').valid).toBe(true);
    expect(validateBase64('Zm9vYmE=').valid).toBe(true);
    expect(validateBase64('Zg==').valid).toBe(true);
  });

  it('explains an illegal character and where it is', () => {
    const result = validateBase64('Zm9v!mFy');
    expect(result.valid).toBe(false);
    expect(result.position).toBe(4);
    expect(result.reason).toMatch(/not a Base64 character/);
  });

  it('explains padding found in the middle', () => {
    const result = validateBase64('Zm9v=YmFy');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/middle of the data/);
  });

  it('explains a length that no byte sequence can produce', () => {
    const result = validateBase64('Zm9vY');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/remainder of 1/);
  });

  it('rejects a string mixing both alphabets', () => {
    const result = validateBase64('ab-d+fgh');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/both Base64 alphabets/);
  });

  it('treats empty input as "nothing to do", not an error about length', () => {
    expect(validateBase64('   ').reason).toMatch(/nothing to decode/);
  });

  it('reports which alphabet was used', () => {
    expect(validateBase64('aGVsbG8-d29ybGQ_').urlSafe).toBe(true);
    expect(validateBase64('aGVsbG8+d29ybGQ/').urlSafe).toBe(false);
  });

  it('rejects more than two padding characters', () => {
    expect(validateBase64('Zg===').reason).toMatch(/never more than two/);
  });
});

describe('data URIs', () => {
  it('builds one', () => {
    expect(toDataUri('image/png', 'iVBOR')).toBe('data:image/png;base64,iVBOR');
    expect(toDataUri('', 'AAA')).toBe('data:application/octet-stream;base64,AAA');
  });

  it('parses one, including extra parameters', () => {
    const parsed = parseDataUri('data:text/html;charset=utf-8;base64,PGI+');
    expect(parsed?.mime).toBe('text/html');
    expect(parsed?.base64).toBe(true);
    expect(parsed?.params).toBe(';charset=utf-8');
    expect(parsed?.data).toBe('PGI+');
  });

  it('recognises a non-base64 data URI', () => {
    const parsed = parseDataUri('data:text/plain,hello');
    expect(parsed?.base64).toBe(false);
    expect(parsed?.data).toBe('hello');
  });

  it('returns null for anything else', () => {
    expect(parseDataUri('https://example.com/x.png')).toBeNull();
  });
});

describe('sniffMimeType', () => {
  it('recognises a PNG header', () => {
    expect(sniffMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)).mime).toBe('image/png');
  });

  it('recognises a JPEG header', () => {
    expect(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0)).extension).toBe('jpg');
  });

  it('recognises a PDF and a ZIP', () => {
    expect(sniffMimeType(new TextEncoder().encode('%PDF-1.7')).mime).toBe('application/pdf');
    expect(sniffMimeType(bytes(0x50, 0x4b, 0x03, 0x04)).extension).toBe('zip');
  });

  it('falls back to text when the bytes are readable', () => {
    expect(sniffMimeType(new TextEncoder().encode('hello there')).mime).toBe('text/plain');
    expect(sniffMimeType(new TextEncoder().encode('{"a":1}')).mime).toBe('application/json');
  });

  it('falls back to octet-stream for unrecognised binary', () => {
    expect(sniffMimeType(bytes(0xde, 0xad, 0xbe, 0xef)).mime).toBe('application/octet-stream');
  });
});

describe('size helpers', () => {
  it('predicts the encoded length', () => {
    expect(encodedLength(3)).toBe(4);
    expect(encodedLength(4)).toBe(8);
    expect(encodedLength(4, false)).toBe(6);
    expect(encodeBase64('foob').length).toBe(encodedLength(4));
  });

  it('predicts the decoded length', () => {
    expect(decodedLength('Zm9vYmFy')).toBe(6);
    expect(decodedLength('Zg==')).toBe(1);
    expect(decodedLength('Zm8=')).toBe(2);
  });

  it('wraps without changing content', () => {
    expect(wrapLines('abcdef', 2)).toBe('ab\ncd\nef');
    expect(wrapLines('abcdef', 0)).toBe('abcdef');
  });
});

describe('isValidUtf8', () => {
  it('accepts well-formed multi-byte sequences', () => {
    expect(isValidUtf8(new TextEncoder().encode('café 🛠'))).toBe(true);
  });

  it('rejects a truncated multi-byte sequence', () => {
    expect(isValidUtf8(bytes(0xc3))).toBe(false);
    expect(isValidUtf8(bytes(0xf0, 0x9f))).toBe(false);
  });
});
