import { describe, expect, it } from 'vitest';
import {
  diffLines,
  similarity,
  tokenizeWords,
  toUnifiedText,
  wordDiff,
  type DiffRow,
} from '~/lib/diff';

/** Compact shorthand for asserting on a result: `['=a', '+b', '-c', '~d']`. */
function shape(rows: DiffRow[]): string[] {
  return rows.map((r) => {
    switch (r.type) {
      case 'unchanged':
        return `=${r.left}`;
      case 'add':
        return `+${r.right}`;
      case 'remove':
        return `-${r.left}`;
      case 'changed':
        return `~${r.left}>${r.right}`;
    }
  });
}

describe('diffLines — identical input', () => {
  it('reports no changes', () => {
    const r = diffLines('a\nb\nc', 'a\nb\nc');
    expect(r.identical).toBe(true);
    expect(r.additions).toBe(0);
    expect(r.deletions).toBe(0);
    expect(r.changed).toBe(0);
    expect(r.unchanged).toBe(3);
  });

  it('handles two empty documents', () => {
    const r = diffLines('', '');
    expect(r.identical).toBe(true);
    expect(r.lines).toHaveLength(1);
  });
});

describe('diffLines — insertions', () => {
  it('finds a line inserted in the middle', () => {
    const r = diffLines('a\nb\nc', 'a\nx\nb\nc');
    expect(shape(r.lines)).toEqual(['=a', '+x', '=b', '=c']);
    expect(r.additions).toBe(1);
    expect(r.deletions).toBe(0);
  });

  it('finds a line appended at the end', () => {
    const r = diffLines('a\nb', 'a\nb\nc');
    expect(shape(r.lines)).toEqual(['=a', '=b', '+c']);
  });

  it('finds a line prepended at the start', () => {
    const r = diffLines('b\nc', 'a\nb\nc');
    expect(shape(r.lines)).toEqual(['+a', '=b', '=c']);
  });

  it('numbers both sides correctly around an insertion', () => {
    const r = diffLines('a\nb', 'a\nx\nb');
    expect(r.lines.map((l) => [l.leftNumber, l.rightNumber])).toEqual([
      [1, 1],
      [undefined, 2],
      [2, 3],
    ]);
  });
});

describe('diffLines — deletions', () => {
  it('finds a deleted line', () => {
    const r = diffLines('a\nb\nc', 'a\nc');
    expect(shape(r.lines)).toEqual(['=a', '-b', '=c']);
    expect(r.deletions).toBe(1);
  });

  it('handles deleting everything', () => {
    // An empty right-hand side is still one (empty) line, so the result is
    // three deletions plus that one blank insertion.
    const r = diffLines('a\nb\nc', '');
    expect(r.deletions).toBe(3);
    expect(r.unchanged).toBe(0);
    expect(r.identical).toBe(false);
  });
});

describe('diffLines — modifications', () => {
  it('pairs a similar replacement into one changed row', () => {
    const r = diffLines('port: 8080', 'port: 9090');
    expect(r.changed).toBe(1);
    expect(r.additions).toBe(0);
    expect(r.deletions).toBe(0);
    expect(r.lines[0]!.left).toBe('port: 8080');
    expect(r.lines[0]!.right).toBe('port: 9090');
  });

  it('does not force two unrelated lines into one row', () => {
    const r = diffLines('the quick brown fox', 'zzzzzzz qqqqq');
    expect(r.changed).toBe(0);
    expect(r.additions).toBe(1);
    expect(r.deletions).toBe(1);
  });

  it('attaches a word-level breakdown to a changed row', () => {
    const r = diffLines('host: 127.0.0.1', 'host: 0.0.0.0');
    const row = r.lines[0]!;
    expect(row.type).toBe('changed');
    expect(row.leftWords!.map((p) => p.text).join('')).toBe('host: 127.0.0.1');
    expect(row.rightWords!.map((p) => p.text).join('')).toBe('host: 0.0.0.0');
    expect(row.leftWords!.some((p) => p.type === 'remove')).toBe(true);
    expect(row.rightWords!.some((p) => p.type === 'add')).toBe(true);
  });

  it('skips word diffing when it is turned off', () => {
    const r = diffLines('port: 8080', 'port: 9090', { wordLevel: false });
    expect(r.lines[0]!.leftWords).toBeUndefined();
  });
});

describe('diffLines — moves', () => {
  it('represents a moved line as a delete plus an insert', () => {
    const r = diffLines('a\nb\nc\nd', 'b\nc\nd\na');
    expect(r.additions + r.deletions + r.changed).toBeGreaterThan(0);
    // The three lines that did not move must still be recognised.
    expect(r.unchanged).toBe(3);
  });

  it('keeps the longest common subsequence when a block moves', () => {
    const r = diffLines('header\nalpha\nbeta\nfooter', 'header\nbeta\nalpha\nfooter');
    expect(r.unchanged).toBe(3);
    expect(r.lines[0]!.left).toBe('header');
    expect(r.lines[r.lines.length - 1]!.left).toBe('footer');
  });
});

