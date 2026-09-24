import { describe, expect, it } from 'vitest';
import { slugify, slugifyLines, slugifyWithReport, truncateAtWord } from '~/lib/slug';

describe('slugify — basics', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips punctuation', () => {
    expect(slugify('What?! Really... yes.')).toBe('what-really-yes');
  });

  it('collapses runs of separators', () => {
    expect(slugify('a   ---   b')).toBe('a-b');
  });

  it('trims separators from both ends', () => {
    expect(slugify('  --hello--  ')).toBe('hello');
  });

  it('keeps digits', () => {
    expect(slugify('Top 10 CSS Tricks (2026 Edition)')).toBe('top-10-css-tricks-2026-edition');
  });

  it('removes apostrophes without splitting the word', () => {
    expect(slugify("Don't Repeat Yourself")).toBe('dont-repeat-yourself');
    expect(slugify('L’API de Réponse')).toBe('lapi-de-reponse');
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});

describe('slugify — accent folding', () => {
  it('folds French and Spanish accents to ASCII', () => {
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
    expect(slugify('Piñata Niño')).toBe('pinata-nino');
    expect(slugify('Naïve Café')).toBe('naive-cafe');
  });

  it('folds a precomposed and a decomposed e-acute identically', () => {
    expect(slugify('caf\u00E9')).toBe('cafe');
    expect(slugify('cafe\u0301')).toBe('cafe');
  });

  it('folds Central European accents', () => {
    expect(slugify('Škoda Čapek Žižkov')).toBe('skoda-capek-zizkov');
    expect(slugify('Gdańsk Kraków')).toBe('gdansk-krakow');
  });

  it('folds Vietnamese stacked marks', () => {
    expect(slugify('Tiếng Việt')).toBe('tieng-viet');
  });
});

describe('slugify — transliteration', () => {
  it('handles the German set', () => {
    expect(slugify('Straße')).toBe('strasse');
    expect(slugify('Müller')).toBe('mueller');
    expect(slugify('Über den Wolken')).toBe('ueber-den-wolken');
    expect(slugify('Öffnungszeiten')).toBe('oeffnungszeiten');
  });

  it('handles the Nordic set', () => {
    expect(slugify('Søn og Åse')).toBe('son-og-ase');
    expect(slugify('Ærø')).toBe('aero');
  });

  it('handles Polish ł', () => {
    expect(slugify('Łódź Wrocław')).toBe('lodz-wroclaw');
  });

  it('handles basic Cyrillic', () => {
    expect(slugify('Привет мир')).toBe('privet-mir');
    expect(slugify('Щербаков')).toBe('shcherbakov');
    expect(slugify('Ёлка')).toBe('yolka');
  });

  it('can be switched off', () => {
    expect(slugify('Straße', { transliterate: false })).toBe('stra-e');
    expect(slugify('Привет', { transliterate: false })).toBe('');
  });
});

describe('slugify — symbols', () => {
  it('expands common symbols into words', () => {
    expect(slugify('Rock & Roll')).toBe('rock-and-roll');
    expect(slugify('50% Off')).toBe('50-percent-off');
    expect(slugify('me@example.com')).toBe('me-at-example-com');
    expect(slugify('C++ and C#')).toBe('c-plus-plus-and-c');
  });

  it('can be switched off', () => {
    expect(slugify('Rock & Roll', { expandSymbols: false })).toBe('rock-roll');
  });

  it('normalises typographic dashes and quotes', () => {
    expect(slugify('Design — “Simply” Done')).toBe('design-simply-done');
  });
});

describe('slugify — separator', () => {
  it('uses an underscore', () => {
    expect(slugify('Hello World Again', { separator: '_' })).toBe('hello_world_again');
  });

  it('uses a dot', () => {
    expect(slugify('Hello World', { separator: '.' })).toBe('hello.world');
  });

  it('joins with nothing', () => {
    expect(slugify('Hello World Again', { separator: '' })).toBe('helloworldagain');
  });

  it('collapses duplicates for every separator', () => {
    expect(slugify('a -- b', { separator: '_' })).toBe('a_b');
    expect(slugify('a ... b', { separator: '.' })).toBe('a.b');
  });
});

