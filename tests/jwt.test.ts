import { describe, it, expect } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  base64UrlToText,
  splitToken,
  decodeJwt,
  describeClaims,
  expiryStatus,
  formatRelative,
  formatAbsolute,
  pemToArrayBuffer,
  detectKeyKind,
  verifySignature,
  signToken,
  JwtError,
  SAMPLE_JWT,
  SAMPLE_SECRET,
  SUPPORTED_ALGORITHMS,
} from '~/lib/jwt';

const subtle = globalThis.crypto.subtle;

const b64url = (obj: unknown) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));

/** Build an unsigned token shell with the given header and payload. */
const shell = (header: object, payload: object, signature = 'c2ln') =>
  `${b64url(header)}.${b64url(payload)}.${signature}`;

// ─── Base64url ────────────────────────────────────────────────────────────

describe('base64url', () => {
  it('round-trips bytes', () => {
    const input = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x01]);
    expect([...base64UrlToBytes(bytesToBase64Url(input))]).toEqual([...input]);
  });

  it('never emits +, / or =', () => {
    const encoded = bytesToBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]));
    expect(encoded).toBe('-_-_');
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('tolerates padding that should not be there', () => {
    expect(base64UrlToText('Zm9v')).toBe('foo');
    expect(base64UrlToText('Zm9v==')).toBe('foo');
  });

  it('names the offending character', () => {
    expect(() => base64UrlToBytes('ab@d', 'The header')).toThrow(/not a base64url character/);
    expect(() => base64UrlToBytes('ab@d', 'The header')).toThrow(/The header/);
  });

  it('points out standard Base64 pasted where base64url belongs', () => {
    expect(() => base64UrlToBytes('ab+d')).toThrow(/standard Base64, not the base64url alphabet/);
    expect(() => base64UrlToBytes('ab/d')).toThrow(/"\/" becomes "_"/);
  });

  it('rejects an impossible length', () => {
    expect(() => base64UrlToBytes('abcde')).toThrow(/length of 5/);
  });

  it('rejects bytes that are not UTF-8 when text is expected', () => {
    const encoded = bytesToBase64Url(new Uint8Array([0xff, 0xfe]));
    expect(() => base64UrlToText(encoded, 'The payload')).toThrow(/not valid UTF-8/);
  });
});

// ─── Structure ────────────────────────────────────────────────────────────

describe('splitToken', () => {
  it('splits a well-formed token', () => {
    const parts = splitToken(SAMPLE_JWT);
    expect(parts.signingInput.split('.')).toHaveLength(2);
    expect(parts.signingInput).toBe(`${parts.headerSegment}.${parts.payloadSegment}`);
  });

  it('strips a Bearer prefix and surrounding whitespace', () => {
    expect(splitToken(`  Bearer ${SAMPLE_JWT}  `).headerSegment).toBe(splitToken(SAMPLE_JWT).headerSegment);
  });

  it('explains a token with no full stops at all', () => {
    expect(() => splitToken('notatoken')).toThrow(/three base64url segments/);
  });

  it('explains a missing segment', () => {
    expect(() => splitToken('aaa.bbb')).toThrow(/exactly three segments and this has 2/);
    expect(() => splitToken('aaa.bbb')).toThrow(/A segment is missing/);
  });

  it('explains an extra segment', () => {
    expect(() => splitToken('aaa.bbb.ccc.ddd')).toThrow(/extra full stop/);
  });

  it('recognises a JWE by its five segments', () => {
    expect(() => splitToken('a.b.c.d.e')).toThrow(/JWE/);
  });

  it('explains empty input without a stack trace', () => {
    expect(() => splitToken('   ')).toThrow(/nothing to decode/);
  });

  it('accepts an empty signature segment, which alg none produces', () => {
    const token = `${b64url({ alg: 'none' })}.${b64url({ sub: '1' })}.`;
    expect(splitToken(token).signatureSegment).toBe('');
  });
});

