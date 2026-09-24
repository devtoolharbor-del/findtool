/**
 * Randomness helpers shared by the generator family of tools.
 *
 * Pure and DOM-free so they can be unit-tested in Node, and so the UUID,
 * Nano ID, password, random-string and random-number tools all draw from one
 * audited source instead of five slightly different ones.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Math.random() IS NEVER USED IN THIS FILE, AND MUST NEVER BE.
 *
 * Math.random() is seeded from a small internal state (V8 uses xorshift128+),
 * is not reseeded per call, and its output is predictable from a handful of
 * observed values. That is fine for a bouncing-ball demo and disqualifying
 * for anything anyone might treat as a secret — passwords, API keys, session
 * tokens, password-reset identifiers. Everything here draws bytes from
 * crypto.getRandomValues(), which is the platform's CSPRNG.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** The Web Crypto object, in browsers and in Node 20+ (globalThis.crypto). */
function webcrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error(
      'This browser does not expose crypto.getRandomValues(), so secure random values cannot be generated here. Try a current version of Chrome, Firefox, Safari or Edge.',
    );
  }
  return c;
}

/** `count` cryptographically random bytes. */
export function randomBytes(count: number): Uint8Array {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('The number of random bytes must be a whole number of zero or more.');
  }
  const out = new Uint8Array(count);
  // getRandomValues refuses requests over 65,536 bytes, so fill in chunks.
  const CHUNK = 65_536;
  const c = webcrypto();
  for (let i = 0; i < count; i += CHUNK) {
    c.getRandomValues(out.subarray(i, Math.min(i + CHUNK, count)));
  }
  return out;
}

/** One uniform 32-bit unsigned integer. */
export function randomUint32(): number {
  const buf = new Uint32Array(1);
  webcrypto().getRandomValues(buf);
  return buf[0]!;
}

/**
 * A uniform integer in `[0, bound)` — `bound` itself is never returned.
 *
 * Uses rejection sampling rather than `random % bound`. Modulo alone is
 * biased whenever `bound` does not divide the generator's range evenly: with
 * a 32-bit draw and `bound = 10`, the values 0–5 come up 1 part in ~430
 * million more often than 6–9. That is invisible in a dice roller and a real
 * defect in a password generator, where every entropy claim on the page
 * assumes each character is equally likely. So we discard draws that land in
 * the short final block and try again. The expected number of draws is under
 * two for any bound, and the loop terminates with probability 1.
 */
export function randomBelow(bound: number): number {
  if (!Number.isInteger(bound) || bound < 1) {
    throw new Error('The upper bound for a random integer must be a whole number of 1 or more.');
  }
  if (bound === 1) return 0;

  if (bound <= 0x1_0000_0000) {
    // Largest multiple of `bound` that fits in 2^32; anything at or above it
    // belongs to a partial block and would skew the result.
    const limit = Math.floor(0x1_0000_0000 / bound) * bound;
    let v = randomUint32();
    while (v >= limit) v = randomUint32();
    return v % bound;
  }

  // Ranges beyond 2^32 (up to Number.MAX_SAFE_INTEGER) use the same rejection
  // rule on a 64-bit draw, computed in BigInt so nothing rounds.
  const big = BigInt(bound);
  const span = 1n << 64n;
  const limit = (span / big) * big;
  const buf = new BigUint64Array(1);
  const c = webcrypto();
  for (;;) {
    c.getRandomValues(buf);
    if (buf[0]! < limit) return Number(buf[0]! % big);
  }
}

/**
 * A uniform integer in `[min, max]` — **both ends inclusive**, which is what
 * people mean by "a number between 1 and 6".
 */
export function randomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error('Both the minimum and the maximum must be whole numbers.');
  }
  if (max < min) {
    throw new Error('The maximum must be greater than or equal to the minimum.');
  }
  const span = max - min + 1;
  if (span > Number.MAX_SAFE_INTEGER) {
    throw new Error('That range is too wide to sample exactly. Keep it under 2^53 values.');
  }
  return min + randomBelow(span);
}

/**
 * A uniform value in `[min, max)` — the minimum can occur, the maximum cannot.
 * Built from 53 random bits so every representable double in the range is
 * reachable, unlike the common `getRandomValues(Uint32)[0] / 2**32` trick.
 */
