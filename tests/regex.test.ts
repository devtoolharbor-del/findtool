import { describe, expect, it } from 'vitest';
import { LIMITS } from '~/consts';
import {
  COMMON_PATTERNS,
  MAX_MATCHES,
  RegexError,
  captureGroupNames,
  compilePattern,
  findMatches,
  findNestedQuantifier,
  highlightMatches,
  runRegex,
  timeoutMessage,
  validateFlags,
} from '~/lib/regex';

const run = (pattern: string, flags: string, text: string, replacement: string | null = null) =>
  runRegex({ id: 1, pattern, flags, text, replacement });

describe('compilation', () => {
  it('compiles a valid pattern and always adds the d flag for match indices', () => {
    const re = compilePattern('a(b)c', 'gi');
    expect(re.source).toBe('a(b)c');
    expect(re.flags).toContain('g');
    expect(re.flags).toContain('i');
    expect(re.flags).toContain('d');
  });

  it('refuses an empty pattern with an explanation', () => {
    expect(() => compilePattern('', 'g')).toThrow(/Enter a pattern/);
  });

  it('names an unknown flag instead of echoing the engine', () => {
    expect(() => validateFlags('gx')).toThrow(/"x" is not a JavaScript regex flag/);
    expect(() => validateFlags('gg')).toThrow(/listed twice/);
    expect(() => validateFlags('uv')).toThrow(/cannot be combined/);
    expect(() => validateFlags('gimsuy')).not.toThrow();
  });

  it('throws RegexError, not a bare SyntaxError', () => {
    expect(() => compilePattern('(a', 'g')).toThrow(RegexError);
  });
});

describe('friendly syntax errors', () => {
  const message = (pattern: string) => {
    try {
      compilePattern(pattern, '');
      return '';
    } catch (err) {
      return (err as RegexError).message;
    }
  };

  it('counts the brackets on an unclosed group', () => {
    expect(message('(a')).toMatch(/1 opening bracket and 0 closing ones/);
  });

  it('explains an unclosed character class', () => {
    expect(message('[abc')).toMatch(/opened with \[ but never closed/);
  });

  it('explains a quantifier with nothing to repeat', () => {
    expect(message('+a')).toMatch(/nothing in front of it to repeat/);
  });

  it('explains a backwards range', () => {
    expect(message('[z-a]')).toMatch(/runs backwards/);
  });

  it('explains a duplicate group name', () => {
    expect(message('(?<x>a)(?<x>b)')).toMatch(/share the same name/);
  });

  it('attaches a hint where one helps', () => {
    try {
      compilePattern('(a', '');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as RegexError).hint).toMatch(/escape it as/i);
    }
  });
});

describe('matching', () => {
  it('finds every match with the g flag', () => {
    const result = run('\\d+', 'g', 'a1 b22 c333');
    expect(result.count).toBe(3);
    expect(result.matches.map((m) => m.value)).toEqual(['1', '22', '333']);
    expect(result.matches.map((m) => m.index)).toEqual([1, 4, 8]);
    expect(result.matches.map((m) => m.length)).toEqual([1, 2, 3]);
  });

  it('returns only the first match without the g flag', () => {
    expect(run('\\d+', '', 'a1 b22').count).toBe(1);
  });

  it('honours the i flag', () => {
    expect(run('abc', 'g', 'ABC abc').count).toBe(1);
    expect(run('abc', 'gi', 'ABC abc').count).toBe(2);
  });

  it('honours the m flag', () => {
    expect(run('^b', 'g', 'a\nb').count).toBe(0);
    expect(run('^b', 'gm', 'a\nb').count).toBe(1);
  });

  it('honours the s flag', () => {
    expect(run('a.b', 'g', 'a\nb').count).toBe(0);
    expect(run('a.b', 'gs', 'a\nb').count).toBe(1);
  });

  it('honours the y flag by anchoring at lastIndex', () => {
    expect(run('a', 'y', 'ba').count).toBe(0);
    expect(run('a', 'y', 'ab').count).toBe(1);
  });

  it('terminates on zero-length matches instead of looping forever', () => {
    const result = run('a*', 'g', 'bbb');
    expect(result.count).toBeLessThanOrEqual(4);
    expect(result.matches.every((m) => m.length === 0)).toBe(true);
  });

  it('returns no matches rather than throwing when nothing matches', () => {
    const result = run('zzz', 'g', 'abc');
    expect(result.count).toBe(0);
    expect(result.matches).toEqual([]);
  });

  it('stops at the match limit and says so', () => {
    const result = runRegex({
      id: 1,
      pattern: 'a',
      flags: 'g',
      text: 'a'.repeat(50),
      replacement: null,
      limit: 10,
    });
    expect(result.count).toBe(10);
    expect(result.truncated).toBe(true);
  });

  it('does not report truncation below the limit', () => {
    expect(run('a', 'g', 'aaa').truncated).toBe(false);
    expect(MAX_MATCHES).toBeGreaterThan(1000);
  });
});

