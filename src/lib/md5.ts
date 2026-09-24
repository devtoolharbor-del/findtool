/**
 * MD5 (RFC 1321), implemented here because the Web Crypto API deliberately
 * does not offer it.
 *
 * `crypto.subtle.digest()` supports SHA-1, SHA-256, SHA-384 and SHA-512 and
 * nothing else — the spec's authors left MD5 out on purpose, and no browser
 * has ever added it. Since the MD5 tool exists to check downloads against
 * published `.md5` files, the algorithm has to be implemented in plain
 * TypeScript.
 *
 * Security position, stated once here so no call site has to guess: MD5 is
 * cryptographically broken. Chosen-prefix collisions are produced in seconds
 * on ordinary hardware, so an MD5 digest proves nothing about an attacker's
 * input. It is still perfectly good at what this module is for — noticing
 * that a download was truncated, corrupted in transit, or written to a bad
 * disk. It is never a password hash and never a signature.
 *
 * Everything here operates on `Uint8Array`, so the same code path hashes a
 * pasted string (via `TextEncoder`) and a file read as an `ArrayBuffer`.
 * No DOM access, so it is unit-testable in Node.
 */

/** Per-round left-rotation amounts, RFC 1321 section 3.4. */
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15,
  21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

/**
 * The 64 sine-derived constants, T[i] = floor(abs(sin(i + 1)) * 2^32).
 * Computed rather than pasted so a typo in a 64-entry table is impossible.
 */
const T = (() => {
  const t = new Uint32Array(64);
  for (let i = 0; i < 64; i++) t[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  return t;
})();

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

/**
 * Compute the MD5 digest of `input` and return the 16 raw bytes.
 *
 * The digest is returned as bytes rather than a string so the caller can
 * choose hex or Base64 without a lossy round-trip.
 */
export function md5(input: Uint8Array): Uint8Array {
  const byteLen = input.length;

  // Pad to 56 mod 64, then append the message length as a 64-bit
  // little-endian bit count.
  const padLen = (((56 - ((byteLen + 1) % 64)) % 64) + 64) % 64;
  const total = byteLen + 1 + padLen + 8;
  const msg = new Uint8Array(total);
  msg.set(input, 0);
  msg[byteLen] = 0x80;

  // byteLen * 8 can exceed 2^32 for inputs over 512 MB, so write the bit
  // count as two 32-bit halves instead of relying on a single JS number
  // surviving a shift.
  const bitsLo = (byteLen << 3) >>> 0;
  const bitsHi = Math.floor(byteLen / 0x20000000) >>> 0;
  const lenOffset = total - 8;
  msg[lenOffset] = bitsLo & 0xff;
  msg[lenOffset + 1] = (bitsLo >>> 8) & 0xff;
  msg[lenOffset + 2] = (bitsLo >>> 16) & 0xff;
  msg[lenOffset + 3] = (bitsLo >>> 24) & 0xff;
  msg[lenOffset + 4] = bitsHi & 0xff;
  msg[lenOffset + 5] = (bitsHi >>> 8) & 0xff;
  msg[lenOffset + 6] = (bitsHi >>> 16) & 0xff;
  msg[lenOffset + 7] = (bitsHi >>> 24) & 0xff;

  // Initial state, RFC 1321 section 3.3.
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);

  for (let chunk = 0; chunk < total; chunk += 64) {
    // Little-endian word decode, done by hand so the result never depends on
    // the host platform's endianness (DataView would also work, byte reads
    // are simply faster here).
    for (let i = 0; i < 16; i++) {
      const o = chunk + i * 4;
      M[i] =
        (msg[o]! | (msg[o + 1]! << 8) | (msg[o + 2]! << 16) | (msg[o + 3]! << 24)) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const tmp = d;
      d = c;
      c = b;
      // All arithmetic is mod 2^32; `| 0` keeps the intermediate in int range
      // and the final `>>> 0` restores the unsigned value.
      const sum = (a + f + T[i]! + M[g]!) | 0;
      b = (b + rotl(sum, SHIFTS[i]!)) | 0;
      a = tmp;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const out = new Uint8Array(16);
  writeLE(out, 0, a0);
  writeLE(out, 4, b0);
  writeLE(out, 8, c0);
  writeLE(out, 12, d0);
  return out;
}

function writeLE(target: Uint8Array, offset: number, word: number): void {
  target[offset] = word & 0xff;
  target[offset + 1] = (word >>> 8) & 0xff;
  target[offset + 2] = (word >>> 16) & 0xff;
  target[offset + 3] = (word >>> 24) & 0xff;
}

/** MD5 of a string, encoded as UTF-8 first — the same bytes a file would hold. */
export function md5Text(text: string): Uint8Array {
  return md5(new TextEncoder().encode(text));
}

/** MD5 of an ArrayBuffer, which is what `readFileBuffer()` hands back. */
export function md5Buffer(buffer: ArrayBuffer): Uint8Array {
  return md5(new Uint8Array(buffer));
}

/**
 * Lowercase hex digest — the form published in `.md5` files and printed by
 * `md5sum`, `md5` (BSD) and `Get-FileHash -Algorithm MD5`.
 */
export function md5Hex(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? md5Text(input) : md5(input);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