export function randomFloat(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('Both the minimum and the maximum must be finite numbers.');
  }
  if (max < min) {
    throw new Error('The maximum must be greater than or equal to the minimum.');
  }
  if (max === min) return min;
  const bytes = randomBytes(8);
  // Take the top 53 bits of a 64-bit draw → a uniform double in [0, 1).
  let hi = 0;
  for (let i = 0; i < 4; i++) hi = hi * 256 + bytes[i]!; // 32 bits
  let lo = 0;
  for (let i = 4; i < 7; i++) lo = lo * 256 + bytes[i]!; // 24 bits
  const unit = (hi * 0x20_0000 + (lo >>> 3)) / 0x20_0000_0000_0000; // 53 bits / 2^53
  return min + unit * (max - min);
}

/**
 * A random decimal in `[min, max)` rounded to `precision` places.
 *
 * Rounding can push a value up to `max`, so the result is clamped back down
 * by one unit in the last place when that happens — the documented range
 * stays half-open.
 */
export function randomDecimal(min: number, max: number, precision: number): number {
  if (!Number.isInteger(precision) || precision < 0 || precision > 15) {
    throw new Error('Decimal places must be a whole number between 0 and 15.');
  }
  const raw = randomFloat(min, max);
  const factor = 10 ** precision;
  let rounded = Math.round(raw * factor) / factor;
  if (rounded >= max && max > min) rounded = Math.round((max - 1 / factor) * factor) / factor;
  return rounded;
}

/** A uniformly chosen element of a non-empty array. */
export function pick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list.');
  return items[randomBelow(items.length)]!;
}

/** A shuffled copy, using Fisher–Yates with unbiased index draws. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ─── Strings ──────────────────────────────────────────────────────────────

/**
 * `length` characters drawn independently and uniformly from `alphabet`.
 *
 * The alphabet is treated as an array of code points, so an alphabet
 * containing astral characters (emoji) still produces whole characters.
 */
