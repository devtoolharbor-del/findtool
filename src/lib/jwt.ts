/**
 * JSON Web Token decoding and *real* signature verification.
 *
 * Two hard rules govern this file:
 *
 *  1. Decoding is not verifying. A JWS is `base64url(header).base64url(payload)
 *     .base64url(signature)` — the first two parts are encoded, not encrypted,
 *     and anyone can rewrite them. Nothing here may imply a token is genuine
 *     unless `verifySignature` actually returned `verified: true`.
 *  2. Verification is done with Web Crypto (`crypto.subtle`), against a key the
 *     user supplies. There is no shortcut, no "looks right", and no network
 *     call — the token and the key never leave the page.
 *
 * Pure apart from `crypto.subtle`, so it is unit-testable in Node 20, where
 * `globalThis.crypto.subtle` is available without an import.
 */

// ─── Base64url ────────────────────────────────────────────────────────────

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const B64_DECODE: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  const standard = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < standard.length; i++) table[standard[i]!] = i;
  table['-'] = 62;
  table['_'] = 63;
  return table;
})();

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

/** Decode base64url (RFC 4648 §5) into bytes, tolerating missing padding. */
// The explicit `<ArrayBuffer>` argument matters: TypeScript 5.7 made the typed
// arrays generic over their backing buffer, and the Web Crypto `BufferSource`
// parameters reject the default `ArrayBufferLike` because it admits
// SharedArrayBuffer. These helpers always allocate a fresh ArrayBuffer.
export function base64UrlToBytes(input: string, what = 'This segment'): Uint8Array<ArrayBuffer> {
  const text = input.replace(/\s+/g, '').replace(/=+$/, '');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '+' || ch === '/') {
      throw new JwtError(
        `${what} contains "${ch}" at position ${i}. That is standard Base64, not the base64url alphabet a JWT requires (RFC 7515 §2): "+" becomes "-" and "/" becomes "_".`,
      );
    }
    if (!(ch in B64_DECODE)) {
      throw new JwtError(
        `${what} contains "${ch}" at position ${i}, which is not a base64url character. JWT segments use A–Z, a–z, 0–9, "-" and "_" — never "+", "/" or "=".`,
      );
    }
  }
  if (text.length % 4 === 1) {
    throw new JwtError(
      `${what} has a length of ${text.length}, which no base64url encoding can produce. A character was probably lost when the token was copied.`,
    );
  }

  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < text.length; i++) {
    buffer = (buffer << 6) | B64_DECODE[text[i]!]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64URL_ALPHABET[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64URL_ALPHABET[b2 & 0b111111];
  }
  return out;
}

export function base64UrlToText(input: string, what = 'This segment'): string {
  const bytes = base64UrlToBytes(input, what);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new JwtError(`${what} decodes to bytes that are not valid UTF-8, so it cannot be JSON.`);
  }
}

// ─── Structure ────────────────────────────────────────────────────────────

export interface JwtParts {
  headerSegment: string;
  payloadSegment: string;
  signatureSegment: string;
  /** `header.payload` — exactly the bytes the signature covers. */
  signingInput: string;
}

export function splitToken(token: string): JwtParts {
  const raw = token.trim().replace(/^Bearer\s+/i, '');

  if (!raw) throw new JwtError('There is nothing to decode yet — paste a token first.');

  if (raw.includes('.') === false) {
    throw new JwtError(
      'A JWT is three base64url segments separated by full stops, and this has none. If your string came from an Authorization header, drop the "Bearer " prefix and paste only the token.',
    );
  }

  const segments = raw.split('.');

  if (segments.length === 5) {
    throw new JwtError(
      'This has five segments, which makes it a JWE (an encrypted token), not a JWS. Its payload is ciphertext and cannot be read without the decryption key.',
    );
  }
  if (segments.length !== 3) {
    throw new JwtError(
      `A JWT has exactly three segments and this has ${segments.length}. ${
        segments.length < 3
          ? 'A segment is missing — check that nothing was cut off when the token was copied.'
          : 'An extra full stop suggests two tokens were pasted together.'
      }`,
    );
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments as [string, string, string];

  if (!headerSegment) throw new JwtError('The header segment is empty.');
  if (!payloadSegment) throw new JwtError('The payload segment is empty.');

  return {
    headerSegment,
    payloadSegment,
    signatureSegment,
    signingInput: `${headerSegment}.${payloadSegment}`,
  };
}

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  cty?: string;
  [key: string]: unknown;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

function parseSegmentJson(segment: string, what: string): Record<string, unknown> {
  const text = base64UrlToText(segment, what);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new JwtError(
      `${what} decodes successfully but is not valid JSON. It decoded to: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`,
    );
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new JwtError(`${what} must be a JSON object, but it is ${Array.isArray(value) ? 'an array' : typeof value}.`);
  }
  return value as Record<string, unknown>;
}