describe('diffLines — options', () => {
  it('ignores whitespace when asked', () => {
    const noisy = diffLines('  a  ', 'a');
    expect(noisy.identical).toBe(false);
    const quiet = diffLines('  a  ', 'a', { ignoreWhitespace: true });
    expect(quiet.identical).toBe(true);
    // The display text is still the original, not the normalised form.
    expect(quiet.lines[0]!.left).toBe('  a  ');
  });

  it('collapses interior whitespace runs when ignoring whitespace', () => {
    expect(diffLines('a    b', 'a b', { ignoreWhitespace: true }).identical).toBe(true);
  });

  it('ignores case when asked', () => {
    expect(diffLines('Hello', 'HELLO').identical).toBe(false);
    expect(diffLines('Hello', 'HELLO', { ignoreCase: true }).identical).toBe(true);
  });

  it('combines both ignore options', () => {
    expect(
      diffLines('  Hello   World ', 'hello world', {
        ignoreCase: true,
        ignoreWhitespace: true,
      }).identical,
    ).toBe(true);
  });
});

describe('diffLines — realistic config change', () => {
  const left = ['server:', '  host: 127.0.0.1', '  port: 8080', 'cache:', '  driver: memory'].join('\n');
  const right = ['server:', '  host: 0.0.0.0', '  port: 8080', '  timeout: 30', 'cache:', '  driver: redis'].join('\n');

  it('identifies each kind of change', () => {
    const r = diffLines(left, right);
    expect(r.changed).toBe(2); // host and driver
    expect(r.additions).toBe(1); // timeout
    expect(r.deletions).toBe(0);
    expect(r.unchanged).toBe(3);
  });

  it('renders a unified text view', () => {
    const text = toUnifiedText(diffLines(left, right));
    expect(text).toContain('-   host: 127.0.0.1');
    expect(text).toContain('+   host: 0.0.0.0');
    expect(text).toContain('+   timeout: 30');
    expect(text.split('\n').filter((l) => l.startsWith('  '))).toHaveLength(3);
  });
});

describe('diffLines — cost cap', () => {
  it('stays exact for a large document with a small change', () => {
    const base = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
    const modified = base.slice();
    modified[2500] = 'line 2500 CHANGED';
    const r = diffLines(base.join('\n'), modified.join('\n'));
    expect(r.approximated).toBe(false);
    expect(r.changed).toBe(1);
    expect(r.unchanged).toBe(4999);
  });

  it('approximates rather than hanging when the changed region is huge', () => {
    const a = Array.from({ length: 300 }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: 300 }, (_, i) => `b${i}`).join('\n');
    const r = diffLines(a, b, { maxCells: 100 });
    expect(r.approximated).toBe(true);
    expect(r.note).toMatch(/limit/i);
    expect(r.lines).toHaveLength(600);
  });

  it('completes a genuinely different 1,500-line pair in reasonable time', () => {
    const a = Array.from({ length: 1500 }, (_, i) => `alpha ${i % 97}`).join('\n');
    const b = Array.from({ length: 1500 }, (_, i) => `beta ${i % 89}`).join('\n');
    const started = Date.now();
    const r = diffLines(a, b, { wordLevel: false });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(r.lines.length).toBeGreaterThan(0);
  });
});

describe('wordDiff', () => {
  it('marks only the words that changed', () => {
    const { left, right } = wordDiff('the quick brown fox', 'the slow brown fox');
    expect(left.filter((p) => p.type === 'remove').map((p) => p.text)).toEqual(['quick']);
    expect(right.filter((p) => p.type === 'add').map((p) => p.text)).toEqual(['slow']);
  });

  it('reconstructs both sides exactly', () => {
    const a = 'const timeout = 30;';
    const b = 'const timeout = 60; // seconds';
    const { left, right } = wordDiff(a, b);
    expect(left.map((p) => p.text).join('')).toBe(a);
    expect(right.map((p) => p.text).join('')).toBe(b);
  });

  it('merges adjacent parts of the same type', () => {
    const { right } = wordDiff('a', 'a b c d');
    expect(right.filter((p) => p.type === 'add')).toHaveLength(1);
  });

  it('handles an empty side', () => {
    const { left, right } = wordDiff('', 'hello');
    expect(left).toEqual([]);
    expect(right.map((p) => p.text).join('')).toBe('hello');
  });
});

describe('tokenizeWords', () => {
  it('keeps whitespace as its own tokens', () => {
    expect(tokenizeWords('a  b')).toEqual(['a', '  ', 'b']);
  });

  it('returns an empty array for an empty line', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
});

describe('similarity', () => {
  it('is 1 for identical strings', () => {
    expect(similarity('hello', 'hello')).toBe(1);
  });

  it('is 0 for a disjoint pair', () => {
    expect(similarity('aaaa', 'bbbb')).toBe(0);
  });

  it('is high for a small edit', () => {
    expect(similarity('port: 8080', 'port: 9090')).toBeGreaterThan(0.5);
  });

  it('is low for unrelated sentences', () => {
    expect(similarity('the quick brown fox', 'zzzzzzz qqqqq')).toBeLessThan(0.4);
  });
});
