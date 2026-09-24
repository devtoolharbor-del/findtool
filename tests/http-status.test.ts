import { describe, expect, it } from 'vitest';
import {
  HTTP_STATUSES,
  HTTP_STATUS_CATEGORIES,
  findStatus,
  searchStatuses,
  statusClass,
  statusesByCategory,
} from '~/lib/http-status';

describe('dataset integrity', () => {
  it('has no duplicate codes', () => {
    const codes = HTTP_STATUSES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('puts every code in the class its number implies', () => {
    for (const status of HTTP_STATUSES) {
      expect(status.category).toBe(statusClass(status.code));
    }
  });

  it('gives every code a name, a meaning, guidance and a spec reference', () => {
    for (const status of HTTP_STATUSES) {
      expect(status.name.length, `${status.code} name`).toBeGreaterThan(0);
      expect(status.meaning.length, `${status.code} meaning`).toBeGreaterThan(40);
      expect(status.whenToSend.length, `${status.code} whenToSend`).toBeGreaterThan(20);
      expect(status.spec, `${status.code} spec`).toMatch(/RFC \d+/);
    }
  });

  it('includes the codes people actually look up', () => {
    for (const code of [
      100, 101, 103, 200, 201, 204, 206, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 405,
      409, 410, 413, 415, 418, 421, 422, 425, 426, 428, 429, 431, 451, 500, 502, 503, 504, 511,
    ]) {
      expect(findStatus(code), `missing ${code}`).toBeDefined();
    }
  });

  it('covers all five classes', () => {
    const grouped = statusesByCategory();
    expect(grouped).toHaveLength(HTTP_STATUS_CATEGORIES.length);
    for (const group of grouped) expect(group.statuses.length).toBeGreaterThan(0);
  });

  it('sorts each class numerically', () => {
    for (const { statuses } of statusesByCategory()) {
      const codes = statuses.map((s) => s.code);
      expect(codes).toEqual([...codes].sort((a, b) => a - b));
    }
  });
});

describe('accuracy of well-known entries', () => {
  it('names codes as the registry does', () => {
    expect(findStatus(404)!.name).toBe('Not Found');
    expect(findStatus(500)!.name).toBe('Internal Server Error');
    expect(findStatus(301)!.name).toBe('Moved Permanently');
    expect(findStatus(308)!.name).toBe('Permanent Redirect');
    expect(findStatus(422)!.name).toBe('Unprocessable Content');
    expect(findStatus(451)!.name).toBe('Unavailable For Legal Reasons');
  });

  it('explains the pairs that get confused', () => {
    expect(findStatus(401)!.confusion).toMatch(/403/);
    expect(findStatus(403)!.confusion).toBeTruthy();
    expect(findStatus(301)!.confusion).toMatch(/308/);
    expect(findStatus(302)!.confusion).toMatch(/307/);
    expect(findStatus(409)!.confusion).toMatch(/422/);
    expect(findStatus(422)!.confusion).toMatch(/400/);
  });

  it('returns undefined for codes that are not registered', () => {
    expect(findStatus(499)).toBeUndefined();
    expect(findStatus(999)).toBeUndefined();
  });

  it('classifies by first digit, and rejects nonsense', () => {
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(503)).toBe('5xx');
    expect(statusClass(42)).toBeNull();
    expect(statusClass(600)).toBeNull();
  });
});

describe('search', () => {
  it('returns everything for an empty query', () => {
    expect(searchStatuses('   ')).toHaveLength(HTTP_STATUSES.length);
  });

  it('puts an exact code first', () => {
    expect(searchStatuses('404')[0]!.code).toBe(404);
    expect(searchStatuses('200')[0]!.code).toBe(200);
  });

  it('treats a partial number as a prefix', () => {
    const results = searchStatuses('42');
    expect(results.map((s) => s.code)).toContain(429);
    expect(results.every((s) => String(s.code).startsWith('42'))).toBe(true);
  });

  it('matches names case-insensitively', () => {
    expect(searchStatuses('not found').map((s) => s.code)).toContain(404);
    expect(searchStatuses('TEAPOT').map((s) => s.code)).toContain(418);
  });

  it('matches keywords a developer would type instead of a number', () => {
    expect(searchStatuses('rate limit').map((s) => s.code)).toContain(429);
    expect(searchStatuses('captive portal').map((s) => s.code)).toContain(511);
    expect(searchStatuses('etag').map((s) => s.code)).toContain(304);
    expect(searchStatuses('maintenance').map((s) => s.code)).toContain(503);
  });

  it('requires every word of a multi-word query to match', () => {
    expect(searchStatuses('zzz not found')).toHaveLength(0);
  });
});
