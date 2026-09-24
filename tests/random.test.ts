import { describe, it, expect } from 'vitest';
import {
  randomBytes,
  randomUint32,
  randomBelow,
  randomInt,
  randomFloat,
  randomDecimal,
  randomString,
  randomStringNoRepeats,
  randomHex,
  shuffle,
  pick,
  uuidV4,
  uuidV7,
  uuidV7Timestamp,
  generateUuid,
  formatUuid,
  isUuid,
  NIL_UUID,
  nanoId,
  NANO_ID_ALPHABET,
  entropyBits,
  entropyBitsNoRepeats,
  collisionProbability,
  idsForCollisionProbability,
  crackTimeSeconds,
  formatDuration,
  formatCount,
  CHARSETS,
  AMBIGUOUS_CHARS,
  stripChars,
  dedupeChars,
  passwordAlphabet,
  passwordEntropyBits,
  generatePassword,
  PASSPHRASE_WORDS,
  generatePassphrase,
  passphraseEntropyBits,
  uniqueIntegers,
  drawNumbers,
  rollDice,
} from '~/lib/random';
// Vite's ?raw import: the module's own source, so the ban below is checked
// against what actually ships rather than against behaviour alone.
import randomSource from '~/lib/random.ts?raw';

/** Canonical 8-4-4-4-12 hex with the version and variant nibbles pinned. */
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('the random source', () => {
  it('never uses Math.random anywhere in the module', () => {
    // Strip comments first — the file names Math.random() several times to
    // explain why it is banned, and that prose must not fail the check.
    const code = randomSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).toMatch(/getRandomValues/);
  });

  it('returns the requested number of bytes, including across the 64 KB chunk boundary', () => {
    expect(randomBytes(0)).toHaveLength(0);
    expect(randomBytes(16)).toHaveLength(16);
    expect(randomBytes(70_000)).toHaveLength(70_000);
  });

  it('does not return the same 16 bytes twice', () => {
    const a = [...randomBytes(16)].join(',');
    const b = [...randomBytes(16)].join(',');
    expect(a).not.toBe(b);
  });

  it('rejects a negative byte count', () => {
    expect(() => randomBytes(-1)).toThrow(/whole number/i);
  });

  it('produces 32-bit unsigned integers', () => {
    for (let i = 0; i < 50; i++) {
      const v = randomUint32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffff_ffff);
    }
  });
});