export function randomString(length: number, alphabet: string): string {
  const chars = [...alphabet];
  if (chars.length === 0) throw new Error('The alphabet is empty — add at least one character.');
  if (!Number.isInteger(length) || length < 0) {
    throw new Error('Length must be a whole number of zero or more.');
  }
  if (chars.length === 1) return chars[0]!.repeat(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[randomBelow(chars.length)]!;
  return out;
}

/**
 * `length` characters drawn from `alphabet` with no character used twice.
 *
 * Implemented as a partial Fisher–Yates shuffle, which draws uniformly from
 * all permutations rather than retrying on a clash.
 */
export function randomStringNoRepeats(length: number, alphabet: string): string {
  const chars = [...new Set([...alphabet])];
  if (length > chars.length) {
    throw new Error(
      `Cannot build a ${length}-character string with no repeats from only ${chars.length} distinct characters. Shorten it, or add more character types.`,
    );
  }
  const pool = chars.slice();
  let out = '';
  for (let i = 0; i < length; i++) {
    const j = i + randomBelow(pool.length - i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    out += pool[i]!;
  }
  return out;
}

/** A lowercase hex string of `length` characters. */
export function randomHex(length: number): string {
  return randomString(length, '0123456789abcdef');
}

// ─── UUIDs ────────────────────────────────────────────────────────────────

export type UuidVersion = 'v4' | 'v7' | 'nil';

/** The all-zero UUID from RFC 9562 §5.9. Valid, and deliberately meaningless. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Format 16 bytes as the canonical 8-4-4-4-12 hex string. */
function bytesToUuid(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i]!.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

/**
 * A random (version 4) UUID: 122 random bits, with 4 bits pinned to the
 * version and 2 to the RFC 9562 variant.
 *
 * Prefers `crypto.randomUUID()` where it exists — it is the same construction
 * implemented natively — and falls back to setting the version and variant
 * nibbles by hand on 16 random bytes.
 */
export function uuidV4(): string {
  const c = webcrypto();
  if (typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4 in the high nibble of octet 6
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10x in the high bits of octet 8
  return bytesToUuid(bytes);
}

/**
 * A time-ordered (version 7) UUID, per the RFC 9562 §5.7 layout:
 *
 *   48 bits  big-endian Unix time in milliseconds
 *    4 bits  version (0b0111)
 *   12 bits  random  (rand_a)
 *    2 bits  variant (0b10)
 *   62 bits  random  (rand_b)
 *
 * Two v7 values generated in the same millisecond are ordered arbitrarily;
 * across milliseconds they sort lexicographically in creation order, which is
 * the entire point of the version.
 */
export function uuidV7(timestampMs: number = Date.now()): string {
  if (!Number.isFinite(timestampMs) || timestampMs < 0 || timestampMs > 0xff_ffff_ffff_ffff) {
    throw new Error('The timestamp for a v7 UUID must be a Unix time in milliseconds after 1970.');
  }
  const bytes = randomBytes(16);
  const ms = Math.floor(timestampMs);

  // 48-bit timestamp, big-endian, across octets 0-5.
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10x
  return bytesToUuid(bytes);
}

/** Read the 48-bit timestamp back out of a v7 UUID, as Unix milliseconds. */
export function uuidV7Timestamp(uuid: string): number {
  const hex = uuid.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 32) throw new Error('That is not a UUID.');
  if (hex[12]?.toLowerCase() !== '7') throw new Error('Only version 7 UUIDs carry a timestamp.');
  return Number.parseInt(hex.slice(0, 12), 16);
}

export function generateUuid(version: UuidVersion): string {
  if (version === 'nil') return NIL_UUID;
  return version === 'v7' ? uuidV7() : uuidV4();
}

export interface UuidFormat {
  uppercase?: boolean;
  /** Keep the four hyphens. Off gives the 32-character "compact" form. */
  hyphens?: boolean;
  /** Wrap in braces, the form Microsoft tooling and the registry use. */
  braces?: boolean;
  /** Prefix with `urn:uuid:`, the RFC 9562 §4 URN namespace form. */
  urn?: boolean;
}

/**
 * Apply the display options. `urn` wins over `braces` — `urn:uuid:{…}` is not
 * a legal URN, so the two are never combined.
 */
export function formatUuid(uuid: string, fmt: UuidFormat = {}): string {
  let out = fmt.hyphens === false ? uuid.replace(/-/g, '') : uuid;
  if (fmt.uppercase) out = out.toUpperCase();
  if (fmt.urn) return `urn:uuid:${out}`;
  if (fmt.braces) return `{${out}}`;
  return out;
}

/** True for the canonical hyphenated form of any version and variant. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

// ─── Nano ID ──────────────────────────────────────────────────────────────

/**
 * The default Nano ID alphabet: 64 URL-safe characters (A–Z, a–z, 0–9, `_`
 * and `-`), so an ID drops straight into a path segment, a query string or a
 * filename with no escaping.
 */
export const NANO_ID_ALPHABET =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

/** URL-safe Base64 characters in conventional order. */
export const NANO_ID_ALPHABET_SORTED =
  '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/** A Nano ID of `size` characters drawn from `alphabet`. */
export function nanoId(size = 21, alphabet: string = NANO_ID_ALPHABET): string {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Nano ID size must be a whole number of 1 or more.');
  }
  return randomString(size, alphabet);
}

// ─── Entropy and collision maths ──────────────────────────────────────────

/**
 * Shannon entropy in bits for `length` characters drawn independently and
 * uniformly from an alphabet of `alphabetSize`: `length · log₂(alphabetSize)`.
 *
 * This is only the truth when the draws really are uniform and independent —
 * which is exactly what `randomBelow()` guarantees and what a modulo-biased
 * generator would quietly break.
 */
export function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize < 1) throw new Error('The alphabet must contain at least one character.');
  if (length < 0) throw new Error('Length cannot be negative.');
  return length * Math.log2(alphabetSize);
}

/** Entropy when no character may repeat: log₂(N · (N−1) · … · (N−L+1)). */
export function entropyBitsNoRepeats(alphabetSize: number, length: number): number {
  if (length > alphabetSize) {
    throw new Error('A string with no repeats cannot be longer than its alphabet.');
  }
  let bits = 0;
  for (let i = 0; i < length; i++) bits += Math.log2(alphabetSize - i);
  return bits;
}