describe('capture groups', () => {
  it('reports numbered groups with their offsets', () => {
    const result = run('(\\w+)@(\\w+)', 'g', 'ada@findtool');
    const [match] = result.matches;
    expect(match!.groups).toHaveLength(2);
    expect(match!.groups[0]).toMatchObject({ number: 1, value: 'ada', start: 0, end: 3 });
    expect(match!.groups[1]).toMatchObject({ number: 2, value: 'findtool', start: 4, end: 12 });
  });

  it('reports named groups by name as well as by number', () => {
    const result = run('(?<year>\\d{4})-(?<month>\\d{2})', 'g', '2026-09');
    const [match] = result.matches;
    expect(match!.named).toEqual({ year: '2026', month: '09' });
    expect(match!.groups[0]).toMatchObject({ number: 1, name: 'year', value: '2026' });
    expect(match!.groups[1]).toMatchObject({ number: 2, name: 'month', value: '09' });
  });

  it('maps names to numbers correctly when groups capture identical text', () => {
    const result = run('(?<a>x)(?<b>x)', '', 'xx');
    expect(result.matches[0]!.groups.map((g) => g.name)).toEqual(['a', 'b']);
  });

  it('leaves a group undefined when it took no part in the match', () => {
    const result = run('(a)|(b)', 'g', 'b');
    expect(result.matches[0]!.groups[0]!.value).toBeUndefined();
    expect(result.matches[0]!.groups[1]!.value).toBe('b');
  });

  it('does not count non-capturing groups or lookarounds', () => {
    const names = captureGroupNames('(?:x)(?<real>y)(?=z)(?<!q)');
    expect(names.get(1)).toBe('real');
    expect(names.size).toBe(1);
  });

  it('ignores brackets inside a character class', () => {
    expect(captureGroupNames('[(](?<n>a)').get(1)).toBe('n');
  });

  it('ignores an escaped bracket', () => {
    expect(captureGroupNames('\\((?<n>a)').get(1)).toBe('n');
  });
});

describe('replace preview', () => {
  it('supports numbered references', () => {
    expect(run('(\\w+)@(\\w+)', 'g', 'ada@findtool', '$2/$1').replaced).toBe('findtool/ada');
  });

  it('supports named references', () => {
    const result = run(
      '(?<day>\\d{2})/(?<month>\\d{2})/(?<year>\\d{4})',
      'g',
      '24/09/2026',
      '$<year>-$<month>-$<day>',
    );
    expect(result.replaced).toBe('2026-09-24');
  });

  it('supports $& for the whole match', () => {
    expect(run('\\d+', 'g', 'a1 b2', '[$&]').replaced).toBe('a[1] b[2]');
  });

  it('replaces only the first match without the g flag', () => {
    expect(run('a', '', 'aaa', 'X').replaced).toBe('Xaa');
    expect(run('a', 'g', 'aaa', 'X').replaced).toBe('XXX');
  });

  it('is null when no replacement was requested', () => {
    expect(run('a', 'g', 'aaa').replaced).toBeNull();
  });

  it('does not leak lastIndex between the match pass and the replace pass', () => {
    const result = run('a', 'g', 'aaa', 'X');
    expect(result.count).toBe(3);
    expect(result.replaced).toBe('XXX');
  });
});

describe('highlighting', () => {
  it('wraps matches in a mark element', () => {
    const result = run('b', 'g', 'abc');
    expect(highlightMatches('abc', result.matches)).toBe('a<mark class="bc-match">b</mark>c');
  });

  it('escapes the test string before wrapping anything', () => {
    const text = '<script>alert(1)</script>';
    const html = highlightMatches(text, run('alert', 'g', text).matches);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<mark class="bc-match">alert</mark>');
  });

  it('escapes quotes and ampersands inside a match too', () => {
    const text = 'a&b"c';
    const html = highlightMatches(text, run('&b"', 'g', text).matches);
    expect(html).toBe('a<mark class="bc-match">&amp;b&quot;</mark>c');
  });

  it('marks a zero-length match visibly', () => {
    const html = highlightMatches('ab', [{ index: 1, length: 0, value: '', groups: [], named: {} }]);
    expect(html).toContain('data-empty="1"');
  });

  it('returns the escaped text unchanged when there are no matches', () => {
    expect(highlightMatches('a<b', [])).toBe('a&lt;b');
  });
});