// ─── Decoding ─────────────────────────────────────────────────────────────

describe('decodeJwt', () => {
  it('decodes the shipped sample', () => {
    const decoded = decodeJwt(SAMPLE_JWT);
    expect(decoded.alg).toBe('HS256');
    expect(decoded.header.kid).toBe('demo-2026');
    expect(decoded.payload.iss).toBe('https://auth.example.com');
    expect(decoded.payload.sub).toBe('user_8421');
    expect(decoded.customClaims).toEqual(['roles', 'email']);
    expect(decoded.warnings).toEqual([]);
  });

  it('formats both segments as readable JSON', () => {
    const decoded = decodeJwt(SAMPLE_JWT);
    expect(decoded.headerJson).toContain('\n  "alg": "HS256"');
    expect(JSON.parse(decoded.payloadJson).jti).toBe('c4d8-4bb1-9f2e');
  });

  it('warns loudly about alg none', () => {
    const decoded = decodeJwt(`${b64url({ alg: 'none' })}.${b64url({ sub: '1' })}.`);
    expect(decoded.warnings.join(' ')).toMatch(/no signature at all/);
    expect(decoded.warnings.join(' ')).toMatch(/CVE-2015-9235/);
  });

  it('treats alg "None" the same way, whatever the casing', () => {
    const decoded = decodeJwt(`${b64url({ alg: 'NONE' })}.${b64url({ sub: '1' })}.`);
    expect(decoded.warnings.join(' ')).toMatch(/unsecured|no signature at all/);
  });

  it('warns when the header has no alg', () => {
    const decoded = decodeJwt(shell({ typ: 'JWT' }, { sub: '1' }));
    expect(decoded.warnings.join(' ')).toMatch(/no "alg" field/);
  });

  it('warns about an algorithm it cannot verify', () => {
    const decoded = decodeJwt(shell({ alg: 'EdDSA' }, { sub: '1' }));
    expect(decoded.warnings.join(' ')).toMatch(/cannot verify "EdDSA"/);
  });

  it('warns about embedded key headers used in key-injection attacks', () => {
    const decoded = decodeJwt(shell({ alg: 'RS256', jku: 'https://evil.example/keys' }, { sub: '1' }));
    expect(decoded.warnings.join(' ')).toMatch(/remote key reference/);
  });

  it('warns when the signature is missing but the header claims one', () => {
    const decoded = decodeJwt(`${b64url({ alg: 'HS256' })}.${b64url({ sub: '1' })}.`);
    expect(decoded.warnings.join(' ')).toMatch(/signature segment is empty/);
  });

  it('explains a segment that is not JSON', () => {
    const token = `${bytesToBase64Url(new TextEncoder().encode('not json'))}.${b64url({ a: 1 })}.x`;
    expect(() => decodeJwt(token)).toThrow(/not valid JSON/);
    expect(() => decodeJwt(token)).toThrow(/not json/);
  });

  it('explains a segment that is JSON but not an object', () => {
    const token = `${bytesToBase64Url(new TextEncoder().encode('[1,2]'))}.${b64url({ a: 1 })}.x`;
    expect(() => decodeJwt(token)).toThrow(/must be a JSON object/);
  });

  it('explains a segment that is not base64url', () => {
    expect(() => decodeJwt('he@der.eyJhIjoxfQ.sig')).toThrow(JwtError);
    expect(() => decodeJwt('he@der.eyJhIjoxfQ.sig')).toThrow(/not a base64url character/);
  });

  it('preserves a Unicode payload', () => {
    const decoded = decodeJwt(shell({ alg: 'HS256' }, { name: 'Renée 🛠' }));
    expect(decoded.payload.name).toBe('Renée 🛠');
  });
});

// ─── Claims ───────────────────────────────────────────────────────────────