/** Total number of distinct values an alphabet and length can express. */
export function keyspace(alphabetSize: number, length: number): number {
  return Math.pow(alphabetSize, length);
}

/**
 * Probability that `count` random IDs contain at least one duplicate.
 *
 * The birthday approximation `1 − e^(−n²/2N)` — accurate to well under a
 * percentage point for the n ≪ N region anyone actually cares about.
 */
export function collisionProbability(
  alphabetSize: number,
  length: number,
  count: number,
): number {
  const n = alphabetSize ** length;
  if (!Number.isFinite(n)) return 0;
  return 1 - Math.exp((-count * count) / (2 * n));
}

/**
 * How many IDs you can generate before the chance of any collision reaches
 * `probability` (default 1%).
 *
 * Inverting the birthday bound: n = √(2N · ln(1 / (1 − p))). For the default
 * 21-character Nano ID that is about 1.3 × 10^18 IDs — generate a million a
 * second and you reach a 1% risk after roughly 41,000 years.
 */
export function idsForCollisionProbability(
  alphabetSize: number,
  length: number,
  probability = 0.01,
): number {
  if (probability <= 0 || probability >= 1) {
    throw new Error('The collision probability must be between 0 and 1, exclusive.');
  }
  const n = Math.pow(alphabetSize, length);
  return Math.sqrt(2 * n * Math.log(1 / (1 - probability)));
}

/**
 * Average time to guess a secret of `bits` entropy by brute force.
 *
 * Halved because an attacker expects to find it after searching half the
 * keyspace. The rate is an assumption the caller must state out loud: 10^11
 * guesses per second is a realistic offline figure for a handful of modern
 * GPUs against a fast hash such as unsalted SHA-256. Against a correctly
 * tuned Argon2id it would be nearer 10^4, and against a rate-limited login
 * form nearer 10^1.
 */
export function crackTimeSeconds(bits: number, guessesPerSecond = 1e11): number {
  return Math.pow(2, bits - 1) / guessesPerSecond;
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
const YEAR = 31_557_600; // Julian year, 365.25 days

/** A readable duration for figures that span from microseconds to 10^40 years. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'effectively forever';
  if (seconds < 1e-3) return 'instantly';
  if (seconds < 1) return 'under a second';
  if (seconds < MINUTE) return `${Math.round(seconds)} seconds`;
  if (seconds < HOUR) return `${Math.round(seconds / MINUTE)} minutes`;
  if (seconds < DAY) return `${Math.round(seconds / HOUR)} hours`;
  if (seconds < YEAR) return `${Math.round(seconds / DAY)} days`;

  const years = seconds / YEAR;
  if (years < 1000) return `${Math.round(years).toLocaleString()} years`;
  const scales: [number, string][] = [
    [1e15, 'quadrillion'],
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  for (const [size, name] of scales) {
    if (years >= size && years < size * 1000) {
      return `${(years / size).toFixed(years / size < 10 ? 1 : 0)} ${name} years`;
    }
  }
  return `${years.toExponential(1)} years`;
}

/** Compact named-or-scientific notation for counts that run past 10^18. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1e6) return Math.round(n).toLocaleString();
  const scales: [number, string][] = [
    [1e15, 'quadrillion'],
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
  ];
  for (const [size, name] of scales) {
    if (n >= size && n < size * 1000) return `${(n / size).toFixed(1)} ${name}`;
  }
  const exp = Math.floor(Math.log10(n));
  return `${(n / 10 ** exp).toFixed(1)} × 10^${exp}`;
}

// ─── Character sets ───────────────────────────────────────────────────────

export const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  /** The printable ASCII symbols, minus space and minus backslash and quotes
   *  that break shell and CSV round-trips more often than they help. */
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
  hexLower: '0123456789abcdef',
  hexUpper: '0123456789ABCDEF',
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  urlSafe: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  base58: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
} as const;

/**
 * Characters that look like each other in common UI fonts, and so get
 * transcribed wrongly when a secret is read aloud or copied off a screen.
 * `I l 1 |` and `O 0` are the usual culprits; `5 S` and `2 Z` follow.
 */
