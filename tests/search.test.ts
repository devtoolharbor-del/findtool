import { describe, it, expect } from 'vitest';
import { search, normalize, highlight, editDistanceWithin, type SearchEntry } from '~/lib/search';
import { TOOLS } from '~/data/tools';
import { CATEGORY_MAP } from '~/data/categories';

/** Build the real index exactly as src/pages/search.json.ts does. */
const index: SearchEntry[] = TOOLS.map((t) => ({
  s: t.slug,
  n: t.name,
  d: t.description,
  c: CATEGORY_MAP[t.category]?.shortName ?? '',
  cs: t.category,
  k: [...t.keywords, ...t.aliases, t.category].join(' ').toLowerCase(),
  i: t.icon,
}));

const topSlug = (query: string) => search(query, index, 5)[0]?.entry.s;
const slugsFor = (query: string) => search(query, index, 10).map((h) => h.entry.s);

describe('normalize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalize('JSON-Formatter!')).toBe('json formatter');
  });
  it('collapses whitespace', () => {
    expect(normalize('  a   b  ')).toBe('a b');
  });
});

describe('the queries from the brief', () => {
  // These five are called out explicitly in the project requirements.
  it('"json" finds JSON tools first', () => {
    expect(slugsFor('json')[0]).toMatch(/^json-/);
  });
  it('"jwt" finds the JWT decoder', () => {
    expect(topSlug('jwt')).toBe('jwt-decoder');
  });
  it('"base64" finds a Base64 tool', () => {
    expect(topSlug('base64')).toMatch(/^base64-/);
  });
  it('"timestamp" finds a timestamp tool', () => {
    expect(topSlug('timestamp')).toMatch(/timestamp/);
  });
  it('"uuid" finds the UUID generator', () => {
    expect(topSlug('uuid')).toBe('uuid-generator');
  });
});

describe('partial matches', () => {
  it.each([
    ['js', 'json'],
    ['form', 'formatter'],
    ['gen', 'generator'],
    ['conv', 'convert'],
  ])('"%s" returns results', (query) => {
    expect(search(query, index, 5).length).toBeGreaterThan(0);
  });

  it('matches a prefix of a later word in the name', () => {
    expect(slugsFor('decoder')).toContain('jwt-decoder');
  });
});

describe('aliases and synonyms', () => {
  it.each([
    ['b64', /^base64-/],
    ['guid', /^uuid-/],
    ['epoch', /timestamp/],
    ['crontab', /^cron-/],
    ['regexp', /^regex-/],
    ['slugify', /slug|case/],
    ['dedupe', /duplicate/],
    ['nbsp', /entit|space/],
    ['wordcount', /word-counter/],
    ['k8s', /yaml/],
  ])('alias "%s" resolves to the right tool', (query, pattern) => {
    const top = topSlug(query);
    expect(top, `query "${query}" returned "${top}"`).toMatch(pattern);
  });
});

describe('ranking', () => {
  it('prefers a name match over a description mention', () => {
    // Several tools mention JSON in their prose; the JSON tools must win.
    const top3 = slugsFor('json').slice(0, 3);
    expect(top3.every((s) => s.includes('json'))).toBe(true);
  });

  it('treats multiple words as AND, not OR', () => {
    const hits = slugsFor('json csv');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((s) => s.includes('json') || s.includes('csv'))).toBe(true);
    // A pure YAML tool should not survive an AND on json + csv.
    expect(hits).not.toContain('yaml-to-json');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(search('zzzzqqqq', index, 5)).toHaveLength(0);
  });

  it('returns nothing for an empty query', () => {
    expect(search('   ', index, 5)).toHaveLength(0);
  });

  it('respects the limit', () => {
    expect(search('e', index, 3).length).toBeLessThanOrEqual(3);
  });
});

describe('index integrity', () => {
  it('covers every tool', () => {
    expect(index).toHaveLength(TOOLS.length);
  });

  it('gives every tool a reachable search term', () => {
    for (const tool of TOOLS) {
      const hits = slugsFor(tool.name.toLowerCase());
      expect(hits, `"${tool.name}" is not findable by its own name`).toContain(tool.slug);
    }
  });

  it('has no duplicate slugs', () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('highlight', () => {
  it('wraps the match in a mark element', () => {
    expect(highlight('JSON Formatter', 'json')).toContain('<mark class="bc-match">JSON</mark>');
  });

  it('escapes HTML in the source text', () => {
    expect(highlight('<script>', 'script')).not.toContain('<script>');
  });

  it('returns escaped text when there is no match', () => {
    expect(highlight('Word Counter', 'zzz')).toBe('Word Counter');
  });
});

describe('typo tolerance', () => {
  it.each([
    ['jsno', /json/],
    ['bas64', /base64/],
    ['formater', /formatter|format/],
    ['generater', /generator/],
    ['timestmap', /timestamp/],
    ['convertor', /converter/],
    ['regexp tester', /regex/],
  ])('"%s" still finds the right tool', (query, pattern) => {
    const top = topSlug(query);
    expect(top, `query "${query}" returned "${top}"`).toMatch(pattern);
  });

  it('does not let a corrected match outrank an exact one', () => {
    // "css" is a real tool token; it must not be displaced by "csv".
    expect(topSlug('css')).toContain('css');
    expect(topSlug('csv')).toContain('csv');
  });

  it('refuses to correct very short tokens', () => {
    // At three characters a single edit reaches too many unrelated words.
    const hits = search('zzz', index, 5);
    expect(hits).toHaveLength(0);
  });

  it('still returns nothing for genuine nonsense', () => {
    expect(search('qwertyuiopasdf', index, 5)).toHaveLength(0);
  });

  it('exact results are never diluted by fuzzy ones', () => {
    const hits = search('json', index, 10);
    expect(hits.every((h) => h.entry.s.includes('json') || h.entry.k.includes('json'))).toBe(true);
  });
});

describe('editDistanceWithin', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistanceWithin('json', 'json', 2)).toBe(0);
  });
  it('counts a substitution, insertion and deletion as one each', () => {
    expect(editDistanceWithin('json', 'jsan', 2)).toBe(1);
    expect(editDistanceWithin('json', 'jsons', 2)).toBe(1);
    expect(editDistanceWithin('json', 'jsn', 2)).toBe(1);
  });
  it('counts an adjacent transposition as a single edit', () => {
    // Optimal string alignment, not plain Levenshtein: a neighbour swap is
    // the commonest typo and must fit inside a short word's budget of one.
    expect(editDistanceWithin('jsno', 'json', 2)).toBe(1);
    expect(editDistanceWithin('teh', 'the', 2)).toBe(1);
  });
  it('bails out past the budget rather than computing the true distance', () => {
    expect(editDistanceWithin('abcdefgh', 'zzzzzzzz', 2)).toBeGreaterThan(2);
  });
  it('rejects on length difference immediately', () => {
    expect(editDistanceWithin('a', 'abcdefghij', 2)).toBeGreaterThan(2);
  });
});