// ─── Claims ───────────────────────────────────────────────────────────────

export type ExpiryState = 'valid' | 'expired' | 'not-yet-valid' | 'no-expiry';

export interface ExpiryStatus {
  state: ExpiryState;
  /** A sentence suitable for a badge or status line. */
  label: string;
  detail: string;
}

/** Registered claim names from RFC 7519 §4.1, with what each one means. */
export const REGISTERED_CLAIMS: Record<string, { name: string; description: string }> = {
  iss: { name: 'Issuer', description: 'Who created and signed this token.' },
  sub: { name: 'Subject', description: 'Who or what the token is about — usually a user ID.' },
  aud: { name: 'Audience', description: 'Who the token is intended for. A recipient must reject a token not addressed to it.' },
  exp: { name: 'Expires at', description: 'After this moment the token must be rejected (RFC 7519 §4.1.4).' },
  nbf: { name: 'Not before', description: 'Before this moment the token must be rejected.' },
  iat: { name: 'Issued at', description: 'When the token was created.' },
  jti: { name: 'JWT ID', description: 'A unique identifier, used to prevent replay.' },
};

export interface ClaimRow {
  key: string;
  name: string;
  description: string;
  /** The raw JSON value, stringified for display. */
  value: string;
  /** Present for the three time claims. */
  absolute?: string;
  relative?: string;
  /** Set when the value is the wrong JSON type for that claim. */
  warning?: string;
}

/**
 * Render a number of seconds as something a person reads without counting
 * zeroes: "3 hours ago", "in 12 minutes".
 */
export function formatRelative(seconds: number): string {
  const abs = Math.abs(seconds);
  const future = seconds > 0;

  const units: Array<[number, string]> = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [86400 * 30, 'day'],
    [86400 * 365, 'month'],
    [Infinity, 'year'],
  ];
  const divisors = [1, 60, 3600, 86400, 86400 * 30, 86400 * 365];

  if (abs < 10) return future ? 'in a few seconds' : 'a few seconds ago';

  let index = 0;
  while (index < units.length - 1 && abs >= units[index]![0]) index++;

  const value = Math.round(abs / divisors[index]!);
  const unit = units[index]![1];
  const plural = value === 1 ? unit : `${unit}s`;

  return future ? `in ${value} ${plural}` : `${value} ${plural} ago`;
}

/** Format a NumericDate (seconds since the epoch) as an absolute timestamp. */
export function formatAbsolute(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return 'Not a valid date';
  return `${date.toISOString().replace('.000', '')} (${date.toLocaleString()} local)`;
}

/**
 * Work out whether the token is currently usable, from `exp` and `nbf` only.
 * This says nothing about the signature — the UI must never merge the two.
 */