export const AMBIGUOUS_CHARS = 'Il1|O0o5S2Z';

/** Drop every character of `remove` from `alphabet`. */
export function stripChars(alphabet: string, remove: string): string {
  const drop = new Set([...remove]);
  return [...alphabet].filter((ch) => !drop.has(ch)).join('');
}

/** Remove duplicate characters, preserving first-seen order. */
export function dedupeChars(alphabet: string): string {
  return [...new Set([...alphabet])].join('');
}

// ─── Passwords ────────────────────────────────────────────────────────────

export interface PasswordOptions {
  length: number;
  lowercase?: boolean;
  uppercase?: boolean;
  digits?: boolean;
  symbols?: boolean;
  /** Drop look-alike characters such as `1`, `l`, `O` and `0`. */
  excludeAmbiguous?: boolean;
  /** Never use the same character twice. Caps the length at the alphabet size. */
  noRepeats?: boolean;
}

/** The exact alphabet a set of options produces, after exclusions. */
export function passwordAlphabet(opts: PasswordOptions): string {
  let alphabet = '';
  if (opts.lowercase !== false) alphabet += CHARSETS.lowercase;
  if (opts.uppercase) alphabet += CHARSETS.uppercase;
  if (opts.digits) alphabet += CHARSETS.digits;
  if (opts.symbols) alphabet += CHARSETS.symbols;
  if (opts.excludeAmbiguous) alphabet = stripChars(alphabet, AMBIGUOUS_CHARS);
  return alphabet;
}

/**
 * The honest entropy of a password built with these options.
 *
 * With repeats allowed this is `length · log₂(alphabet)`. With `noRepeats`
 * the draws are no longer independent, so the correct figure is the log of
 * the number of arrangements — always a little lower, and lower still as the
 * length approaches the alphabet size.
 */
export function passwordEntropyBits(opts: PasswordOptions): number {
  const size = [...new Set([...passwordAlphabet(opts)])].length;
  return opts.noRepeats
    ? entropyBitsNoRepeats(size, opts.length)
    : entropyBits(size, opts.length);
}

/** Generate one password. The value is returned and never stored anywhere. */
export function generatePassword(opts: PasswordOptions): string {
  const alphabet = passwordAlphabet(opts);
  if (alphabet.length === 0) {
    throw new Error('Choose at least one character type before generating a password.');
  }
  if (!Number.isInteger(opts.length) || opts.length < 1) {
    throw new Error('Password length must be a whole number of 1 or more.');
  }
  return opts.noRepeats
    ? randomStringNoRepeats(opts.length, alphabet)
    : randomString(opts.length, alphabet);
}

// ─── Passphrases ──────────────────────────────────────────────────────────

/**
 * A 250-word list of short, common, unambiguous English words.
 *
 * Every word is 3–7 letters, lowercase a–z only, and spelled the same way on
 * both sides of the Atlantic, so a passphrase can be read over a phone and
 * typed on a phone keyboard. 250 words gives log₂(250) ≈ 7.97 bits per word,
 * so a six-word phrase carries about 47.8 bits — deliberately less per word
 * than the EFF's 7,776-word Diceware list (12.9 bits), which is the honest
 * trade for words this short. Use more words to compensate.
 */
