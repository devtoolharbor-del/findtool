/**
 * Hashing helpers shared by the SHA-256, SHA-1 and HMAC tools.
 *
 * Everything that can be done with `crypto.subtle` is done with it: the
 * browser's implementation is native, constant-memory and already audited.
 * MD5 is the one exception and lives in `src/lib/md5.ts`, because Web Crypto
 * has never offered it.
 *
 * Pure and DOM-free, so the same functions are unit-tested in Node (where
 * `globalThis.crypto.subtle` exists from Node 20 onwards) and run unchanged
 * in the browser.
 *
 * Two things this module is emphatically not:
 *
 *  - Encryption. A hash is one-way. There is no key, no ciphertext and no
 *    "decrypt" operation; a tool that claims to reverse a hash is looking the
 *    value up in a table of pre-computed common inputs.
 *  - Password storage. SHA-2 is designed to be fast, which is the opposite of
 *    what a password hash needs. Use Argon2id, scrypt or bcrypt for that.
 */

/** The digest algorithms `crypto.subtle.digest()` accepts. */
export type ShaAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/** Every algorithm this site can produce, MD5 included. */
export type HashAlgorithm = ShaAlgorithm | 'MD5';

export type DigestEncoding = 'hex' | 'base64';

export const SHA_ALGORITHMS: readonly ShaAlgorithm[] = [
  'SHA-1',
  'SHA-256',
  'SHA-384',
  'SHA-512',
];

/** Digest size in bytes, used to tell "wrong value" from "wrong algorithm". */
export const DIGEST_BYTES: Record<HashAlgorithm, number> = {
  MD5: 16,
  'SHA-1': 20,
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
};

/** Reverse lookup: 64 hex characters → SHA-256. Used in error messages. */
const BY_HEX_LENGTH: Record<number, HashAlgorithm> = {
  32: 'MD5',
  40: 'SHA-1',
  64: 'SHA-256',
  96: 'SHA-384',
  128: 'SHA-512',
};

// ─── Web Crypto access ────────────────────────────────────────────────────

/**
 * `crypto.subtle` is only exposed in a secure context. Over plain http:// on
 * a non-localhost host it is simply `undefined`, which would otherwise
 * surface as "cannot read property digest of undefined".
 */
function subtle(): SubtleCrypto {
  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!webcrypto?.subtle) {
    throw new Error(
      'Your browser is not exposing the Web Crypto API on this page. Hashing needs a secure ' +
        'context — an https:// address or localhost.',
    );
  }
  return webcrypto.subtle;
}

/** UTF-8 encode a string. The same bytes a text file on disk would contain. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ─── Digests ──────────────────────────────────────────────────────────────

/**
 * Hash raw bytes — a file read with `readFileBuffer()`, or any typed array.
 * Returns the raw digest so the caller can render it as hex or Base64.
 */
export async function hashBytes(
  data: BufferSource | Uint8Array,
  algorithm: ShaAlgorithm,
): Promise<Uint8Array> {
  const digest = await subtle().digest(algorithm, data as BufferSource);
  return new Uint8Array(digest);
}

/** Hash a string as UTF-8. */
export async function hashText(text: string, algorithm: ShaAlgorithm): Promise<Uint8Array> {
  return hashBytes(utf8(text), algorithm);
}

// ─── Encoding ─────────────────────────────────────────────────────────────

/** Lowercase (or uppercase) hex — the form every checksum file publishes. */
export function toHex(bytes: Uint8Array, uppercase = false): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return uppercase ? out.toUpperCase() : out;
}

/**
 * Standard Base64 with padding. Written out rather than using `btoa`, which
 * does not exist in every runtime this module is tested in and needs a binary
 * string detour anyway.
 */
export function toBase64(bytes: Uint8Array): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += A[(n >>> 18) & 63]! + A[(n >>> 12) & 63]! + A[(n >>> 6) & 63]! + A[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += A[(n >>> 18) & 63]! + A[(n >>> 12) & 63]! + '==';
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += A[(n >>> 18) & 63]! + A[(n >>> 12) & 63]! + A[(n >>> 6) & 63]! + '=';
  }
  return out;
}

