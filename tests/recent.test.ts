import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readRecent, recordVisit, clearRecent } from '~/lib/recent';

/** Minimal localStorage stand-in — the module must work with nothing else. */
function installStorage(impl?: Partial<Storage>) {
  const store = new Map<string, string>();
  const base: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => { store.delete(k); },
    setItem: (k, v) => { store.set(k, v); },
  };
  vi.stubGlobal('localStorage', { ...base, ...impl });
}

describe('recent tools', () => {
  beforeEach(() => installStorage());

  it('starts empty', () => {
    expect(readRecent()).toEqual([]);
  });

  it('records most recent first', () => {
    recordVisit('json-formatter');
    recordVisit('jwt-decoder');
    expect(readRecent()).toEqual(['jwt-decoder', 'json-formatter']);
  });

  it('moves a repeat visit to the front without duplicating it', () => {
    recordVisit('a-tool');
    recordVisit('b-tool');
    recordVisit('a-tool');
    expect(readRecent()).toEqual(['a-tool', 'b-tool']);
  });

  it('caps the list at six', () => {
    for (const s of ['t1','t2','t3','t4','t5','t6','t7','t8']) recordVisit(s);
    const out = readRecent();
    expect(out).toHaveLength(6);
    expect(out[0]).toBe('t8');
    expect(out).not.toContain('t1');
  });

  it('rejects a slug that is not slug-shaped', () => {
    recordVisit('../../etc/passwd');
    recordVisit('<script>');
    expect(readRecent()).toEqual([]);
  });

  it('ignores tampered storage contents', () => {
    localStorage.setItem('bc-recent', '{"not":"an array"}');
    expect(readRecent()).toEqual([]);
    localStorage.setItem('bc-recent', '["ok-tool", 42, "<img src=x>", null]');
    expect(readRecent()).toEqual(['ok-tool']);
  });

  it('survives unparseable storage', () => {
    localStorage.setItem('bc-recent', 'not json at all');
    expect(readRecent()).toEqual([]);
  });

  it('never throws when localStorage is blocked', () => {
    // Safari in private mode historically threw on setItem rather than no-oping.
    installStorage({
      getItem: () => { throw new DOMException('denied'); },
      setItem: () => { throw new DOMException('QuotaExceeded'); },
      removeItem: () => { throw new DOMException('denied'); },
    });
    expect(() => readRecent()).not.toThrow();
    expect(() => recordVisit('json-formatter')).not.toThrow();
    expect(() => clearRecent()).not.toThrow();
    expect(readRecent()).toEqual([]);
  });

  it('clears', () => {
    recordVisit('a-tool');
    clearRecent();
    expect(readRecent()).toEqual([]);
  });
});