describe('expiryStatus', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const nowSeconds = Math.floor(now / 1000);

  it('reports an expired token', () => {
    const status = expiryStatus({ exp: nowSeconds - 3 * 3600 }, now);
    expect(status.state).toBe('expired');
    expect(status.label).toBe('Expired');
    expect(status.detail).toMatch(/3 hours ago/);
  });

  it('reports a token that is not yet valid', () => {
    const status = expiryStatus({ nbf: nowSeconds + 12 * 60, exp: nowSeconds + 3600 }, now);
    expect(status.state).toBe('not-yet-valid');
    expect(status.detail).toMatch(/in 12 minutes/);
  });

  it('reports a token inside its window, without claiming it is authentic', () => {
    const status = expiryStatus({ exp: nowSeconds + 900 }, now);
    expect(status.state).toBe('valid');
    expect(status.detail).toMatch(/not a signature check/);
  });

  it('reports a token with no expiry as exactly that', () => {
    const status = expiryStatus({ sub: 'x' }, now);
    expect(status.state).toBe('no-expiry');
    expect(status.detail).toMatch(/no exp claim/);
  });

  it('treats exp exactly at now as expired', () => {
    expect(expiryStatus({ exp: nowSeconds }, now).state).toBe('expired');
  });

  it('prefers the expiry message when a token is both expired and pre-dated', () => {
    expect(expiryStatus({ exp: nowSeconds - 10, nbf: nowSeconds + 10 }, now).state).toBe('expired');
  });
});

describe('formatRelative', () => {
  it('reads like English in both directions', () => {
    expect(formatRelative(-3 * 3600)).toBe('3 hours ago');
    expect(formatRelative(12 * 60)).toBe('in 12 minutes');
    expect(formatRelative(60)).toBe('in 1 minute');
    expect(formatRelative(-45)).toBe('45 seconds ago');
    expect(formatRelative(2)).toBe('in a few seconds');
    expect(formatRelative(-400 * 86400)).toBe('1 year ago');
  });
});

describe('formatAbsolute', () => {
  it('renders an ISO timestamp', () => {
    expect(formatAbsolute(1758672000)).toMatch(/^2025-09-24T00:00:00Z/);
  });

  it('does not throw on a nonsense value', () => {
    expect(formatAbsolute(Number.MAX_SAFE_INTEGER)).toBe('Not a valid date');
  });
});

describe('describeClaims', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const nowSeconds = Math.floor(now / 1000);

  it('renders the registered claims in spec order', () => {
    const rows = describeClaims(
      { jti: 'x', iat: nowSeconds, sub: 'u1', iss: 'https://a', exp: nowSeconds + 60, aud: 'api' },
      now,
    );
    expect(rows.map((r) => r.key)).toEqual(['iss', 'sub', 'aud', 'exp', 'iat', 'jti']);
  });

  it('gives each time claim an absolute and a relative form', () => {
    const rows = describeClaims({ exp: nowSeconds + 3600 }, now);
    expect(rows[0]!.absolute).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows[0]!.relative).toBe('in 1 hour');
  });

  it('catches the milliseconds mistake', () => {
    const rows = describeClaims({ exp: Date.now() }, now);
    expect(rows[0]!.warning).toMatch(/looks like milliseconds/);
  });

  it('catches a time claim of the wrong type', () => {
    const rows = describeClaims({ exp: '1758675600' as unknown as number }, now);
    expect(rows[0]!.warning).toMatch(/must be a number of seconds/);
  });

  it('joins a multi-valued audience', () => {
    const rows = describeClaims({ aud: ['a', 'b'] }, now);
    expect(rows[0]!.value).toBe('a, b');
    expect(rows[0]!.description).toMatch(/several audiences/);
  });

  it('omits claims that are not present', () => {
    expect(describeClaims({}, now)).toEqual([]);
  });
});

// ─── Keys ─────────────────────────────────────────────────────────────────