/** Decode hex to bytes, or `null` if the text is not clean hex. */
export function fromHex(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Decode standard or URL-safe Base64 to bytes, or `null` if malformed. */
export function fromBase64(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const body = clean.replace(/=+$/, '');
  if (body.length === 0 || body.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+$/.test(body)) return null;

  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let p = 0;
  for (const ch of body) {
    acc = (acc << 6) | A.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (acc >>> bits) & 0xff;
    }
  }
  return out;
}

/**
 * Render a digest for display.
 *
 * `uppercase` applies to hex only — Base64 is case-significant, so upper-casing
 * it would produce a different, wrong value rather than the same value styled
 * differently.
 */
export function formatDigest(
  bytes: Uint8Array,
  encoding: DigestEncoding,
  uppercase = false,
): string {
  return encoding === 'base64' ? toBase64(bytes) : toHex(bytes, uppercase);
}

// ─── Comparison ───────────────────────────────────────────────────────────

/**
 * Compare two byte strings without an early exit.
 *
 * In a browser tab comparing a checksum you pasted yourself, a timing leak is
 * not a real threat. It matters for the HMAC verify mode, where the habit is
 * the point: server-side signature checks must not leak how many leading
 * bytes of a forged signature were correct, and this is the shape that code
 * should take (`crypto.timingSafeEqual` in Node, `hmac.compare_digest` in
 * Python). Length is compared up front because a digest's length is public.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** The same idea for two strings, comparing code units. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Pull the hash out of whatever the user pasted.
 *
 * Published checksums arrive in several shapes and all of them should just
 * work:
 *
 *   9f86d081...            plain
 *   9f86d081...  file.iso  GNU coreutils `sha256sum` output
 *   9f86d081... *file.iso  the same, binary mode
 *   SHA256 (file.iso) = 9f86d081...   BSD `shasum -a 256 --tag`
 *   sha256:9f86d081...     container digests and lockfiles
 */
export function extractChecksum(raw: string): string {
  let text = raw.trim();
  if (!text) return '';

  // BSD tag form: everything after the last '='.
  const tagged = text.match(/=\s*([^=\s]+)\s*$/);
  if (tagged) text = tagged[1]!;

  // First whitespace-separated token, dropping coreutils' '*' binary marker.
  text = text.split(/\s+/)[0]!.replace(/^\*/, '');

  // Algorithm prefix, as used by OCI image digests.
  text = text.replace(/^(?:md5|sha1|sha-1|sha256|sha-256|sha384|sha-384|sha512|sha-512):/i, '');

  return text.trim();
}

export type ChecksumStatus = 'match' | 'mismatch' | 'empty' | 'unreadable';

export interface ChecksumResult {
  status: ChecksumStatus;
  /** How the pasted value was read, once it was readable. */
  encoding: DigestEncoding | null;
  /** The value actually compared, after stripping filenames and prefixes. */
  normalized: string;
  /** A sentence to show the user. Never ambiguous about match vs no match. */
  message: string;
}

/**
 * Compare a computed digest against a checksum the user pasted.
 *
 * This is the job most people came to do: they downloaded a file, the project
 * published a hash, and they need a yes or a no. The answer is never hedged,
 * and a value of the wrong length is reported as the wrong *algorithm* rather
 * than as a failed comparison — that mistake is far more common than a
 * genuinely corrupt download.
 */