describe('slugify — case', () => {
  it('preserves case when lowercase is off', () => {
    expect(slugify('Hello World', { lowercase: false })).toBe('Hello-World');
  });

  it('preserves transliterated case', () => {
    expect(slugify('Stra\u00DFe M\u00FCller', { lowercase: false })).toBe('Strasse-Mueller');
    expect(slugify('Привет', { lowercase: false })).toBe('Privet');
  });
});

describe('slugify — max length', () => {
  it('truncates at a word boundary', () => {
    expect(slugify('the quick brown fox jumps', { maxLength: 15 })).toBe('the-quick-brown');
  });

  it('never leaves a trailing separator', () => {
    const out = slugify('the quick brown fox jumps', { maxLength: 16 });
    expect(out).toBe('the-quick-brown');
    expect(out.endsWith('-')).toBe(false);
  });

  it('hard-cuts a single word longer than the limit', () => {
    expect(slugify('supercalifragilistic', { maxLength: 8 })).toBe('supercal');
  });

  it('leaves a short slug alone', () => {
    expect(slugify('short', { maxLength: 50 })).toBe('short');
  });

  it('treats 0 as no limit', () => {
    expect(slugify('the quick brown fox', { maxLength: 0 })).toBe('the-quick-brown-fox');
  });
});

describe('truncateAtWord', () => {
  it('cuts at the last separator before the limit', () => {
    expect(truncateAtWord('one-two-three', 9, '-')).toBe('one-two');
  });

  it('returns the input when it already fits', () => {
    expect(truncateAtWord('one-two', 20, '-')).toBe('one-two');
  });

  it('hard-cuts when there is no separator', () => {
    expect(truncateAtWord('onetwothree', 4, '-')).toBe('onet');
    expect(truncateAtWord('onetwothree', 4, '')).toBe('onet');
  });
});

describe('slugifyWithReport', () => {
  it('lists the transliterated characters', () => {
    const r = slugifyWithReport('Müller & Søn');
    expect(r.slug).toBe('mueller-and-son');
    expect(r.transliterated).toContain('ü');
    expect(r.transliterated).toContain('ø');
    expect(r.transliterated).toContain('&');
    expect(r.empty).toBe(false);
    expect(r.dropped).toEqual([]);
  });

  it('reports characters it had to drop', () => {
    const r = slugifyWithReport('北京 Beijing');
    expect(r.slug).toBe('beijing');
    expect(r.dropped).toEqual(['北', '京']);
  });

  it('flags an entirely unusable title', () => {
    const r = slugifyWithReport('中文标题');
    expect(r.empty).toBe(true);
    expect(r.slug).toBe('');
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  it('flags truncation', () => {
    expect(slugifyWithReport('the quick brown fox', { maxLength: 9 }).truncated).toBe(true);
    expect(slugifyWithReport('the quick brown fox', { maxLength: 99 }).truncated).toBe(false);
    expect(slugifyWithReport('the quick brown fox').truncated).toBe(false);
  });

  it('reports the length', () => {
    expect(slugifyWithReport('Hello World').length).toBe(11);
  });
});

describe('slugifyLines', () => {
  it('slugifies each line independently', () => {
    const out = slugifyLines('Getting Started\nRéponse de l’API\nÜber den Wolken');
    expect(out).toEqual(['getting-started', 'reponse-de-lapi', 'ueber-den-wolken']);
  });

  it('preserves blank lines so rows stay aligned', () => {
    expect(slugifyLines('One\n\nTwo')).toEqual(['one', '', 'two']);
  });

  it('passes options through', () => {
    expect(slugifyLines('Hello World', { separator: '_' })).toEqual(['hello_world']);
  });

  it('handles CRLF input', () => {
    expect(slugifyLines('One\r\nTwo')).toEqual(['one', 'two']);
  });
});

describe('slugify — idempotence', () => {
  it('leaves an already-clean slug unchanged', () => {
    for (const title of ['Café Müller', 'Top 10 CSS Tricks', 'Привет мир', 'Rock & Roll']) {
      const once = slugify(title);
      expect(slugify(once)).toBe(once);
    }
  });
});