describe('pemToArrayBuffer', () => {
  it('decodes a PUBLIC KEY block', async () => {
    const { publicPem } = await generateRsaKeys();
    const der = pemToArrayBuffer(publicPem);
    expect(der.byteLength).toBeGreaterThan(100);
    // A SPKI RSA key starts with a DER SEQUENCE tag.
    expect(new Uint8Array(der)[0]).toBe(0x30);
  });

  it('tolerates leading and trailing whitespace', async () => {
    const { publicPem } = await generateRsaKeys();
    expect(pemToArrayBuffer(`\n  ${publicPem}\n\n`).byteLength).toBeGreaterThan(100);
  });

  it('explains a PKCS#1 key and names the openssl command', () => {
    const pem = '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----';
    expect(() => pemToArrayBuffer(pem)).toThrow(/PKCS#1/);
    expect(() => pemToArrayBuffer(pem)).toThrow(/RSAPublicKey_in/);
  });

  it('explains a certificate', () => {
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
    expect(() => pemToArrayBuffer(pem)).toThrow(/X.509 certificate/);
  });

  it('refuses a private key and says why', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----';
    expect(() => pemToArrayBuffer(pem)).toThrow(/public/);
  });

  it('explains something that is not PEM at all', () => {
    expect(() => pemToArrayBuffer('hunter2')).toThrow(/does not look like a PEM key/);
  });
});

describe('detectKeyKind', () => {
  it('tells the three kinds apart', () => {
    expect(detectKeyKind('-----BEGIN PUBLIC KEY-----\nAAA\n-----END PUBLIC KEY-----')).toBe('pem');
    expect(detectKeyKind('{"kty":"RSA","n":"x","e":"AQAB"}')).toBe('jwk');
    expect(detectKeyKind('a-shared-secret')).toBe('secret');
  });
});

// ─── Signature verification ───────────────────────────────────────────────

