import { describe, it, expect } from 'vitest';
import {
  hashText,
  hashBytes,
  hmacBytes,
  hmacText,
  toHex,
  toBase64,
  fromHex,
  fromBase64,
  formatDigest,
  timingSafeEqual,
  timingSafeEqualStrings,
  extractChecksum,
  compareChecksum,
  decodeKey,
  parseStripeSignatureHeader,
  utf8,
  DIGEST_BYTES,
} from '~/lib/hash';

const bytes = (hex: string): Uint8Array => fromHex(hex)!;

// ─── Digests ──────────────────────────────────────────────────────────────

describe('hashText — published NIST vectors', () => {
  it('SHA-256 of "abc"', async () => {
    expect(toHex(await hashText('abc', 'SHA-256'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('SHA-256 of the empty string', async () => {
    expect(toHex(await hashText('', 'SHA-256'))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('SHA-256 of the 448-bit two-block message', async () => {
    expect(
      toHex(await hashText('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'SHA-256')),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('SHA-1 of "abc"', async () => {
    expect(toHex(await hashText('abc', 'SHA-1'))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    );
  });

  it('SHA-384 of "abc"', async () => {
    expect(toHex(await hashText('abc', 'SHA-384'))).toBe(
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed' +
        '8086072ba1e7cc2358baeca134c825a7',
    );
  });

  it('SHA-512 of "abc"', async () => {
    expect(toHex(await hashText('abc', 'SHA-512'))).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
        '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });

  it('produces a digest of the documented length for every algorithm', async () => {
    for (const algo of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const) {
      expect(await hashText('x', algo)).toHaveLength(DIGEST_BYTES[algo]);
    }
  });
});

describe('hashBytes — the file path', () => {
  it('hashes an ArrayBuffer identically to the equivalent text', async () => {
    const buffer = utf8('abc').buffer as ArrayBuffer;
    const fromBuffer = await hashBytes(buffer, 'SHA-256');
    const fromString = await hashText('abc', 'SHA-256');
    expect(toHex(fromBuffer)).toBe(toHex(fromString));
  });

  it('hashes bytes that are not valid UTF-8', async () => {
    const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
    expect(toHex(await hashBytes(binary, 'SHA-256'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('treats text as its UTF-8 encoding', async () => {
    const direct = await hashText('café', 'SHA-256');
    const viaBytes = await hashBytes(
      new Uint8Array([0x63, 0x61, 0x66, 0xc3, 0xa9]),
      'SHA-256',
    );
    expect(toHex(direct)).toBe(toHex(viaBytes));
  });
});

// ─── Encoding ─────────────────────────────────────────────────────────────

describe('hex and Base64 encoding', () => {
  it('encodes hex with leading zeros preserved', () => {
    expect(toHex(new Uint8Array([0x00, 0x0f, 0xff]))).toBe('000fff');
  });

  it('uppercases hex on request', () => {
    expect(toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]), true)).toBe('DEADBEEF');
  });

  it('matches a known Base64 digest', async () => {
    const digest = await hashText('abc', 'SHA-256');
    expect(toBase64(digest)).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  });

  it('pads Base64 correctly for every remainder', () => {
    expect(toBase64(new Uint8Array([0x66]))).toBe('Zg==');
    expect(toBase64(new Uint8Array([0x66, 0x6f]))).toBe('Zm8=');
    expect(toBase64(new Uint8Array([0x66, 0x6f, 0x6f]))).toBe('Zm9v');
    expect(toBase64(new Uint8Array(0))).toBe('');
  });

  it('round-trips arbitrary bytes through Base64', () => {
    const original = new Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 37) & 0xff));
    expect(Array.from(fromBase64(toBase64(original))!)).toEqual(Array.from(original));
  });

  it('round-trips arbitrary bytes through hex', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    expect(Array.from(fromHex(toHex(original))!)).toEqual(Array.from(original));
  });

  it('rejects malformed hex rather than guessing', () => {
    expect(fromHex('abc')).toBeNull(); // odd length
    expect(fromHex('zz')).toBeNull(); // not hex
    expect(fromHex('')).toBeNull();
    expect(fromHex('de ad be ef')).not.toBeNull(); // whitespace is fine
  });

  it('rejects malformed Base64 and accepts the URL-safe alphabet', () => {
    expect(fromBase64('!!!!')).toBeNull();
    expect(fromBase64('A')).toBeNull(); // impossible length
    expect(Array.from(fromBase64('Zm9v')!)).toEqual([0x66, 0x6f, 0x6f]);
    expect(Array.from(fromBase64('-_8')!)).toEqual(Array.from(fromBase64('+/8')!));
  });

  it('leaves Base64 alone when asked to uppercase, since case is significant', async () => {
    const digest = await hashText('abc', 'SHA-256');
    expect(formatDigest(digest, 'base64', true)).toBe(formatDigest(digest, 'base64', false));
    expect(formatDigest(digest, 'hex', true)).toBe(formatDigest(digest, 'hex', false).toUpperCase());
  });
});

// ─── Comparison ───────────────────────────────────────────────────────────

describe('timingSafeEqual', () => {
  it('reports equal and unequal byte strings correctly', () => {
    expect(timingSafeEqual(bytes('deadbeef'), bytes('deadbeef'))).toBe(true);
    expect(timingSafeEqual(bytes('deadbeef'), bytes('deadbeee'))).toBe(false);
    expect(timingSafeEqual(bytes('deadbeef'), bytes('dead'))).toBe(false);
    expect(timingSafeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });

  it('compares strings the same way', () => {
    expect(timingSafeEqualStrings('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqualStrings('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false);
  });
});

describe('extractChecksum', () => {
  const digest = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  it('accepts a bare hash', () => {
    expect(extractChecksum(`  ${digest}\n`)).toBe(digest);
  });

  it('accepts sha256sum output with a filename', () => {
    expect(extractChecksum(`${digest}  ubuntu-24.04.iso`)).toBe(digest);
  });

  it('accepts binary-mode output with the asterisk marker', () => {
    expect(extractChecksum(`${digest} *ubuntu-24.04.iso`)).toBe(digest);
  });

  it('accepts the BSD tag form', () => {
    expect(extractChecksum(`SHA256 (ubuntu-24.04.iso) = ${digest}`)).toBe(digest);
  });

  it('accepts an algorithm prefix, as used by container digests', () => {
    expect(extractChecksum(`sha256:${digest}`)).toBe(digest);
  });

  it('returns an empty string for empty input', () => {
    expect(extractChecksum('   \n ')).toBe('');
  });
});

describe('compareChecksum', () => {
  const digest = bytes('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  it('reports a match for the same hex value in either case', () => {
    expect(compareChecksum(toHex(digest), digest, 'SHA-256').status).toBe('match');
    expect(compareChecksum(toHex(digest).toUpperCase(), digest, 'SHA-256').status).toBe('match');
  });

  it('reports a match when the file name is attached', () => {
    const result = compareChecksum(`${toHex(digest)}  release.tar.gz`, digest, 'SHA-256');
    expect(result.status).toBe('match');
    expect(result.encoding).toBe('hex');
    expect(result.message).toContain('Match');
  });

  it('reports a match for a Base64 checksum', () => {
    const result = compareChecksum(toBase64(digest), digest, 'SHA-256');
    expect(result.status).toBe('match');
    expect(result.encoding).toBe('base64');
  });

  it('reports a mismatch unambiguously when one character differs', () => {
    const wrong = 'ca7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    const result = compareChecksum(wrong, digest, 'SHA-256');
    expect(result.status).toBe('mismatch');
    expect(result.message).toContain('No match');
  });

  it('names the likely algorithm when the pasted hash is the wrong length', () => {
    const md5Value = 'd41d8cd98f00b204e9800998ecf8427e';
    const result = compareChecksum(md5Value, digest, 'SHA-256');
    expect(result.status).toBe('mismatch');
    expect(result.message).toContain('MD5');
  });

  it('flags empty input as empty rather than as a failure', () => {
    expect(compareChecksum('  ', digest, 'SHA-256').status).toBe('empty');
  });

  it('flags text that is not a hash at all', () => {
    const result = compareChecksum('not a hash!!', digest, 'SHA-256');
    expect(result.status).toBe('unreadable');
    expect(result.message).toContain('64 hex characters');
  });
});

// ─── HMAC ─────────────────────────────────────────────────────────────────

describe('hmac — RFC 4231 test vectors', () => {
  it('case 1: HMAC-SHA-256 with a 20-byte key', async () => {
    const key = new Uint8Array(20).fill(0x0b);
    const mac = await hmacBytes(key, utf8('Hi There'), 'SHA-256');
    expect(toHex(mac)).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('case 1: HMAC-SHA-384', async () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(toHex(await hmacBytes(key, utf8('Hi There'), 'SHA-384'))).toBe(
      'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59c' +
        'faea9ea9076ede7f4af152e8b2fa9cb6',
    );
  });

  it('case 1: HMAC-SHA-512', async () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(toHex(await hmacBytes(key, utf8('Hi There'), 'SHA-512'))).toBe(
      '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde' +
        'daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
    );
  });

  it('case 2: a short ASCII key, the shape a webhook secret actually has', async () => {
    expect(toHex(await hmacText('Jefe', 'what do ya want for nothing?', 'SHA-256'))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
    expect(toHex(await hmacText('Jefe', 'what do ya want for nothing?', 'SHA-512'))).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea250554' +
        '9758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    );
  });

  it('case 3: 50 bytes of 0xdd', async () => {
    const key = new Uint8Array(20).fill(0xaa);
    const message = new Uint8Array(50).fill(0xdd);
    expect(toHex(await hmacBytes(key, message, 'SHA-256'))).toBe(
      '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe',
    );
  });

  it('case 4: a 25-byte hex key', async () => {
    const key = bytes('0102030405060708090a0b0c0d0e0f10111213141516171819');
    const message = new Uint8Array(50).fill(0xcd);
    expect(toHex(await hmacBytes(key, message, 'SHA-256'))).toBe(
      '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b',
    );
  });

  it('case 6: a key longer than the 64-byte block size is hashed first', async () => {
    const key = new Uint8Array(131).fill(0xaa);
    const message = 'Test Using Larger Than Block-Size Key - Hash Key First';
    expect(toHex(await hmacBytes(key, utf8(message), 'SHA-256'))).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
    );
  });
});

describe('hmac — RFC 2202 SHA-1 vectors', () => {
  it('case 1', async () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(toHex(await hmacBytes(key, utf8('Hi There'), 'SHA-1'))).toBe(
      'b617318655057264e28bc0b6fb378c8ef146be00',
    );
  });

  it('case 2', async () => {
    expect(toHex(await hmacText('Jefe', 'what do ya want for nothing?', 'SHA-1'))).toBe(
      'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79',
    );
  });
});

describe('hmac — behaviour', () => {
  it('refuses an empty key with an explanation', async () => {
    await expect(hmacBytes(new Uint8Array(0), utf8('x'), 'SHA-256')).rejects.toThrow(
      /needs a secret key/i,
    );
  });

  it('produces a different signature for a different key', async () => {
    const a = await hmacText('secret-a', 'payload', 'SHA-256');
    const b = await hmacText('secret-b', 'payload', 'SHA-256');
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it('is sensitive to a single byte of the message', async () => {
    const a = await hmacText('k', '{"id":1}', 'SHA-256');
    const b = await hmacText('k', '{"id":2}', 'SHA-256');
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it('verifies through compareChecksum, which is how the verify mode works', async () => {
    const mac = await hmacText('whsec_test', '1737039600.{"ok":true}', 'SHA-256');
    expect(compareChecksum(toHex(mac), mac, 'SHA-256').status).toBe('match');
    expect(compareChecksum(toBase64(mac), mac, 'SHA-256').status).toBe('match');
    expect(compareChecksum(toHex(mac).replace(/.$/, '0'), mac, 'SHA-256').status).not.toBe(
      'match',
    );
  });
});

describe('decodeKey', () => {
  it('reads a UTF-8 key', () => {
    expect(Array.from(decodeKey('abc', 'utf8'))).toEqual([0x61, 0x62, 0x63]);
  });

  it('reads a hex key', () => {
    expect(Array.from(decodeKey('0a0b', 'hex'))).toEqual([0x0a, 0x0b]);
  });

  it('reads a Base64 key', () => {
    expect(Array.from(decodeKey('Zm9v', 'base64'))).toEqual([0x66, 0x6f, 0x6f]);
  });

  it('refuses a malformed hex key rather than silently hashing the text', () => {
    expect(() => decodeKey('nothex', 'hex')).toThrow(/valid hex/i);
    expect(() => decodeKey('!!!', 'base64')).toThrow(/Base64/i);
  });
});

describe('parseStripeSignatureHeader', () => {
  it('splits the timestamp from the v1 signature', () => {
    const header =
      't=1737039600,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd';
    const parsed = parseStripeSignatureHeader(header);
    expect(parsed.timestamp).toBe('1737039600');
    expect(parsed.signatures).toEqual([
      '5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd',
    ]);
  });

  it('returns every v1 signature during a secret rotation', () => {
    const parsed = parseStripeSignatureHeader('t=1,v1=aaaa,v0=bbbb,v1=cccc');
    expect(parsed.signatures).toEqual(['aaaa', 'cccc']);
  });

  it('copes with a header that is not in that format', () => {
    const parsed = parseStripeSignatureHeader('sha256=abcdef');
    expect(parsed.timestamp).toBeNull();
    expect(parsed.signatures).toEqual([]);
  });
});