describe('randomBelow — [0, bound), unbiased', () => {
  it('never returns the bound itself', () => {
    for (let i = 0; i < 2000; i++) {
      const v = randomBelow(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it('always returns 0 for a bound of 1', () => {
    expect(randomBelow(1)).toBe(0);
  });

  it('rejects a bound below 1 or a non-integer bound', () => {
    expect(() => randomBelow(0)).toThrow(/1 or more/);
    expect(() => randomBelow(-3)).toThrow(/1 or more/);
    expect(() => randomBelow(2.5)).toThrow(/whole number/);
  });

  it('handles bounds above 2^32 via the BigInt path', () => {
    const bound = 2 ** 40;
    for (let i = 0; i < 200; i++) {
      const v = randomBelow(bound);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(bound);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('reaches every value of a small bound', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(randomBelow(6));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('is flat enough that modulo bias would be visible', () => {
    // Bound 3 does not divide 2^32, so a naive `uint32 % 3` would skew. With
    // 30,000 draws the standard deviation of each bucket is ~82, so a 4%
    // deviation is more than five sigma: flaky only if the generator is wrong.
    const draws = 30_000;
    const counts = [0, 0, 0];
    for (let i = 0; i < draws; i++) counts[randomBelow(3)]!++;
    for (const c of counts) {
      expect(Math.abs(c - draws / 3) / (draws / 3)).toBeLessThan(0.04);
    }
  });
});

describe('randomInt — [min, max], both ends inclusive', () => {
  it('can return both the minimum and the maximum', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(randomInt(1, 6));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(6)).toBe(true);
    expect([...seen].every((v) => v >= 1 && v <= 6)).toBe(true);
  });

  it('handles a single-value range', () => {
    expect(randomInt(7, 7)).toBe(7);
  });

  it('handles negative ranges', () => {
    for (let i = 0; i < 200; i++) {
      const v = randomInt(-10, -5);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThanOrEqual(-5);
    }
  });

  it('refuses an inverted range and non-integers', () => {
    expect(() => randomInt(10, 1)).toThrow(/greater than or equal/);
    expect(() => randomInt(1.5, 10)).toThrow(/whole numbers/);
  });
});

describe('randomFloat and randomDecimal — [min, max)', () => {
  it('stays inside the half-open interval', () => {
    for (let i = 0; i < 2000; i++) {
      const v = randomFloat(0, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('collapses an empty range to its single value', () => {
    expect(randomFloat(3, 3)).toBe(3);
  });

  it('spans the whole range, not just one corner of it', () => {
    let lowHalf = 0;
    for (let i = 0; i < 1000; i++) if (randomFloat(0, 10) < 5) lowHalf++;
    expect(lowHalf).toBeGreaterThan(400);
    expect(lowHalf).toBeLessThan(600);
  });

  it('rounds to the requested number of decimal places', () => {
    for (let i = 0; i < 300; i++) {
      const v = randomDecimal(0, 10, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      const places = (String(v).split('.')[1] ?? '').length;
      expect(places).toBeLessThanOrEqual(2);
    }
  });

  it('rejects an impossible precision', () => {
    expect(() => randomDecimal(0, 1, -1)).toThrow(/between 0 and 15/);
    expect(() => randomDecimal(0, 1, 20)).toThrow(/between 0 and 15/);
  });
});

describe('random strings', () => {
  it('has the requested length and uses only the given alphabet', () => {
    const s = randomString(64, 'abc');
    expect(s).toHaveLength(64);
    expect(/^[abc]{64}$/.test(s)).toBe(true);
  });

  it('handles a length of zero and a one-character alphabet', () => {
    expect(randomString(0, 'abc')).toBe('');
    expect(randomString(5, 'x')).toBe('xxxxx');
  });

  it('refuses an empty alphabet', () => {
    expect(() => randomString(10, '')).toThrow(/alphabet is empty/i);
  });

  it('treats astral characters as single characters', () => {
    const s = randomString(4, '🦊🐻');
    expect([...s]).toHaveLength(4);
  });

  it('produces hex of the right shape', () => {
    expect(/^[0-9a-f]{32}$/.test(randomHex(32))).toBe(true);
  });

  describe('no-repeat mode', () => {
    it('never returns a duplicate character', () => {
      for (let i = 0; i < 200; i++) {
        const s = randomStringNoRepeats(20, CHARSETS.alphanumeric);
        expect(new Set([...s]).size).toBe(20);
      }
    });

    it('can consume the entire alphabet', () => {
      const s = randomStringNoRepeats(26, CHARSETS.lowercase);
      expect([...s].sort().join('')).toBe(CHARSETS.lowercase);
    });

    it('explains when the alphabet is too small', () => {
      expect(() => randomStringNoRepeats(30, CHARSETS.lowercase)).toThrow(
        /only 26 distinct characters/,
      );
    });
  });

  it('shuffles without losing or duplicating elements', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(input);
    expect(out).toHaveLength(50);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input[0]).toBe(0); // the input is not mutated
  });

  it('picks only from the given list and refuses an empty one', () => {
    expect(['a', 'b']).toContain(pick(['a', 'b']));
    expect(() => pick([])).toThrow(/empty/);
  });
});

describe('UUIDs', () => {
  it('generates v4 with the correct version and variant nibbles', () => {
    for (let i = 0; i < 300; i++) {
      const u = uuidV4();
      expect(u).toMatch(uuidRe);
      expect(u[14]).toBe('4'); // version nibble
      expect('89ab').toContain(u[19]!); // variant 10xx
    }
  });

  it('does not repeat a v4', () => {
    const set = new Set(Array.from({ length: 500 }, () => uuidV4()));
    expect(set.size).toBe(500);
  });

  it('generates v7 with the correct version and variant nibbles', () => {
    for (let i = 0; i < 300; i++) {
      const u = uuidV7();
      expect(u).toMatch(uuidRe);
      expect(u[14]).toBe('7');
      expect('89ab').toContain(u[19]!);
    }
  });

  it('embeds the 48-bit millisecond timestamp and reads it back', () => {
    const t = 1_700_000_000_123;
    const u = uuidV7(t);
    expect(uuidV7Timestamp(u)).toBe(t);
    expect(u.slice(0, 8) + u.slice(9, 13)).toBe(t.toString(16).padStart(12, '0'));
  });

  it('sorts v7 values lexicographically in creation order', () => {
    const times = [1_600_000_000_000, 1_700_000_000_000, 1_800_000_000_000];
    const ids = times.map((t) => uuidV7(t));
    expect([...ids].sort()).toEqual(ids);
    expect([...ids].reverse().sort()).toEqual(ids);
  });

  it('rejects an impossible v7 timestamp', () => {
    expect(() => uuidV7(-1)).toThrow(/Unix time/);
    expect(() => uuidV7(2 ** 60)).toThrow(/Unix time/);
  });

  it('exposes the nil UUID exactly as RFC 9562 defines it', () => {
    expect(NIL_UUID).toBe('00000000-0000-0000-0000-000000000000');
    expect(NIL_UUID).toMatch(uuidRe);
    expect(generateUuid('nil')).toBe(NIL_UUID);
  });

  it('dispatches by version', () => {
    expect(generateUuid('v4')[14]).toBe('4');
    expect(generateUuid('v7')[14]).toBe('7');
  });

  it('recognises canonical UUIDs and rejects near-misses', () => {
    expect(isUuid(uuidV4())).toBe(true);
    expect(isUuid(uuidV4().toUpperCase())).toBe(true);
    expect(isUuid(uuidV4().replace(/-/g, ''))).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  describe('formatting', () => {
    const u = '0189d6d2-8d2f-7c4a-9f1e-2b3c4d5e6f70';

    it('leaves the canonical form alone by default', () => {
      expect(formatUuid(u)).toBe(u);
    });

    it('uppercases', () => {
      expect(formatUuid(u, { uppercase: true })).toBe(u.toUpperCase());
    });

    it('removes hyphens', () => {
      const compact = formatUuid(u, { hyphens: false });
      expect(compact).toBe('0189d6d28d2f7c4a9f1e2b3c4d5e6f70');
      expect(compact).toHaveLength(32);
    });

    it('adds braces and the URN prefix, with URN winning', () => {
      expect(formatUuid(u, { braces: true })).toBe(`{${u}}`);
      expect(formatUuid(u, { urn: true })).toBe(`urn:uuid:${u}`);
      expect(formatUuid(u, { urn: true, braces: true })).toBe(`urn:uuid:${u}`);
    });

    it('combines options', () => {
      expect(formatUuid(u, { uppercase: true, hyphens: false, braces: true })).toBe(
        '{0189D6D28D2F7C4A9F1E2B3C4D5E6F70}',
      );
    });
  });
});

describe('Nano ID', () => {
  it('defaults to 21 characters from the 64-character URL-safe alphabet', () => {
    expect(NANO_ID_ALPHABET).toHaveLength(64);
    expect(new Set([...NANO_ID_ALPHABET]).size).toBe(64);
    const id = nanoId();
    expect(id).toHaveLength(21);
    expect(/^[A-Za-z0-9_-]{21}$/.test(id)).toBe(true);
  });

  it('honours a custom size and alphabet', () => {
    const id = nanoId(10, '0123456789');
    expect(id).toHaveLength(10);
    expect(/^\d{10}$/.test(id)).toBe(true);
  });

  it('refuses a size below 1', () => {
    expect(() => nanoId(0)).toThrow(/1 or more/);
  });

  it('does not collide over a modest sample', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => nanoId()));
    expect(ids.size).toBe(2000);
  });
});

describe('entropy and collision maths', () => {
  it('computes log2 entropy exactly for clean cases', () => {
    expect(entropyBits(2, 8)).toBe(8);
    expect(entropyBits(16, 8)).toBe(32);
    expect(entropyBits(64, 21)).toBeCloseTo(126, 10);
    expect(entropyBits(95, 0)).toBe(0);
  });

  it('matches the hand-computed value for a 94-character password set', () => {
    expect(entropyBits(94, 16)).toBeCloseTo(16 * Math.log2(94), 10);
    expect(entropyBits(94, 16)).toBeCloseTo(104.87, 2);
  });

  it('rejects a degenerate alphabet', () => {
    expect(() => entropyBits(0, 10)).toThrow(/at least one character/);
  });

  it('computes permutation entropy when repeats are banned', () => {
    // 10 · 9 · 8 = 720 arrangements.
    expect(entropyBitsNoRepeats(10, 3)).toBeCloseTo(Math.log2(720), 10);
    // Using the whole alphabet is log2(N!).
    expect(entropyBitsNoRepeats(5, 5)).toBeCloseTo(Math.log2(120), 10);
    // Always strictly lower than the with-repeats figure beyond one character.
    expect(entropyBitsNoRepeats(62, 12)).toBeLessThan(entropyBits(62, 12));
    expect(entropyBitsNoRepeats(62, 1)).toBeCloseTo(entropyBits(62, 1), 10);
  });

  it('refuses a no-repeat string longer than its alphabet', () => {
    expect(() => entropyBitsNoRepeats(10, 11)).toThrow(/cannot be longer/);
  });

  it('inverts the birthday bound consistently with the forward formula', () => {
    const n = idsForCollisionProbability(64, 21, 0.01);
    expect(collisionProbability(64, 21, n)).toBeCloseTo(0.01, 6);

    const m = idsForCollisionProbability(36, 8, 0.5);
    expect(collisionProbability(36, 8, m)).toBeCloseTo(0.5, 6);
  });

  it('reproduces the published Nano ID figure for the 21-character default', () => {
    // √(2 · 64^21 · ln(1/0.99)) ≈ 1.3 × 10^18 IDs — generated a million a
    // second, that is on the order of 40,000 years to a 1% collision risk.
    const n = idsForCollisionProbability(64, 21, 0.01);
    expect(n).toBeGreaterThan(1.2e18);
    expect(n).toBeLessThan(1.4e18);
    expect(n / 1e6 / 31_557_600 / 1000).toBeCloseTo(41, 0);
  });

  it('needs far fewer IDs to collide as the length drops', () => {
    const short = idsForCollisionProbability(64, 8, 0.01);
    const long = idsForCollisionProbability(64, 16, 0.01);
    expect(short).toBeLessThan(long);
    // Eight characters of a 64-character alphabet is only 48 bits: a 1% risk
    // arrives in the low tens of millions of IDs.
    expect(short).toBeGreaterThan(1e6);
    expect(short).toBeLessThan(1e8);
  });

  it('rejects a probability outside (0, 1)', () => {
    expect(() => idsForCollisionProbability(64, 21, 0)).toThrow(/between 0 and 1/);
    expect(() => idsForCollisionProbability(64, 21, 1)).toThrow(/between 0 and 1/);
  });

  it('gives a collision probability that rises with the number of IDs', () => {
    const a = collisionProbability(10, 4, 10);
    const b = collisionProbability(10, 4, 1000);
    expect(a).toBeLessThan(b);
    expect(b).toBeGreaterThan(0.99);
    expect(collisionProbability(64, 21, 1000)).toBeLessThan(1e-30);
  });

  it('halves the keyspace for the average crack time', () => {
    expect(crackTimeSeconds(1, 1)).toBe(1);
    expect(crackTimeSeconds(41, 1e11)).toBeCloseTo(2 ** 40 / 1e11, 10);
    // 128 bits at 10^11 guesses/sec is far beyond the age of the universe.
    expect(crackTimeSeconds(128) / 31_557_600).toBeGreaterThan(1e19);
  });

  it('formats durations across the whole range', () => {
    expect(formatDuration(0)).toBe('instantly');
    expect(formatDuration(0.5)).toBe('under a second');
    expect(formatDuration(30)).toBe('30 seconds');
    expect(formatDuration(600)).toBe('10 minutes');
    expect(formatDuration(7200)).toBe('2 hours');
    expect(formatDuration(86_400 * 3)).toBe('3 days');
    expect(formatDuration(31_557_600 * 5)).toBe('5 years');
    expect(formatDuration(31_557_600 * 5000)).toMatch(/thousand years/);
    expect(formatDuration(31_557_600 * 3e9)).toMatch(/billion years/);
    expect(formatDuration(Infinity)).toBe('effectively forever');
  });

  it('formats large counts by name, then by exponent', () => {
    expect(formatCount(42)).toBe('42');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount(2.4e6)).toBe('2.4 million');
    expect(formatCount(1.2e8)).toBe('120.0 million');
    expect(formatCount(5e14)).toBe('500.0 trillion');
    expect(formatCount(1.3077e18)).toBe('1.3 × 10^18');
    expect(formatCount(Infinity)).toBe('∞');
  });
});

describe('character sets', () => {
  it('has the sizes the entropy figures depend on', () => {
    expect(CHARSETS.lowercase).toHaveLength(26);
    expect(CHARSETS.uppercase).toHaveLength(26);
    expect(CHARSETS.digits).toHaveLength(10);
    expect(CHARSETS.alphanumeric).toHaveLength(62);
    expect(CHARSETS.urlSafe).toHaveLength(64);
    expect(CHARSETS.base58).toHaveLength(58);
  });

  it('keeps base58 free of the characters it exists to avoid', () => {
    for (const ch of '0OIl') expect(CHARSETS.base58).not.toContain(ch);
  });

  it('strips and dedupes', () => {
    expect(stripChars('abcdef', 'ace')).toBe('bdf');
    expect(dedupeChars('aabbcc')).toBe('abc');
    expect(stripChars(CHARSETS.digits, AMBIGUOUS_CHARS)).toBe('346789');
  });
});

describe('passwords', () => {
  it('builds the alphabet from the selected classes only', () => {
    expect(passwordAlphabet({ length: 1 })).toBe(CHARSETS.lowercase);
    expect(passwordAlphabet({ length: 1, uppercase: true, digits: true })).toHaveLength(62);
    expect(
      passwordAlphabet({ length: 1, uppercase: true, digits: true, symbols: true }),
    ).toHaveLength(62 + CHARSETS.symbols.length);
  });

  it('drops look-alike characters when asked', () => {
    const alphabet = passwordAlphabet({
      length: 1,
      uppercase: true,
      digits: true,
      excludeAmbiguous: true,
    });
    for (const ch of AMBIGUOUS_CHARS) expect(alphabet).not.toContain(ch);
    expect(alphabet.length).toBeLessThan(62);
  });

  it('generates a password of the requested length from that alphabet', () => {
    const opts = { length: 24, uppercase: true, digits: true, symbols: true };
    const alphabet = new Set([...passwordAlphabet(opts)]);
    for (let i = 0; i < 100; i++) {
      const pw = generatePassword(opts);
      expect(pw).toHaveLength(24);
      for (const ch of pw) expect(alphabet.has(ch)).toBe(true);
    }
  });

  it('honours no-repeats', () => {
    const pw = generatePassword({ length: 30, uppercase: true, digits: true, noRepeats: true });
    expect(new Set([...pw]).size).toBe(30);
  });

  it('never returns the same password twice in a batch', () => {
    const set = new Set(
      Array.from({ length: 200 }, () =>
        generatePassword({ length: 16, uppercase: true, digits: true }),
      ),
    );
    expect(set.size).toBe(200);
  });

  it('refuses an empty class selection and a zero length', () => {
    expect(() => generatePassword({ length: 10, lowercase: false })).toThrow(
      /at least one character type/,
    );
    expect(() => generatePassword({ length: 0 })).toThrow(/1 or more/);
  });

  it('reports entropy that matches the alphabet actually used', () => {
    expect(passwordEntropyBits({ length: 16, uppercase: true, digits: true })).toBeCloseTo(
      16 * Math.log2(62),
      10,
    );
    expect(passwordEntropyBits({ length: 12 })).toBeCloseTo(12 * Math.log2(26), 10);
    expect(
      passwordEntropyBits({ length: 20, uppercase: true, digits: true, noRepeats: true }),
    ).toBeCloseTo(entropyBitsNoRepeats(62, 20), 10);
  });

  it('reports lower entropy once ambiguous characters are removed', () => {
    const plain = passwordEntropyBits({ length: 16, uppercase: true, digits: true });
    const filtered = passwordEntropyBits({
      length: 16,
      uppercase: true,
      digits: true,
      excludeAmbiguous: true,
    });
    expect(filtered).toBeLessThan(plain);
  });
});

describe('passphrases', () => {
  it('ships 250 unique short lowercase words', () => {
    expect(PASSPHRASE_WORDS).toHaveLength(250);
    expect(new Set(PASSPHRASE_WORDS).size).toBe(250);
    for (const w of PASSPHRASE_WORDS) {
      expect(w).toMatch(/^[a-z]{3,7}$/);
    }
  });

  it('assembles the requested number of words with the chosen separator', () => {
    const phrase = generatePassphrase({ words: 5, separator: '.' });
    expect(phrase.split('.')).toHaveLength(5);
    for (const w of phrase.split('.')) expect(PASSPHRASE_WORDS).toContain(w);
  });

  it('capitalises each word without changing the underlying words', () => {
    const phrase = generatePassphrase({ words: 4, separator: '-', capitalize: true });
    const parts = phrase.split('-');
    expect(parts).toHaveLength(4);
    for (const p of parts) {
      expect(p[0]).toBe(p[0]!.toUpperCase());
      expect(PASSPHRASE_WORDS).toContain(p.toLowerCase());
    }
  });

  it('appends the requested digits', () => {
    const phrase = generatePassphrase({ words: 3, separator: '-', appendDigits: 4 });
    const parts = phrase.split('-');
    expect(parts).toHaveLength(4);
    expect(parts[3]).toMatch(/^\d{4}$/);
  });

  it('refuses a zero-word phrase', () => {
    expect(() => generatePassphrase({ words: 0 })).toThrow(/at least one word/);
  });

  it('computes entropy as words × log2(list size)', () => {
    expect(passphraseEntropyBits({ words: 6 })).toBeCloseTo(6 * Math.log2(250), 10);
    expect(passphraseEntropyBits({ words: 6 })).toBeCloseTo(47.79, 2);
    expect(passphraseEntropyBits({ words: 6, appendDigits: 2 })).toBeCloseTo(
      6 * Math.log2(250) + 2 * Math.log2(10),
      10,
    );
    // Capitalisation is a fixed transformation and must add nothing.
    expect(passphraseEntropyBits({ words: 6, capitalize: true })).toBeCloseTo(
      passphraseEntropyBits({ words: 6 }),
      10,
    );
  });

  it('accepts a longer custom word list and scores it higher', () => {
    const list = Array.from({ length: 7776 }, (_, i) => `w${i}`);
    expect(passphraseEntropyBits({ words: 6, wordList: list })).toBeCloseTo(77.5, 1);
    const phrase = generatePassphrase({ words: 6, wordList: list });
    expect(phrase.split('-')).toHaveLength(6);
  });
});

describe('unique integers', () => {
  it('returns distinct values inside the range', () => {
    const out = uniqueIntegers(1, 49, 6);
    expect(out).toHaveLength(6);
    expect(new Set(out).size).toBe(6);
    expect(out.every((n) => n >= 1 && n <= 49)).toBe(true);
  });

  it('returns a permutation when the count equals the range', () => {
    const out = uniqueIntegers(1, 10, 10);
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('never returns duplicates over many runs of a tight range', () => {
    for (let i = 0; i < 300; i++) {
      const out = uniqueIntegers(1, 12, 12);
      expect(new Set(out).size).toBe(12);
    }
  });

  it('works on a sparse range via the rejection path', () => {
    const out = uniqueIntegers(1, 1_000_000_000, 50);
    expect(new Set(out).size).toBe(50);
  });

  it('explains when the range cannot supply that many values', () => {
    expect(() => uniqueIntegers(1, 5, 10)).toThrow(/only contains 5/);
    expect(() => uniqueIntegers(1, 5, 10)).toThrow(/Widen the range/);
  });

  it('rejects an inverted range', () => {
    expect(() => uniqueIntegers(10, 1, 2)).toThrow(/greater than or equal/);
  });
});

describe('drawNumbers', () => {
  it('draws integers inclusive of both bounds', () => {
    const out = drawNumbers({ min: 1, max: 6, count: 500 });
    expect(out).toHaveLength(500);
    expect(out.every(Number.isInteger)).toBe(true);
    expect(Math.min(...out)).toBe(1);
    expect(Math.max(...out)).toBe(6);
  });

  it('honours unique mode', () => {
    const out = drawNumbers({ min: 1, max: 100, count: 40, unique: true });
    expect(new Set(out).size).toBe(40);
  });

  it('sorts ascending and descending on request', () => {
    const asc = drawNumbers({ min: 1, max: 1000, count: 50, sort: 'asc' });
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = drawNumbers({ min: 1, max: 1000, count: 50, sort: 'desc' });
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it('produces decimals with the requested precision', () => {
    const out = drawNumbers({ min: 0, max: 1, count: 100, precision: 3 });
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect((String(v).split('.')[1] ?? '').length).toBeLessThanOrEqual(3);
    }
  });

  it('keeps decimals unique when asked', () => {
    const out = drawNumbers({ min: 0, max: 1, count: 100, precision: 3, unique: true });
    expect(new Set(out).size).toBe(100);
  });

  it('explains when a decimal range holds too few distinct values', () => {
    expect(() =>
      drawNumbers({ min: 0, max: 1, count: 50, precision: 1, unique: true }),
    ).toThrow(/only 10 distinct values/);
  });

  it('refuses a zero count and an oversized batch', () => {
    expect(() => drawNumbers({ min: 1, max: 10, count: 0 })).toThrow(/at least one/);
    expect(() => drawNumbers({ min: 1, max: 10, count: 200_000 })).toThrow(/100,000/);
  });
});

describe('dice', () => {
  it('rolls within 1..sides and reaches both ends', () => {
    const rolls = rollDice(600, 20);
    expect(rolls).toHaveLength(600);
    expect(Math.min(...rolls)).toBe(1);
    expect(Math.max(...rolls)).toBe(20);
  });

  it('refuses a one-sided die or a zero-dice roll', () => {
    expect(() => rollDice(1, 1)).toThrow(/at least 2 faces/);
    expect(() => rollDice(0, 6)).toThrow(/at least one die/);
  });
});