export const PASSPHRASE_WORDS: readonly string[] = [
  'able', 'acorn', 'agent', 'album', 'alley', 'amber', 'anchor', 'angle', 'apple', 'apron',
  'arrow', 'aspen', 'atlas', 'bacon', 'badge', 'baker', 'bamboo', 'banjo', 'barley', 'basil',
  'basket', 'beacon', 'bench', 'berry', 'birch', 'bugle', 'cabin', 'cable', 'cactus', 'camel',
  'candle', 'canoe', 'canvas', 'canyon', 'carbon', 'cargo', 'carrot', 'castle', 'cedar', 'cherry',
  'clover', 'dagger', 'daisy', 'dawn', 'decoy', 'delta', 'denim', 'desert', 'diesel', 'dock',
  'dragon', 'dune', 'eagle', 'earth', 'easel', 'echo', 'elbow', 'elder', 'ember', 'engine',
  'estate', 'ether', 'fabric', 'falcon', 'fable', 'farm', 'feather', 'fence', 'fern', 'ferry',
  'fiber', 'field', 'finch', 'fjord', 'flame', 'gadget', 'galaxy', 'garden', 'garlic', 'gate',
  'gauge', 'gecko', 'ginger', 'glide', 'globe', 'glove', 'grain', 'grove', 'hammer', 'hamlet',
  'harbor', 'harvest', 'hazel', 'hedge', 'helm', 'hermit', 'hive', 'hollow', 'honey', 'hornet',
  'hound', 'ice', 'igloo', 'index', 'indigo', 'inlet', 'iron', 'jacket', 'jade', 'jasper',
  'jetty', 'jewel', 'jungle', 'kayak', 'kernel', 'kettle', 'keypad', 'kitten', 'koala', 'ladder',
  'lagoon', 'lamp', 'lantern', 'laurel', 'lava', 'leaf', 'ledge', 'lemon', 'lentil', 'lilac',
  'lobby', 'lotus', 'magnet', 'mango', 'maple', 'marble', 'marsh', 'meadow', 'medal', 'melon',
  'mentor', 'mesa', 'meteor', 'mirror', 'moss', 'needle', 'nectar', 'nest', 'nickel', 'night',
  'noble', 'north', 'nozzle', 'nutmeg', 'oasis', 'oak', 'ocean', 'olive', 'onion', 'opal',
  'orbit', 'otter', 'paddle', 'palace', 'palm', 'panda', 'pantry', 'papaya', 'parade', 'parcel',
  'parsley', 'pasta', 'pastel', 'patio', 'peach', 'pebble', 'quarry', 'quartz', 'quilt', 'rabbit',
  'radar', 'radish', 'raft', 'rail', 'rapid', 'raven', 'ribbon', 'ridge', 'river', 'robin',
  'rocket', 'saddle', 'safari', 'sage', 'sailor', 'salt', 'sandal', 'satin', 'scarf', 'school',
  'seal', 'season', 'shadow', 'shelf', 'shore', 'silver', 'sketch', 'table', 'talon', 'tandem',
  'tango', 'tapir', 'teapot', 'temple', 'tender', 'tent', 'thistle', 'thread', 'timber', 'tiger',
  'toast', 'umber', 'uncle', 'unit', 'urban', 'usher', 'valley', 'vapor', 'velvet', 'vendor',
  'violet', 'vista', 'waffle', 'wagon', 'walnut', 'walrus', 'wander', 'warden', 'water', 'weasel',
  'wheat', 'willow', 'yacht', 'yarn', 'yeast', 'yellow', 'zebra', 'zenith', 'zephyr', 'zigzag',
];

/** Options for assembling a passphrase. */
export interface PassphraseOptions {
  words: number;
  separator?: string;
  /** Capitalise the first letter of each word. Adds zero entropy — it is a
   *  fixed transformation — and exists only to satisfy password policies. */
  capitalize?: boolean;
  /** Append this many random digits. Adds `digits · log₂(10)` bits. */
  appendDigits?: number;
  /** Override the word list, e.g. with a longer Diceware list. */
  wordList?: readonly string[];
}

/** Assemble a passphrase from independently drawn words. */
export function generatePassphrase(opts: PassphraseOptions): string {
  const list = opts.wordList ?? PASSPHRASE_WORDS;
  if (!Number.isInteger(opts.words) || opts.words < 1) {
    throw new Error('A passphrase needs at least one word.');
  }
  if (list.length < 2) throw new Error('The word list is too short to be random.');

  const separator = opts.separator ?? '-';
  const chosen: string[] = [];
  for (let i = 0; i < opts.words; i++) {
    // Drawn with replacement: each word is an independent, uniform choice,
    // which is what makes the entropy figure below exact.
    const word = list[randomBelow(list.length)]!;
    chosen.push(opts.capitalize ? word[0]!.toUpperCase() + word.slice(1) : word);
  }
  let phrase = chosen.join(separator);
  if (opts.appendDigits && opts.appendDigits > 0) {
    phrase += separator + randomString(opts.appendDigits, CHARSETS.digits);
  }
  return phrase;
}