export function expiryStatus(payload: JwtPayload, now = Date.now()): ExpiryStatus {
  const nowSeconds = Math.floor(now / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : undefined;

  if (exp !== undefined && exp <= nowSeconds) {
    return {
      state: 'expired',
      label: 'Expired',
      detail: `This token expired ${formatRelative(exp - nowSeconds)} (${formatAbsolute(exp)}).`,
    };
  }

  if (nbf !== undefined && nbf > nowSeconds) {
    return {
      state: 'not-yet-valid',
      label: 'Not yet valid',
      detail: `This token cannot be used until ${formatAbsolute(nbf)} — ${formatRelative(nbf - nowSeconds)}.`,
    };
  }

  if (exp === undefined) {
    return {
      state: 'no-expiry',
      label: 'No expiry',
      detail:
        'This token has no exp claim, so nothing in it limits how long it can be used. That is legal but risky: a leaked token stays usable until the key is rotated.',
    };
  }

  return {
    state: 'valid',
    label: 'Within its validity window',
    detail: `This token expires ${formatRelative(exp - nowSeconds)} (${formatAbsolute(exp)}). That is a time check only, not a signature check.`,
  };
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

/** Build the readable claim table shown under the payload. */
export function describeClaims(payload: JwtPayload, now = Date.now()): ClaimRow[] {
  const nowSeconds = Math.floor(now / 1000);
  const rows: ClaimRow[] = [];

  for (const key of ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti']) {
    if (!(key in payload)) continue;
    const value = payload[key];
    const meta = REGISTERED_CLAIMS[key]!;
    const row: ClaimRow = {
      key,
      name: meta.name,
      description: meta.description,
      value: stringify(value),
    };

    if (key === 'exp' || key === 'nbf' || key === 'iat') {
      if (typeof value === 'number') {
        row.absolute = formatAbsolute(value);
        row.relative = formatRelative(value - nowSeconds);
        // A value in milliseconds is the single most common JWT bug there is.
        if (value > 1e11) {
          row.warning =
            'This looks like milliseconds. NumericDate values are seconds since the epoch (RFC 7519 §2), so a millisecond value puts the date thousands of years in the future.';
        }
      } else {
        row.warning = `${key} must be a number of seconds since the epoch, but this is ${typeof value}.`;
      }
    }

    if (key === 'aud' && Array.isArray(value)) {
      row.value = value.join(', ');
      row.description += ' This token lists several audiences.';
    }

    rows.push(row);
  }

  return rows;
}

// ─── Decoding ─────────────────────────────────────────────────────────────

export interface DecodedJwt {
  parts: JwtParts;
  header: JwtHeader;
  payload: JwtPayload;
  headerJson: string;
  payloadJson: string;
  alg: string;
  claims: ClaimRow[];
  expiry: ExpiryStatus;
  /** Non-registered claims, listed separately so the table stays readable. */
  customClaims: string[];
  /** Problems worth showing prominently. `alg: none` produces one. */
  warnings: string[];
  signatureBytes: Uint8Array;
}

/** Algorithms this tool can actually verify, via Web Crypto. */
export const SUPPORTED_ALGORITHMS = [
  'HS256', 'HS384', 'HS512',
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
] as const;

export type SupportedAlgorithm = (typeof SUPPORTED_ALGORITHMS)[number];

export function decodeJwt(token: string, now = Date.now()): DecodedJwt {
  const parts = splitToken(token);
  const header = parseSegmentJson(parts.headerSegment, 'The header') as JwtHeader;
  const payload = parseSegmentJson(parts.payloadSegment, 'The payload') as JwtPayload;

  const alg = typeof header.alg === 'string' ? header.alg : '';
  const warnings: string[] = [];

  if (!alg) {
    warnings.push('The header has no "alg" field. RFC 7515 §4.1.1 requires it, so most libraries will reject this token outright.');
  } else if (alg.toLowerCase() === 'none') {
    warnings.push(
      'This token uses alg "none": it carries no signature at all, so anyone can change any claim in it. Accepting an unsecured token is CVE-2015-9235, the original JWT vulnerability. Never treat this token as authenticated.',
    );
  } else if (!(SUPPORTED_ALGORITHMS as readonly string[]).includes(alg)) {
    warnings.push(`This tool cannot verify "${alg}" signatures. It supports ${SUPPORTED_ALGORITHMS.join(', ')} through Web Crypto.`);
  }

  if (alg.toLowerCase() !== 'none' && !parts.signatureSegment) {
    warnings.push(`The header claims ${alg} but the signature segment is empty, so there is nothing to verify.`);
  }

  if (header.typ !== undefined && typeof header.typ === 'string' && header.typ.toUpperCase() !== 'JWT' && !header.typ.includes('+')) {
    warnings.push(`The "typ" header is "${header.typ}" rather than "JWT". That is allowed, but check the consumer expects it.`);
  }

  if ('kid' in header && typeof header.kid !== 'string') {
    warnings.push('The "kid" header should be a string naming which key signed this token.');
  }

  if (header.jku !== undefined || header.jwk !== undefined || header.x5u !== undefined) {
    warnings.push(
      'This header carries an embedded or remote key reference (jwk, jku or x5u). A verifier that trusts it is trusting the attacker to supply their own key — reputable libraries ignore these by default.',
    );
  }

  const customClaims = Object.keys(payload).filter((k) => !(k in REGISTERED_CLAIMS));

  let signatureBytes: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  if (parts.signatureSegment) {
    signatureBytes = base64UrlToBytes(parts.signatureSegment, 'The signature');
  }

  return {
    parts,
    header,
    payload,
    headerJson: JSON.stringify(header, null, 2),
    payloadJson: JSON.stringify(payload, null, 2),
    alg,
    claims: describeClaims(payload, now),
    expiry: expiryStatus(payload, now),
    customClaims,
    warnings,
    signatureBytes,
  };
}

// ─── Keys ─────────────────────────────────────────────────────────────────

/**
 * Convert a PEM block to the DER bytes Web Crypto's `importKey` expects.
 *
 * PEM is just base64-encoded DER wrapped in `-----BEGIN …-----` lines. The
 * labels matter, because Web Crypto only accepts SubjectPublicKeyInfo (the
 * `PUBLIC KEY` label). The other labels get a specific message rather than a
 * generic failure, since "operation not supported" tells a user nothing.
 */
export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const text = pem.trim();
  const match = text.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END [A-Z0-9 ]+-----/);

  if (!match) {
    throw new JwtError(
      'This does not look like a PEM key. A PEM block starts with a line such as "-----BEGIN PUBLIC KEY-----" and ends with the matching END line.',
    );
  }

  const label = match[1]!.trim();

  if (label === 'RSA PUBLIC KEY') {
    throw new JwtError(
      'This is a PKCS#1 RSA public key ("BEGIN RSA PUBLIC KEY"). Web Crypto only imports the SPKI form. Convert it with: openssl rsa -RSAPublicKey_in -in key.pem -pubout',
    );
  }
  if (label === 'CERTIFICATE') {
    throw new JwtError(
      'This is an X.509 certificate, not a bare public key. Extract the key with: openssl x509 -pubkey -noout -in cert.pem',
    );
  }
  if (label.includes('PRIVATE KEY')) {
    throw new JwtError(
      'This is a private key. Verifying a signature needs the *public* key — and pasting a private key anywhere, including here, is worth avoiding. Derive the public half with: openssl pkey -in key.pem -pubout',
    );
  }
  if (label !== 'PUBLIC KEY') {
    throw new JwtError(`PEM label "${label}" is not supported. Paste a "PUBLIC KEY" (SPKI) block.`);
  }

  const body = match[2]!.replace(/\s+/g, '');
  if (!body) throw new JwtError('The PEM block is empty between its BEGIN and END lines.');

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(body);
  } catch {
    throw new JwtError('The PEM body is not valid Base64. Check that no characters were lost when it was copied.');
  }

  // Return a standalone ArrayBuffer, never a view into a larger one.
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64ToBytes(input: string): Uint8Array<ArrayBuffer> {
  const text = input.replace(/\s+/g, '').replace(/=+$/, '');
  for (const ch of text) if (!(ch in B64_DECODE)) throw new Error('not base64');
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const ch of text) {
    buffer = (buffer << 6) | B64_DECODE[ch]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export type SecretEncoding = 'utf-8' | 'base64' | 'base64url' | 'hex';

function secretToBytes(secret: string, encoding: SecretEncoding): Uint8Array<ArrayBuffer> {
  switch (encoding) {
    case 'base64':
    case 'base64url':
      return base64ToBytes(secret);
    case 'hex': {
      const digits = secret.replace(/[\s:_-]|0[xX]/g, '');
      if (digits.length % 2 !== 0 || /[^0-9a-fA-F]/.test(digits)) {
        throw new JwtError('The secret is not valid hexadecimal. Use an even number of 0–9 / A–F digits.');
      }
      const out = new Uint8Array(digits.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    default:
      return new TextEncoder().encode(secret);
  }
}

interface AlgorithmSpec {
  importParams: RsaHashedImportParams | EcKeyImportParams | HmacImportParams;
  verifyParams: Algorithm | RsaPssParams | EcdsaParams;
  family: 'HMAC' | 'RSA' | 'RSA-PSS' | 'EC';
}

const CURVES: Record<string, string> = { ES256: 'P-256', ES384: 'P-384', ES512: 'P-521' };

function algorithmSpec(alg: string): AlgorithmSpec {
  const bits = alg.slice(2);
  const hash = `SHA-${bits}`;

  if (alg.startsWith('HS')) {
    return { importParams: { name: 'HMAC', hash }, verifyParams: { name: 'HMAC' }, family: 'HMAC' };
  }
  if (alg.startsWith('RS')) {
    return {
      importParams: { name: 'RSASSA-PKCS1-v1_5', hash },
      verifyParams: { name: 'RSASSA-PKCS1-v1_5' },
      family: 'RSA',
    };
  }
  if (alg.startsWith('PS')) {
    const saltLength = Number(bits) / 8;
    return {
      importParams: { name: 'RSA-PSS', hash },
      verifyParams: { name: 'RSA-PSS', saltLength },
      family: 'RSA-PSS',
    };
  }
  if (alg.startsWith('ES')) {
    const namedCurve = CURVES[alg];
    if (!namedCurve) throw new JwtError(`"${alg}" is not a recognised ECDSA algorithm.`);
    return {
      importParams: { name: 'ECDSA', namedCurve },
      verifyParams: { name: 'ECDSA', hash: { name: hash } },
      family: 'EC',
    };
  }

  throw new JwtError(`"${alg}" is not an algorithm this tool can verify.`);
}

export type KeyKind = 'secret' | 'pem' | 'jwk';

export interface KeyInput {
  kind: KeyKind;
  value: string;
  /** Only meaningful for `kind: 'secret'`. */
  encoding?: SecretEncoding;
}

/** Guess which kind of key material was pasted, so the UI need not ask twice. */
export function detectKeyKind(value: string): KeyKind {
  const trimmed = value.trim();
  if (trimmed.startsWith('-----BEGIN')) return 'pem';
  if (trimmed.startsWith('{') && /"kty"\s*:/.test(trimmed)) return 'jwk';
  return 'secret';
}

async function importVerificationKey(alg: string, key: KeyInput): Promise<CryptoKey> {
  const spec = algorithmSpec(alg);
  const subtle = getSubtle();

  if (spec.family === 'HMAC') {
    if (key.kind === 'jwk') {
      return subtle.importKey('jwk', JSON.parse(key.value) as JsonWebKey, spec.importParams, false, ['verify']);
    }
    if (key.kind === 'pem') {
      throw new JwtError(
        `${alg} is a symmetric algorithm: it is verified with the same shared secret that signed it, not with a PEM public key.`,
      );
    }
    const bytes = secretToBytes(key.value, key.encoding ?? 'utf-8');
    if (bytes.length === 0) throw new JwtError('The secret is empty.');
    // Copy into a freshly allocated buffer so the value is a plain BufferSource.
    return subtle.importKey('raw', new Uint8Array(bytes), spec.importParams, false, ['verify']);
  }

  if (key.kind === 'secret') {
    throw new JwtError(
      `${alg} is an asymmetric algorithm, so it is verified with a public key, not a shared secret. Paste a PEM "PUBLIC KEY" block or a JWK.`,
    );
  }

  if (key.kind === 'jwk') {
    let jwk: JsonWebKey;
    try {
      jwk = JSON.parse(key.value) as JsonWebKey;
    } catch {
      throw new JwtError('The JWK is not valid JSON. It should look like {"kty":"RSA","n":"…","e":"AQAB"}.');
    }
    if ((jwk as { keys?: unknown }).keys) {
      throw new JwtError(
        'This is a JWK Set (it has a "keys" array), not a single key. Paste the one key whose "kid" matches the token header.',
      );
    }
    if (!jwk.kty) throw new JwtError('The JWK has no "kty" field, so its key type is unknown.');
    if (jwk.d) {
      throw new JwtError('This JWK contains a private exponent ("d"). Use the public key — remove the private fields.');
    }
    return subtle.importKey('jwk', jwk, spec.importParams, false, ['verify']);
  }

  const der = pemToArrayBuffer(key.value);
  try {
    return await subtle.importKey('spki', der, spec.importParams, false, ['verify']);
  } catch {
    throw new JwtError(
      `This key could not be imported as a ${alg} public key. Check that the key type matches the token's algorithm — an RSA key cannot verify an ES256 token, and vice versa.`,
    );
  }
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new JwtError(
      'Web Crypto is not available here. Signature verification needs a secure context — an https:// page or localhost.',
    );
  }
  return subtle;
}

export interface VerificationResult {
  /** True only when `crypto.subtle.verify` returned true. Nothing else. */
  verified: boolean;
  algorithm: string;
  /** Exactly what happened, for display. Never optimistic. */
  message: string;
}

/**
 * Verify a token's signature against a supplied key.
 *
 * The algorithm always comes from the caller (the UI reads it from the header
 * and lets the user override it). Trusting the header blindly is how algorithm
 * confusion attacks work — an attacker re-signs an RS256 token as HS256 using
 * the public key as the HMAC secret, and a verifier that follows the header
 * accepts it. The UI therefore shows which algorithm is being used and warns
 * when it does not match the header.
 */
export async function verifySignature(
  token: string,
  key: KeyInput,
  algOverride?: string,
): Promise<VerificationResult> {
  const parts = splitToken(token);
  const header = parseSegmentJson(parts.headerSegment, 'The header') as JwtHeader;
  const alg = algOverride ?? (typeof header.alg === 'string' ? header.alg : '');

  if (!alg) throw new JwtError('The header has no "alg", so there is no algorithm to verify against.');

  if (alg.toLowerCase() === 'none') {
    return {
      verified: false,
      algorithm: 'none',
      message:
        'This token is unsecured (alg "none") — it has no signature, so there is nothing that could be verified. Any claim in it can have been changed by anyone.',
    };
  }

  if (!parts.signatureSegment) {
    return {
      verified: false,
      algorithm: alg,
      message: `The header claims ${alg}, but the signature segment is empty. There is nothing to check.`,
    };
  }

  const spec = algorithmSpec(alg);
  const cryptoKey = await importVerificationKey(alg, key);
  const signature = base64UrlToBytes(parts.signatureSegment, 'The signature');
  const data = new TextEncoder().encode(parts.signingInput);

  let verified = false;
  try {
    verified = await getSubtle().verify(spec.verifyParams, cryptoKey, new Uint8Array(signature), data);
  } catch (err) {
    throw new JwtError(
      `The signature could not be checked: ${err instanceof Error ? err.message : String(err)}. This usually means the key does not match the algorithm in the header.`,
    );
  }

  return {
    verified,
    algorithm: alg,
    message: verified
      ? `Signature verified with ${alg}. The header and payload have not been altered since they were signed with this key. Expiry, issuer and audience are separate checks.`
      : `Signature does NOT match. Either this is not the key that signed the token, or the token has been modified. Do not trust any claim in it.`,
  };
}

/**
 * Sign a token. Used by the test suite to produce known-good signatures; the
 * UI never calls it, because the point of this tool is inspection.
 */
export async function signToken(
  header: JwtHeader,
  payload: JwtPayload,
  key: CryptoKey,
  alg: string,
): Promise<string> {
  const spec = algorithmSpec(alg);
  const encode = (obj: unknown) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${encode({ ...header, alg })}.${encode(payload)}`;
  const signature = await getSubtle().sign(
    spec.verifyParams,
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/**
 * A sample token: HS256, signed with the secret below, deliberately already
 * expired so the badge has something real to show.
 */
export const SAMPLE_SECRET = 'bytecabin-demo-secret';

export const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlbW8tMjAyNiJ9.' +
  'eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJzdWIiOiJ1c2VyXzg0MjEiLCJhdWQiOlsiYXBpLmV4YW1wbGUuY29tIl0sImlhdCI6MTc1ODY3MjAwMCwibmJmIjoxNzU4NjcyMDAwLCJleHAiOjE3NTg2NzU2MDAsImp0aSI6ImM0ZDgtNGJiMS05ZjJlIiwicm9sZXMiOlsiZWRpdG9yIl0sImVtYWlsIjoiZGV2QGV4YW1wbGUuY29tIn0.' +
  'g927yhl_qr3Bh4E3bKz06L92qA3M0Y1YtY55Nu8LL4A';
