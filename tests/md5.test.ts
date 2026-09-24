import { describe, it, expect } from 'vitest';
import { md5, md5Text, md5Buffer, md5Hex } from '~/lib/md5';

/**
 * The seven vectors in RFC 1321, appendix A.5 ("MD5 test suite"). They cover
 * the empty input, sub-block inputs, an input that crosses the 56-byte padding
 * boundary and one that spans two 64-byte blocks.
 */
const RFC_1321 = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    'd174ab98d277d9f5a5611c2c9f419d9f',
  ],
  [
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
    '57edf4a22be3c955ac49da2e2107b67a',
  ],
] as const;

describe('md5 — RFC 1321 test suite', () => {
  for (const [input, expected] of RFC_1321) {
    it(`hashes ${JSON.stringify(input.slice(0, 24))}${input.length > 24 ? '…' : ''}`, () => {
      expect(md5Hex(input)).toBe(expected);
    });
  }
});

describe('md5 — padding boundaries', () => {
  /**
   * The padding rule is "append 0x80, pad with zeros until the length is
   * 56 mod 64, then eight length bytes". Lengths of 55 to 57 and 63 to 65 are
   * exactly where a wrong implementation stops agreeing with a correct one:
   * at 56 bytes the length field no longer fits and a second block appears
   * that consists of nothing but padding.
   *
   * Each expected value below is the digest of `'a'.repeat(n)` as produced by
   * an independent implementation (OpenSSL via Node's `crypto`).
   */
  const CASES: Array<[number, string]> = [
    [55, 'ef1772b6dff9a122358552954ad0df65'],
    [56, '3b0c8ac703f828b04c6c197006d17218'],
    [57, '652b906d60af96844ebd21b674f35e93'],
    [63, 'b06521f39153d618550606be297466d5'],
    [64, '014842d480b571495a4a0363793f7367'],
    [65, 'c743a45e0d2e6a95cb859adae0248435'],
    [119, '8a7bd0732ed6a28ce75f6dabc90e1613'],
    [120, '5f61c0ccad4cac44c75ff505e1f1e537'],
    [128, 'e510683b3f5ffe4093d021808bc6ff70'],
    [1000, 'cabe45dcc9ae5b66ba86600cca6b8ba8'],
  ];

  for (const [n, expected] of CASES) {
    it(`hashes ${n} bytes across the padding boundary`, () => {
      expect(md5Hex('a'.repeat(n))).toBe(expected);
    });
  }

  it('changes completely when a single byte changes', () => {
    const a = md5Hex('a'.repeat(64));
    const b = md5Hex('b' + 'a'.repeat(63));
    expect(a).not.toBe(b);
    // Avalanche: roughly half the bits should differ. Well over a quarter is
    // a safe assertion that catches an implementation that barely mixes.
    const differing = [...a].filter((ch, i) => ch !== b[i]).length;
    expect(differing).toBeGreaterThan(20);
  });
});

describe('md5 — byte-oriented API', () => {
  it('returns 16 raw bytes', () => {
    const digest = md5(new Uint8Array(0));
    expect(digest).toBeInstanceOf(Uint8Array);
    expect(digest).toHaveLength(16);
    expect(Array.from(digest.slice(0, 4))).toEqual([0xd4, 0x1d, 0x8c, 0xd9]);
  });

  it('hashes arbitrary binary, not just text', () => {
    // A byte sequence that is not valid UTF-8, so it can only arrive as bytes.
    const binary = new Uint8Array([0x00, 0xff, 0xfe, 0x80, 0x7f, 0x01]);
    expect(md5Hex(binary)).toMatch(/^[0-9a-f]{32}$/);
    // Every byte matters: flipping one bit changes the digest.
    const flipped = new Uint8Array(binary);
    flipped[0] = 0x01;
    expect(md5Hex(flipped)).not.toBe(md5Hex(binary));
  });

  it('hashes an ArrayBuffer, which is what a file read gives you', () => {
    const buffer = new TextEncoder().encode('abc').buffer as ArrayBuffer;
    expect(md5Hex(md5Buffer(buffer))).not.toBe('');
    expect(Array.from(md5Buffer(buffer))).toEqual(Array.from(md5Text('abc')));
  });

  it('treats input as UTF-8 bytes, so multi-byte characters count as their encoding', () => {
    // "é" is two bytes in UTF-8, so this must not equal the digest of a
    // one-byte latin-1 interpretation.
    expect(md5Hex('é')).toBe(md5Hex(new Uint8Array([0xc3, 0xa9])));
    expect(md5Hex('é')).not.toBe(md5Hex(new Uint8Array([0xe9])));
  });

  it('is deterministic across repeated calls', () => {
    const input = new TextEncoder().encode('ByteCabin');
    expect(md5Hex(input)).toBe(md5Hex(input));
  });
});

describe('md5 — the well-known collision', () => {
  /**
   * Wang & Yu's 2004 collision pair: two different 128-byte blocks with the
   * same MD5. It is in the test suite deliberately — it is the reason the MD5
   * tool page says MD5 detects accidental corruption and nothing else.
   */
  const hex = (s: string) => {
    const clean = s.replace(/\s+/g, '');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
  };

  const blockA = hex(`
    d131dd02c5e6eec4693d9a0698aff95c 2fcab58712467eab4004583eb8fb7f89
    55ad340609f4b30283e488832571415a 085125e8f7cdc99fd91dbdf280373c5b
    d8823e3156348f5bae6dacd436c919c6 dd53e2b487da03fd02396306d248cda0
    e99f33420f577ee8ce54b67080a80d1e c69821bcb6a8839396f9652b6ff72a70`);

  const blockB = hex(`
    d131dd02c5e6eec4693d9a0698aff95c 2fcab50712467eab4004583eb8fb7f89
    55ad340609f4b30283e4888325f1415a 085125e8f7cdc99fd91dbd7280373c5b
    d8823e3156348f5bae6dacd436c919c6 dd53e23487da03fd02396306d248cda0
    e99f33420f577ee8ce54b67080280d1e c69821bcb6a8839396f965ab6ff72a70`);

  it('gives the same digest for two different inputs', () => {
    expect(Array.from(blockA)).not.toEqual(Array.from(blockB));
    expect(md5Hex(blockA)).toBe(md5Hex(blockB));
    expect(md5Hex(blockA)).toBe('79054025255fb1a26e4bc422aef54eb4');
  });
});