/** Exact entropy of a passphrase: `words · log₂(listSize)` plus any digits. */
export function passphraseEntropyBits(opts: PassphraseOptions): number {
  const list = opts.wordList ?? PASSPHRASE_WORDS;
  const digits = opts.appendDigits ?? 0;
  return opts.words * Math.log2(list.length) + digits * Math.log2(10);
}

// ─── Numbers in bulk ──────────────────────────────────────────────────────

/**
 * `count` distinct integers from `[min, max]`, in random order.
 *
 * Throws when the range cannot supply that many distinct values — silently
 * returning a short list would be worse. Small ranges are drawn by shuffling
 * the whole range; large ones by rejection into a Set, which is far cheaper
 * than materialising 10^9 candidates.
 */
export function uniqueIntegers(min: number, max: number, count: number): number[] {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error('Both the minimum and the maximum must be whole numbers.');
  }
  if (max < min) throw new Error('The maximum must be greater than or equal to the minimum.');
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('The count must be a whole number of zero or more.');
  }
  const span = max - min + 1;
  if (count > span) {
    throw new Error(
      `You asked for ${count.toLocaleString()} unique numbers, but ${min.toLocaleString()} to ${max.toLocaleString()} only contains ${span.toLocaleString()}. Widen the range or lower the count.`,
    );
  }

  // Dense request: shuffle the range itself. Cheap and exactly uniform.
  if (span <= 100_000 && count > span / 8) {
    const all = Array.from({ length: span }, (_, i) => min + i);
    return shuffle(all).slice(0, count);
  }

  const seen = new Set<number>();
  const out: number[] = [];
  while (out.length < count) {
    const v = randomInt(min, max);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export interface NumberDrawOptions {
  min: number;
  max: number;
  count: number;
  /** 0 gives integers; 1–15 gives that many decimal places. */
  precision?: number;
  unique?: boolean;
  sort?: 'none' | 'asc' | 'desc';
}

/**
 * Draw a list of numbers. Integers are inclusive of both bounds; decimals are
 * inclusive of the minimum and exclusive of the maximum, because rounding a
 * half-open interval is the only way to keep every output value equally likely.
 */
export function drawNumbers(opts: NumberDrawOptions): number[] {
  const precision = opts.precision ?? 0;
  if (!Number.isInteger(opts.count) || opts.count < 1) {
    throw new Error('Ask for at least one number.');
  }
  if (opts.count > 100_000) {
    throw new Error('That is more than 100,000 numbers. Lower the count so the page stays responsive.');
  }

  let values: number[];
  if (precision === 0) {
    values = opts.unique
      ? uniqueIntegers(opts.min, opts.max, opts.count)
      : Array.from({ length: opts.count }, () => randomInt(opts.min, opts.max));
  } else {
    if (opts.unique) {
      const steps = Math.round((opts.max - opts.min) * 10 ** precision);
      if (opts.count > steps) {
        throw new Error(
          `At ${precision} decimal place${precision === 1 ? '' : 's'}, the range ${opts.min} to ${opts.max} holds only ${steps.toLocaleString()} distinct values — fewer than the ${opts.count.toLocaleString()} you asked for.`,
        );
      }
      const factor = 10 ** precision;
      values = uniqueIntegers(
        Math.round(opts.min * factor),
        Math.round(opts.max * factor) - 1,
        opts.count,
      ).map((n) => n / factor);
    } else {
      values = Array.from({ length: opts.count }, () =>
        randomDecimal(opts.min, opts.max, precision),
      );
    }
  }

  if (opts.sort === 'asc') values.sort((a, b) => a - b);
  else if (opts.sort === 'desc') values.sort((a, b) => b - a);
  return values;
}

/** Roll `count` dice of `sides` faces each. Both bounds are reachable. */
export function rollDice(count: number, sides: number): number[] {
  if (!Number.isInteger(sides) || sides < 2) {
    throw new Error('A die needs at least 2 faces.');
  }
  if (!Number.isInteger(count) || count < 1) throw new Error('Roll at least one die.');
  return Array.from({ length: count }, () => randomInt(1, sides));
}