describe('catastrophic backtracking', () => {
  it('spots the classic nested quantifier', () => {
    expect(findNestedQuantifier('(a+)+$')).toBe('(a+)+');
    expect(findNestedQuantifier('^(\\s*)*$')).toBe('(\\s*)*');
    expect(findNestedQuantifier('(a|a)+')).toBe('(a|a)+');
    expect(findNestedQuantifier('(\\w+\\s?)*$')).toBe('(\\w+\\s?)*');
  });

  it('does not flag a safe pattern', () => {
    expect(findNestedQuantifier('[a-z]+')).toBeNull();
    expect(findNestedQuantifier('(abc)+')).toBeNull();
    expect(findNestedQuantifier('\\d{4}-\\d{2}')).toBeNull();
  });

  it('does not flag an unbalanced pattern rather than hanging on it', () => {
    expect(findNestedQuantifier('(a+')).toBeNull();
  });

  it('names the cause in the timeout message', () => {
    const { message, hint } = timeoutMessage('(a+)+$', LIMITS.regexTimeoutMs);
    expect(message).toMatch(/catastrophic backtracking/);
    expect(message).toMatch(String(LIMITS.regexTimeoutMs));
    expect(hint).toMatch(/\(a\+\)\+/);
    expect(hint).toMatch(/quantifier applied to a group/);
  });

  it('still explains the concept when no culprit can be pinpointed', () => {
    const { hint } = timeoutMessage('some-opaque-pattern', LIMITS.regexTimeoutMs);
    expect(hint).toMatch(/character class is always safe/);
  });

  it('is exactly the pattern that would hang the tab without a worker', () => {
    // Proof that the fixture is genuinely pathological: the engine explores
    // 2^n splits of the run of "a" before it can fail on the trailing "b".
    // 22 characters stays under a second in CI; 30 would not.
    const started = Date.now();
    expect(/^(a+)+$/.test(`${'a'.repeat(22)}b`)).toBe(false);
    expect(Date.now() - started).toBeGreaterThan(5);
  });
});

describe('the pattern library', () => {
  it('compiles and matches its own sample text', () => {
    for (const example of COMMON_PATTERNS) {
      const result = run(example.pattern, example.flags, example.sample);
      expect(result.count, `${example.id} found no matches`).toBeGreaterThan(0);
    }
  });

  it('matches the addresses in the email sample and not the broken ones', () => {
    const email = COMMON_PATTERNS.find((p) => p.id === 'email')!;
    const values = run(email.pattern, email.flags, email.sample).matches.map((m) => m.value);
    expect(values).toContain('ada@findtool.dev');
    expect(values).toContain('support+billing@example.co.uk');
    expect(values).not.toContain('not.an.email@');
  });

  it('range-checks IPv4 octets', () => {
    const ipv4 = COMMON_PATTERNS.find((p) => p.id === 'ipv4')!;
    const values = run(ipv4.pattern, ipv4.flags, ipv4.sample).matches.map((m) => m.value);
    expect(values).toEqual(['10.0.0.1', '192.168.1.255', '8.8.8.8']);
  });

  it('exposes named groups on the ISO date pattern', () => {
    const date = COMMON_PATTERNS.find((p) => p.id === 'iso-date')!;
    const result = run(date.pattern, date.flags, '2026-09-24');
    expect(result.matches[0]!.named).toEqual({ year: '2026', month: '09', day: '24' });
  });

  it('accepts a UUIDv7 and rejects a truncated one', () => {
    const uuid = COMMON_PATTERNS.find((p) => p.id === 'uuid')!;
    const values = run(uuid.pattern, uuid.flags, uuid.sample).matches.map((m) => m.value);
    expect(values).toContain('018f3c4a-1b2c-7d3e-8f90-a1b2c3d4e5f6');
    expect(values).toHaveLength(2);
  });
});

describe('findMatches directly', () => {
  it('works on a pre-compiled expression', () => {
    const { matches, truncated } = findMatches(/\d/gd, 'a1b2');
    expect(matches.map((m) => m.value)).toEqual(['1', '2']);
    expect(truncated).toBe(false);
  });

  it('reports a duration', () => {
    expect(run('a', 'g', 'aaa').durationMs).toBeGreaterThanOrEqual(0);
  });
});