export function compareChecksum(
  expectedRaw: string,
  digest: Uint8Array,
  algorithm: HashAlgorithm,
): ChecksumResult {
  const normalized = extractChecksum(expectedRaw);
  if (!normalized) {
    return {
      status: 'empty',
      encoding: null,
      normalized: '',
      message: 'Paste the published checksum to compare it against this digest.',
    };
  }

  const hexBytes = fromHex(normalized);
  if (hexBytes) {
    if (hexBytes.length === digest.length) {
      const match = timingSafeEqual(hexBytes, digest);
      return {
        status: match ? 'match' : 'mismatch',
        encoding: 'hex',
        normalized,
        message: match
          ? `Match — the ${algorithm} digest is byte-for-byte identical to the checksum you pasted.`
          : `No match — the ${algorithm} digest differs from the checksum you pasted. This is not the data that checksum describes.`,
      };
    }
    const guess = BY_HEX_LENGTH[normalized.replace(/\s+/g, '').length];
    return {
      status: 'mismatch',
      encoding: 'hex',
      normalized,
      message: guess
        ? `No match — that value is ${normalized.length} hex characters, the length of ${guess}, but this tool computed ${algorithm} (${DIGEST_BYTES[algorithm] * 2} characters). Use the ${guess} tool instead.`
        : `No match — that value is ${normalized.length} hex characters and a ${algorithm} digest is ${DIGEST_BYTES[algorithm] * 2}. Check that you copied the whole checksum.`,
    };
  }

  const b64Bytes = fromBase64(normalized);
  if (b64Bytes && b64Bytes.length === digest.length) {
    const match = timingSafeEqual(b64Bytes, digest);
    return {
      status: match ? 'match' : 'mismatch',
      encoding: 'base64',
      normalized,
      message: match
        ? `Match — the Base64 value you pasted decodes to exactly this ${algorithm} digest.`
        : `No match — the Base64 value you pasted decodes to a different ${algorithm} digest.`,
    };
  }

  return {
    status: 'unreadable',
    encoding: null,
    normalized,
    message: `That does not read as a hash. A ${algorithm} digest is ${DIGEST_BYTES[algorithm] * 2} hex characters, or ${Math.ceil(DIGEST_BYTES[algorithm] / 3) * 4} characters of Base64.`,
  };
}

// ─── HMAC ─────────────────────────────────────────────────────────────────

/**
 * HMAC (RFC 2104) over raw key and message bytes.
 *
 * Web Crypto handles the whole construction — the block-size padding, the
 * inner and outer digests, and hashing an over-long key down first — so there
 * is nothing here but `importKey` + `sign`.
 *
 * The key is imported as non-extractable, which means the CryptoKey cannot be
 * read back out again even by this page's own code.
 */
export async function hmacBytes(
  key: BufferSource | Uint8Array,
  message: BufferSource | Uint8Array,
  algorithm: ShaAlgorithm,
): Promise<Uint8Array> {
  if ((key as ArrayBuffer | ArrayBufferView).byteLength === 0) {
    throw new Error(
      'An HMAC needs a secret key. Paste the shared secret — for a webhook this is the signing ' +
        'secret from the provider dashboard, not your API key.',
    );
  }

  const cryptoKey = await subtle().importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign'],
  );
  const signature = await subtle().sign('HMAC', cryptoKey, message as BufferSource);
  return new Uint8Array(signature);
}

/** HMAC over a UTF-8 key and a UTF-8 message — the common webhook case. */
export async function hmacText(
  key: string,
  message: string,
  algorithm: ShaAlgorithm,
): Promise<Uint8Array> {
  return hmacBytes(utf8(key), utf8(message), algorithm);
}

export type KeyEncoding = 'utf8' | 'hex' | 'base64';

/**
 * Decode a secret key the user typed, in whichever form their provider
 * publishes it. Wrong-format keys produce wrong signatures silently, so this
 * refuses rather than falling back to UTF-8.
 */
export function decodeKey(key: string, encoding: KeyEncoding): Uint8Array {
  if (encoding === 'utf8') return utf8(key);
  if (encoding === 'hex') {
    const bytes = fromHex(key);
    if (!bytes) {
      throw new Error(
        'The secret key is not valid hex. It must be an even number of characters using only 0-9 and a-f.',
      );
    }
    return bytes;
  }
  const bytes = fromBase64(key);
  if (!bytes) throw new Error('The secret key is not valid Base64.');
  return bytes;
}

/**
 * Parse a Stripe-style `Stripe-Signature` header into its timestamp and the
 * v1 signatures it carries.
 *
 * The header looks like `t=1737039600,v1=5257a8…,v1=…`; the value that gets
 * signed is `${t}.${rawBody}`, and more than one `v1` can be present during a
 * secret rotation. Returning all of them means a verify UI can accept a match
 * on any one, which is what Stripe's own library does.
 */
export function parseStripeSignatureHeader(header: string): {
  timestamp: string | null;
  signatures: string[];
} {
  const timestampMatch = header.match(/(?:^|,)\s*t=([^,\s]+)/);
  const signatures = Array.from(header.matchAll(/(?:^|,)\s*v1=([^,\s]+)/g)).map((m) => m[1]!);
  return { timestamp: timestampMatch?.[1] ?? null, signatures };
}