async function generateRsaKeys(alg = 'RS256') {
  const pair = (await subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: `SHA-${alg.slice(2)}` },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey));
  let base64 = '';
  for (const byte of spki) base64 += String.fromCharCode(byte);
  const body = btoa(base64).replace(/(.{64})/g, '$1\n');
  const publicPem = `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
  const publicJwk = JSON.stringify(await subtle.exportKey('jwk', pair.publicKey));

  return { pair, publicPem, publicJwk };
}

describe('HMAC verification', () => {
  it('verifies the shipped sample against the documented secret', async () => {
    const result = await verifySignature(SAMPLE_JWT, { kind: 'secret', value: SAMPLE_SECRET });
    expect(result.verified).toBe(true);
    expect(result.algorithm).toBe('HS256');
    expect(result.message).toMatch(/Signature verified/);
  });

  it('fails with the wrong secret, and says not to trust the token', async () => {
    const result = await verifySignature(SAMPLE_JWT, { kind: 'secret', value: 'wrong-secret' });
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/does NOT match/);
    expect(result.message).toMatch(/Do not trust/);
  });

  it('fails when a single character of the payload is changed', async () => {
    const parts = SAMPLE_JWT.split('.');
    const payload = JSON.parse(base64UrlToText(parts[1]!));
    payload.sub = 'admin';
    const tampered = `${parts[0]}.${b64url(payload)}.${parts[2]}`;
    const result = await verifySignature(tampered, { kind: 'secret', value: SAMPLE_SECRET });
    expect(result.verified).toBe(false);
  });

  it('works for HS384 and HS512', async () => {
    for (const alg of ['HS384', 'HS512'] as const) {
      const key = await subtle.importKey(
        'raw',
        new TextEncoder().encode('shared'),
        { name: 'HMAC', hash: `SHA-${alg.slice(2)}` },
        false,
        ['sign', 'verify'],
      );
      const token = await signToken({ typ: 'JWT' }, { sub: 'x' }, key, alg);
      const result = await verifySignature(token, { kind: 'secret', value: 'shared' });
      expect(result.verified, alg).toBe(true);
    }
  });

  it('accepts a base64-encoded secret', async () => {
    const secretBytes = new TextEncoder().encode(SAMPLE_SECRET);
    let binary = '';
    for (const byte of secretBytes) binary += String.fromCharCode(byte);
    const result = await verifySignature(SAMPLE_JWT, {
      kind: 'secret',
      value: btoa(binary),
      encoding: 'base64',
    });
    expect(result.verified).toBe(true);
  });

  it('accepts a hex-encoded secret', async () => {
    const hex = [...new TextEncoder().encode(SAMPLE_SECRET)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const result = await verifySignature(SAMPLE_JWT, { kind: 'secret', value: hex, encoding: 'hex' });
    expect(result.verified).toBe(true);
  });

  it('refuses an empty secret rather than reporting failure', async () => {
    await expect(verifySignature(SAMPLE_JWT, { kind: 'secret', value: '' })).rejects.toThrow(/secret is empty/);
  });

  it('explains that a PEM cannot verify an HMAC token', async () => {
    await expect(
      verifySignature(SAMPLE_JWT, { kind: 'pem', value: '-----BEGIN PUBLIC KEY-----\nAA\n-----END PUBLIC KEY-----' }),
    ).rejects.toThrow(/symmetric algorithm/);
  });
});

describe('RSA verification', () => {
  it('verifies a real RS256 token from a PEM public key', async () => {
    const { pair, publicPem } = await generateRsaKeys();
    const token = await signToken({ typ: 'JWT' }, { sub: 'rsa-user' }, pair.privateKey, 'RS256');
    const result = await verifySignature(token, { kind: 'pem', value: publicPem });
    expect(result.verified).toBe(true);
    expect(result.algorithm).toBe('RS256');
  });

  it('verifies the same token from a JWK', async () => {
    const { pair, publicJwk } = await generateRsaKeys();
    const token = await signToken({ typ: 'JWT' }, { sub: 'rsa-user' }, pair.privateKey, 'RS256');
    expect((await verifySignature(token, { kind: 'jwk', value: publicJwk })).verified).toBe(true);
  });

  it('fails against a different key pair', async () => {
    const signer = await generateRsaKeys();
    const other = await generateRsaKeys();
    const token = await signToken({ typ: 'JWT' }, { sub: 'x' }, signer.pair.privateKey, 'RS256');
    expect((await verifySignature(token, { kind: 'pem', value: other.publicPem })).verified).toBe(false);
  });

  it('refuses a shared secret for an asymmetric algorithm', async () => {
    const { pair } = await generateRsaKeys();
    const token = await signToken({ typ: 'JWT' }, { sub: 'x' }, pair.privateKey, 'RS256');
    await expect(verifySignature(token, { kind: 'secret', value: 'hunter2' })).rejects.toThrow(
      /asymmetric algorithm/,
    );
  });

  it('rejects a JWK Set with a useful message', async () => {
    const { pair, publicJwk } = await generateRsaKeys();
    const token = await signToken({ typ: 'JWT' }, { sub: 'x' }, pair.privateKey, 'RS256');
    const set = JSON.stringify({ keys: [JSON.parse(publicJwk)] });
    await expect(verifySignature(token, { kind: 'jwk', value: set })).rejects.toThrow(/JWK Set/);
  });

  it('rejects a JWK that contains private material', async () => {
    const pair = (await subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const token = await signToken({ typ: 'JWT' }, { sub: 'x' }, pair.privateKey, 'RS256');
    const privateJwk = JSON.stringify(await subtle.exportKey('jwk', pair.privateKey));
    await expect(verifySignature(token, { kind: 'jwk', value: privateJwk })).rejects.toThrow(/private exponent/);
  });

  it('rejects malformed JWK JSON', async () => {
    await expect(
      verifySignature(shell({ alg: 'RS256' }, { sub: 'x' }), { kind: 'jwk', value: '{not json' }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('verifies PS256 (RSA-PSS)', async () => {
    const pair = (await subtle.generateKey(
      { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const token = await signToken({ typ: 'JWT' }, { sub: 'x' }, pair.privateKey, 'PS256');
    const jwk = JSON.stringify(await subtle.exportKey('jwk', pair.publicKey));
    expect((await verifySignature(token, { kind: 'jwk', value: jwk })).verified).toBe(true);
  });
});

describe('ECDSA verification', () => {
  it('verifies ES256 and ES384', async () => {
    for (const [alg, curve] of [
      ['ES256', 'P-256'],
      ['ES384', 'P-384'],
    ] as const) {
      const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, [
        'sign',
        'verify',
      ])) as CryptoKeyPair;
      const token = await signToken({ typ: 'JWT' }, { sub: 'ec-user' }, pair.privateKey, alg);
      const jwk = JSON.stringify(await subtle.exportKey('jwk', pair.publicKey));
      const result = await verifySignature(token, { kind: 'jwk', value: jwk });
      expect(result.verified, alg).toBe(true);
    }
  });

  it('fails when the token is tampered with', async () => {
    const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const token = await signToken({ typ: 'JWT' }, { sub: 'user' }, pair.privateKey, 'ES256');
    const jwk = JSON.stringify(await subtle.exportKey('jwk', pair.publicKey));
    const parts = token.split('.');
    const tampered = `${parts[0]}.${b64url({ sub: 'admin' })}.${parts[2]}`;
    expect((await verifySignature(tampered, { kind: 'jwk', value: jwk })).verified).toBe(false);
  });
});

describe('verification refusals', () => {
  it('never reports an alg none token as verified', async () => {
    const token = `${b64url({ alg: 'none' })}.${b64url({ sub: 'admin' })}.`;
    const result = await verifySignature(token, { kind: 'secret', value: 'anything' });
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/unsecured/);
    expect(result.message).not.toMatch(/verified with/);
  });

  it('never reports an empty signature as verified', async () => {
    const token = `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'x' })}.`;
    const result = await verifySignature(token, { kind: 'secret', value: 'secret' });
    expect(result.verified).toBe(false);
    expect(result.message).toMatch(/nothing to check/);
  });

  it('refuses an algorithm it does not support', async () => {
    await expect(
      verifySignature(shell({ alg: 'EdDSA' }, { sub: 'x' }), { kind: 'secret', value: 's' }),
    ).rejects.toThrow(/not an algorithm this tool can verify/);
  });

  it('refuses a header with no alg', async () => {
    await expect(
      verifySignature(shell({ typ: 'JWT' }, { sub: 'x' }), { kind: 'secret', value: 's' }),
    ).rejects.toThrow(/no "alg"/);
  });

  it('supports an explicit algorithm override, for algorithm-confusion testing', async () => {
    // A token whose header says RS256 but which was actually HMAC-signed with
    // the public key is the classic confusion attack; the override lets the
    // user check that theory explicitly instead of the tool guessing.
    const key = await subtle.importKey('raw', new TextEncoder().encode('pk'), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    const token = await signToken({ typ: 'JWT' }, { sub: 'x' }, key, 'HS256');
    const relabelled = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${token.split('.')[1]}.${token.split('.')[2]}`;
    const result = await verifySignature(relabelled, { kind: 'secret', value: 'pk' }, 'HS256');
    expect(result.algorithm).toBe('HS256');
    // The signature covers the header too, so relabelling breaks it — which is
    // exactly the outcome a user needs to see.
    expect(result.verified).toBe(false);
  });
});

describe('the supported algorithm list', () => {
  it('names twelve algorithms and no others', () => {
    expect(SUPPORTED_ALGORITHMS).toHaveLength(12);
    expect(SUPPORTED_ALGORITHMS).not.toContain('none');
    expect(SUPPORTED_ALGORITHMS).toContain('HS256');
    expect(SUPPORTED_ALGORITHMS).toContain('RS256');
    expect(SUPPORTED_ALGORITHMS).toContain('ES256');
  });
});
