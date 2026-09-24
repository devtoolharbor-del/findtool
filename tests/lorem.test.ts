import { describe, it, expect } from 'vitest';
import {
  LOREM_WORDS,
  LOREM_OPENING_WORDS,
  loremWords,
  loremSentence,
  loremParagraph,
  loremListItem,
  generateLorem,
  loremStats,
  type Rng,
} from '~/lib/lorem';

/** A deterministic stand-in for the crypto source, so output is reproducible. */
function seeded(seed = 1): Rng {
  let state = seed >>> 0 || 1;
  return (bound: number) => {
    // xorshift32 — fine for a test double, never used in the shipped code.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state % bound;
  };
}

const wordSet = new Set(LOREM_WORDS);

function plainWords(text: string): string[] {
  return text
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

describe('the word pool', () => {
  it('is a decent-sized pool of unique lowercase Latin words', () => {
    expect(LOREM_WORDS.length).toBeGreaterThan(150);
    expect(new Set(LOREM_WORDS).size).toBe(LOREM_WORDS.length);
    for (const w of LOREM_WORDS) expect(w).toMatch(/^[a-z]+$/);
  });

  it('opens with the passage everyone recognises', () => {
    expect(LOREM_OPENING_WORDS.join(' ')).toBe(
      'lorem ipsum dolor sit amet consectetur adipiscing elit',
    );
    for (const w of LOREM_OPENING_WORDS) expect(wordSet.has(w)).toBe(true);
  });
});

describe('loremWords', () => {
  it('returns exactly the requested number of words from the pool', () => {
    const words = loremWords(40, { rng: seeded(7) });
    expect(words).toHaveLength(40);
    for (const w of words) expect(wordSet.has(w)).toBe(true);
  });

  it('returns nothing for zero and rejects a negative count', () => {
    expect(loremWords(0)).toEqual([]);
    expect(() => loremWords(-1)).toThrow(/whole number/);
  });

  it('lays down the canonical opening first when asked', () => {
    const words = loremWords(12, { rng: seeded(3), startWithLorem: true });
    expect(words.slice(0, 8)).toEqual([...LOREM_OPENING_WORDS]);
    expect(words).toHaveLength(12);
  });

  it('truncates the opening rather than overshooting a small count', () => {
    expect(loremWords(3, { startWithLorem: true })).toEqual(['lorem', 'ipsum', 'dolor']);
  });

  it('does not start with the opening unless asked', () => {
    // With a fixed seed this is deterministic, so no flakiness.
    expect(loremWords(8, { rng: seeded(11) }).join(' ')).not.toBe(
      LOREM_OPENING_WORDS.join(' '),
    );
  });
});

describe('sentences and paragraphs', () => {
  it('capitalises the first word and ends with a full stop', () => {
    const s = loremSentence({ rng: seeded(5) });
    expect(s[0]).toBe(s[0]!.toUpperCase());
    expect(s.endsWith('.')).toBe(true);
    expect(s.slice(0, -1)).not.toContain('.');
  });

  it('keeps sentence length inside the documented 6–16 words', () => {
    const rng = seeded(21);
    for (let i = 0; i < 200; i++) {
      const n = plainWords(loremSentence({ rng })).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(16);
    }
  });

  it('varies sentence length rather than emitting one fixed size', () => {
    const rng = seeded(99);
    const lengths = new Set(
      Array.from({ length: 60 }, () => plainWords(loremSentence({ rng })).length),
    );
    expect(lengths.size).toBeGreaterThan(3);
  });

  it('places any comma inside the sentence, never against the full stop', () => {
    const rng = seeded(1234);
    for (let i = 0; i < 300; i++) {
      const s = loremSentence({ rng });
      expect(s).not.toMatch(/,\s*\./);
      expect(s).not.toMatch(/^[A-Z][a-z]*,/); // never immediately after word one
      expect(s).not.toMatch(/,,/);
    }
  });

  it('starts a sentence with the canonical opening when asked', () => {
    const s = loremSentence({ rng: seeded(2), startWithLorem: true });
    expect(s.toLowerCase().startsWith('lorem ipsum dolor sit amet')).toBe(true);
  });

  it('builds paragraphs of 3–6 sentences', () => {
    const rng = seeded(64);
    for (let i = 0; i < 80; i++) {
      const p = loremParagraph({ rng });
      const sentences = (p.match(/\./g) ?? []).length;
      expect(sentences).toBeGreaterThanOrEqual(3);
      expect(sentences).toBeLessThanOrEqual(6);
    }
  });

  it('keeps list items short', () => {
    const rng = seeded(8);
    for (let i = 0; i < 100; i++) {
      const n = plainWords(loremListItem({ rng })).length;
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
});

describe('generateLorem — plain text', () => {
  it('separates paragraphs with a blank line', () => {
    const out = generateLorem({ unit: 'paragraphs', count: 3, rng: seeded(4) });
    const paras = out.split('\n\n');
    expect(paras).toHaveLength(3);
    for (const p of paras) expect(p.endsWith('.')).toBe(true);
  });

  it('emits exactly the requested number of words', () => {
    const out = generateLorem({ unit: 'words', count: 25, rng: seeded(6) });
    expect(plainWords(out)).toHaveLength(25);
    expect(out.endsWith('.')).toBe(true);
  });

  it('emits exactly the requested number of sentences on one line', () => {
    const out = generateLorem({ unit: 'sentences', count: 5, rng: seeded(9) });
    expect((out.match(/\./g) ?? []).length).toBe(5);
    expect(out).not.toContain('\n');
  });

  it('emits one list item per line', () => {
    const out = generateLorem({ unit: 'list-items', count: 4, rng: seeded(10) });
    const lines = out.split('\n');
    expect(lines).toHaveLength(4);
    for (const l of lines) expect(l.endsWith('.')).toBe(true);
  });

  it('honours the start-with-Lorem toggle on the first block only', () => {
    const out = generateLorem({
      unit: 'paragraphs',
      count: 3,
      startWithLorem: true,
      rng: seeded(12),
    });
    expect(out.startsWith('Lorem ipsum dolor sit amet')).toBe(true);
    const occurrences = (out.match(/Lorem ipsum dolor sit amet/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('does not start with Lorem when the toggle is off', () => {
    const out = generateLorem({ unit: 'paragraphs', count: 2, rng: seeded(13) });
    expect(out.startsWith('Lorem ipsum dolor sit amet')).toBe(false);
  });

  it('is reproducible for a given seed and different across seeds', () => {
    const a = generateLorem({ unit: 'paragraphs', count: 2, rng: seeded(42) });
    const b = generateLorem({ unit: 'paragraphs', count: 2, rng: seeded(42) });
    const c = generateLorem({ unit: 'paragraphs', count: 2, rng: seeded(43) });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('works with the real crypto source when no rng is injected', () => {
    const out = generateLorem({ unit: 'sentences', count: 2 });
    expect((out.match(/\./g) ?? []).length).toBe(2);
    for (const w of plainWords(out)) expect(wordSet.has(w)).toBe(true);
  });
});

describe('generateLorem — HTML', () => {
  it('wraps each paragraph in a <p> tag, one per line', () => {
    const out = generateLorem({ unit: 'paragraphs', count: 2, format: 'html', rng: seeded(14) });
    const lines = out.split('\n');
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l).toMatch(/^<p>.*<\/p>$/);
  });

  it('wraps list items in <li> inside a <ul>', () => {
    const out = generateLorem({ unit: 'list-items', count: 3, format: 'html', rng: seeded(15) });
    expect(out.startsWith('<ul>\n')).toBe(true);
    expect(out.endsWith('\n</ul>')).toBe(true);
    expect((out.match(/<li>/g) ?? []).length).toBe(3);
    expect((out.match(/<\/li>/g) ?? []).length).toBe(3);
    expect(out).toMatch(/\n {2}<li>/);
  });

  it('accepts an explicit heading tag', () => {
    const out = generateLorem({
      unit: 'sentences',
      count: 1,
      format: 'html',
      tag: 'h2',
      rng: seeded(16),
    });
    expect(out).toMatch(/^<h2>.*<\/h2>$/);
  });

  it('contains nothing that needs escaping', () => {
    const out = generateLorem({ unit: 'paragraphs', count: 5, format: 'html', rng: seeded(17) });
    expect(out.replace(/<\/?p>/g, '')).toMatch(/^[A-Za-z ,.\n]+$/);
  });
});

describe('limits and errors', () => {
  it('refuses a count below one', () => {
    expect(() => generateLorem({ unit: 'words', count: 0 })).toThrow(/at least one/);
    expect(() => generateLorem({ unit: 'paragraphs', count: 1.5 })).toThrow(/at least one/);
  });

  it('caps paragraphs at 500 and words at 5,000', () => {
    expect(() => generateLorem({ unit: 'paragraphs', count: 501 })).toThrow(/limit of 500/);
    expect(() => generateLorem({ unit: 'words', count: 5001 })).toThrow(/limit of 5,000/);
    expect(() => generateLorem({ unit: 'words', count: 5000, rng: seeded(1) })).not.toThrow();
  });

  it('names the unit in the limit message', () => {
    expect(() => generateLorem({ unit: 'list-items', count: 900 })).toThrow(/list items/);
  });

  it('rejects an unknown unit', () => {
    expect(() =>
      generateLorem({ unit: 'chapters' as unknown as 'words', count: 2 }),
    ).toThrow(/paragraphs, sentences, words or list items/);
  });
});

describe('loremStats', () => {
  it('counts words, sentences and characters in plain text', () => {
    const stats = loremStats('Lorem ipsum dolor. Sit amet.');
    expect(stats.words).toBe(5);
    expect(stats.sentences).toBe(2);
    expect(stats.characters).toBe(28);
  });

  it('ignores tags when counting words', () => {
    const stats = loremStats('<p>Lorem ipsum dolor sit.</p>');
    expect(stats.words).toBe(4);
    expect(stats.sentences).toBe(1);
  });

  it('handles an empty string', () => {
    expect(loremStats('')).toEqual({ words: 0, sentences: 0, characters: 0 });
  });
});
