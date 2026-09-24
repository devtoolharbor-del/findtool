import { describe, expect, it } from 'vitest';
import {
  addMonthsUtc,
  businessDaysBetween,
  calendarDiff,
  daysInMonth,
  detectTimestampUnit,
  durationTotals,
  formatDuration,
  formatHuman,
  formatIsoInZone,
  formatIsoUtc,
  formatIsoWithOffset,
  formatOffset,
  formatRelative,
  formatRfc2822,
  getWallTime,
  isLeapYear,
  isoWeekDate,
  listTimeZones,
  ordinalDate,
  parseDateTime,
  parseTimestamp,
  timestampIn,
  toDatetimeLocalValue,
  utcFromFields,
  wallTimeToUtc,
  zoneInfo,
  zoneOffsetMinutes,
} from '~/lib/datetime';

/** 2023-11-14T22:13:20Z — a round 1.7e9 second timestamp. */
const T_2023 = 1_700_000_000_000;

describe('seconds vs milliseconds detection', () => {
  it('reads a 10-digit value as seconds', () => {
    const d = detectTimestampUnit('1700000000');
    expect(d.unit).toBe('seconds');
    expect(d.digits).toBe(10);
    expect(d.confident).toBe(true);
  });

  it('reads a 13-digit value as milliseconds', () => {
    const d = detectTimestampUnit('1700000000000');
    expect(d.unit).toBe('milliseconds');
    expect(d.confident).toBe(true);
  });

  it('puts the seconds/milliseconds boundary at 12 digits', () => {
    // 11 digits is still seconds — 99,999,999,999 s is the year 5138, but
    // 11-digit millisecond values are from 1973 and effectively never seen.
    expect(detectTimestampUnit('99999999999').unit).toBe('seconds'); // 11 digits
    expect(detectTimestampUnit('100000000000').unit).toBe('milliseconds'); // 12 digits
    expect(detectTimestampUnit('9999999999').unit).toBe('seconds'); // 10 digits
  });

  it('reads 16 digits as microseconds and 19 as nanoseconds', () => {
    expect(detectTimestampUnit('1700000000000000').unit).toBe('microseconds');
    expect(detectTimestampUnit('1700000000000000000').unit).toBe('nanoseconds');
  });

  it('flags an unusual digit count as not confident', () => {
    expect(detectTimestampUnit('170000000').confident).toBe(false); // 9 digits
    expect(detectTimestampUnit('17000000000000').confident).toBe(false); // 14 digits
  });
});

describe('parseTimestamp', () => {
  it('converts every unit to the same instant', () => {
    expect(parseTimestamp('1700000000').ms).toBe(T_2023);
    expect(parseTimestamp('1700000000000').ms).toBe(T_2023);
    expect(parseTimestamp('1700000000000000').ms).toBe(T_2023);
    expect(parseTimestamp('1700000000000000000').ms).toBe(T_2023);
  });

  it('keeps nanosecond precision out of the millisecond value and reports it', () => {
    const p = parseTimestamp('1700000000123456789');
    expect(p.unit).toBe('nanoseconds');
    expect(p.ms).toBe(T_2023 + 123);
    expect(p.truncated).toBe('456789 ns beyond the millisecond');
  });

  it('honours an explicit unit override', () => {
    const p = parseTimestamp('1700000000', 'milliseconds');
    expect(p.ms).toBe(1_700_000_000);
    expect(p.forced).toBe(true);
    expect(new Date(p.ms).getUTCFullYear()).toBe(1970);
  });

  it('accepts separators, signs and fractions', () => {
    expect(parseTimestamp('1_700_000_000').ms).toBe(T_2023);
    expect(parseTimestamp('1700000000.5').ms).toBe(T_2023 + 500);
    expect(parseTimestamp('-86400').ms).toBe(-86_400_000);
  });

  it('rejects non-numeric input with a usable message', () => {
    expect(() => parseTimestamp('now')).toThrow(/not a number/);
    expect(() => parseTimestamp('  ')).toThrow(/Enter a timestamp/);
  });

  it('rejects values outside the representable range', () => {
    expect(() => parseTimestamp('99999999999999999', 'milliseconds')).toThrow(/outside the range/);
  });

  it('round-trips through timestampIn', () => {
    expect(timestampIn(T_2023, 'seconds')).toBe('1700000000');
    expect(timestampIn(T_2023, 'milliseconds')).toBe('1700000000000');
    expect(timestampIn(T_2023, 'microseconds')).toBe('1700000000000000');
    expect(timestampIn(T_2023, 'nanoseconds')).toBe('1700000000000000000');
  });
});

describe('timezone offsets are computed from Intl, so DST is correct', () => {
  it('gives New York -05:00 in January and -04:00 in July', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15, 12), 'America/New_York')).toBe(-300);
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 15, 12), 'America/New_York')).toBe(-240);
  });

  it('gives Sydney +11:00 in January and +10:00 in July — the southern hemisphere is inverted', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15, 0), 'Australia/Sydney')).toBe(660);
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 15, 0), 'Australia/Sydney')).toBe(600);
  });

  it('handles half-hour and three-quarter-hour zones', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15, 12), 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 15, 12), 'Asia/Kolkata')).toBe(330);
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15, 12), 'Asia/Kathmandu')).toBe(345);
  });

  it('reports DST status relative to the zone’s own standard offset', () => {
    const winter = zoneInfo(Date.UTC(2026, 0, 15, 12), 'America/New_York');
    const summer = zoneInfo(Date.UTC(2026, 6, 15, 12), 'America/New_York');
    expect(winter.dst).toBe(false);
    expect(winter.offsetMinutes).toBe(-300);
    expect(summer.dst).toBe(true);
    expect(summer.standardOffsetMinutes).toBe(-300);

    const sydneyJan = zoneInfo(Date.UTC(2026, 0, 15), 'Australia/Sydney');
    expect(sydneyJan.dst).toBe(true);

    const utc = zoneInfo(Date.UTC(2026, 6, 1), 'UTC');
    expect(utc.dst).toBe(false);
    expect(utc.offsetMinutes).toBe(0);
  });

  it('never claims DST for a zone that does not observe it', () => {
    for (const ms of [Date.UTC(2026, 0, 15), Date.UTC(2026, 6, 15)]) {
      expect(zoneInfo(ms, 'Asia/Tokyo').dst).toBe(false);
      expect(zoneInfo(ms, 'America/Phoenix').dst).toBe(false);
    }
  });

  it('rejects a name the platform does not know', () => {
    expect(() => zoneOffsetMinutes(Date.now(), 'Mars/Olympus_Mons')).toThrow(/not a time zone/);
  });

  it('formats offsets in ±HH:MM', () => {
    expect(formatOffset(-300)).toBe('-05:00');
    expect(formatOffset(330)).toBe('+05:30');
    expect(formatOffset(0)).toBe('+00:00');
    expect(formatOffset(0, true)).toBe('Z');
  });

  it('lists time zones including UTC', () => {
    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('Europe/Berlin');
    expect(zones.length).toBeGreaterThan(50);
  });
});

describe('wall clock to instant across DST transitions', () => {
  // US DST 2026: forward 08 March, back 01 November.
  it('converts an ordinary local time exactly', () => {
    const c = wallTimeToUtc(
      { year: 2026, month: 7, day: 4, hour: 12, minute: 0, second: 0 },
      'America/New_York',
    );
    expect(c.status).toBe('exact');
    expect(c.ms).toBe(Date.UTC(2026, 6, 4, 16, 0, 0));
    expect(c.offsetMinutes).toBe(-240);
  });

  it('flags 02:30 on the spring-forward day as non-existent', () => {
    const c = wallTimeToUtc(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 },
      'America/New_York',
    );
    expect(c.status).toBe('skipped');
    expect(c.note).toMatch(/does not exist/);
  });

  it('flags 01:30 on the fall-back day as ambiguous and picks the earlier instant', () => {
    const c = wallTimeToUtc(
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 },
      'America/New_York',
    );
    expect(c.status).toBe('ambiguous');
    expect(c.ms).toBe(Date.UTC(2026, 10, 1, 5, 30)); // 01:30 EDT
    expect(c.alternativeMs).toBe(Date.UTC(2026, 10, 1, 6, 30)); // 01:30 EST
  });

  it('round-trips wall time through UTC for a whole DST day', () => {
    for (const hour of [0, 1, 4, 12, 23]) {
      const c = wallTimeToUtc(
        { year: 2026, month: 3, day: 8, hour, minute: 15, second: 0 },
        'America/New_York',
      );
      const back = getWallTime(c.ms, 'America/New_York');
      expect(back.hour).toBe(hour);
      expect(back.day).toBe(8);
    }
  });
});

describe('formatting', () => {
  const ms = Date.UTC(2026, 8, 24, 14, 30, 5, 250); // Thu 24 Sep 2026

  it('formats ISO 8601 in UTC', () => {
    expect(formatIsoUtc(ms)).toBe('2026-09-24T14:30:05.250Z');
    expect(formatIsoUtc(ms, { milliseconds: false })).toBe('2026-09-24T14:30:05Z');
    expect(formatIsoUtc(ms, { milliseconds: false, zeroAsZ: false })).toBe(
      '2026-09-24T14:30:05+00:00',
    );
  });

  it('formats ISO 8601 with a real zone offset', () => {
    expect(formatIsoInZone(ms, 'America/New_York', { milliseconds: false })).toBe(
      '2026-09-24T10:30:05-04:00',
    );
    expect(formatIsoInZone(ms, 'Asia/Kolkata', { milliseconds: false })).toBe(
      '2026-09-24T20:00:05+05:30',
    );
  });

  it('formats ISO 8601 with a fixed offset', () => {
    expect(formatIsoWithOffset(ms, -300, { milliseconds: false })).toBe('2026-09-24T09:30:05-05:00');
  });

  it('formats RFC 2822', () => {
    expect(formatRfc2822(ms)).toBe('Thu, 24 Sep 2026 14:30:05 +0000');
    expect(formatRfc2822(ms, 'America/New_York')).toBe('Thu, 24 Sep 2026 10:30:05 -0400');
  });

  it('formats human and datetime-local forms', () => {
    expect(formatHuman(ms)).toBe('Thursday, 24 September 2026, 14:30:05');
    expect(toDatetimeLocalValue(ms, 'UTC')).toBe('2026-09-24T14:30');
    expect(toDatetimeLocalValue(ms, 'UTC', true)).toBe('2026-09-24T14:30:05');
  });

  it('computes ISO week and ordinal dates', () => {
    expect(isoWeekDate(ms)).toBe('2026-W39-4');
    expect(ordinalDate(ms)).toBe('2026-267');
    // 1 January 2027 is a Friday, which ISO 8601 places in week 53 of 2026.
    expect(isoWeekDate(Date.UTC(2027, 0, 1))).toBe('2026-W53-5');
  });

  it('formats relative time in both directions', () => {
    const now = Date.UTC(2026, 8, 24, 12, 0, 0);
    expect(formatRelative(now, now)).toBe('just now');
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(formatRelative(now + 2 * 86_400_000, now)).toBe('in 2 days');
    expect(formatRelative(Date.UTC(2025, 8, 24, 12), now)).toBe('last year');
    expect(formatRelative(Date.UTC(2026, 5, 24, 12), now)).toBe('3 months ago');
  });

  it('formats durations compactly', () => {
    expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 12_000)).toBe(
      '2d 3h 04m 12s',
    );
    expect(formatDuration(45_000)).toBe('45s');
  });
});

describe('parseDateTime', () => {
  it('reads an ISO instant with Z', () => {
    const r = parseDateTime('2026-09-24T14:30:05Z');
    expect(r.ms).toBe(Date.UTC(2026, 8, 24, 14, 30, 5));
    expect(r.hasOffset).toBe(true);
    expect(r.offsetMinutes).toBe(0);
    expect(r.kind).toBe('iso');
  });

  it('reads an ISO instant with a real offset', () => {
    const r = parseDateTime('2026-09-24T10:30:05-04:00');
    expect(r.ms).toBe(Date.UTC(2026, 8, 24, 14, 30, 5));
    expect(r.offsetMinutes).toBe(-240);
  });

  it('interprets an offsetless string in the zone it is told to', () => {
    expect(parseDateTime('2026-09-24T10:30:05').ms).toBe(Date.UTC(2026, 8, 24, 10, 30, 5));
    expect(parseDateTime('2026-09-24T10:30:05', 'America/New_York').ms).toBe(
      Date.UTC(2026, 8, 24, 14, 30, 5),
    );
    expect(parseDateTime('2026-09-24T10:30:05').hasOffset).toBe(false);
  });

  it('accepts a space separator and fractional seconds', () => {
    expect(parseDateTime('2026-09-24 10:30:05.125Z').ms).toBe(
      Date.UTC(2026, 8, 24, 10, 30, 5, 125),
    );
  });

  it('reads a date-only value', () => {
    const r = parseDateTime('2026-09-24');
    expect(r.kind).toBe('date-only');
    expect(r.ms).toBe(Date.UTC(2026, 8, 24));
  });

  it('reads RFC 2822', () => {
    const r = parseDateTime('Thu, 24 Sep 2026 14:30:05 +0000');
    expect(r.kind).toBe('rfc2822');
    expect(r.ms).toBe(Date.UTC(2026, 8, 24, 14, 30, 5));
    expect(parseDateTime('Thu, 24 Sep 2026 10:30:05 -0400').ms).toBe(
      Date.UTC(2026, 8, 24, 14, 30, 5),
    );
  });

  it('reads a bare timestamp', () => {
    const r = parseDateTime('1700000000');
    expect(r.kind).toBe('timestamp');
    expect(r.ms).toBe(T_2023);
  });

  it('rejects impossible calendar values', () => {
    expect(() => parseDateTime('2026-02-30T00:00:00Z')).toThrow(/28 days/);
    expect(() => parseDateTime('2026-13-01T00:00:00Z')).toThrow(/out of range/);
    expect(() => parseDateTime('2026-09-24T25:00:00Z')).toThrow(/not a valid time/);
  });

  it('refuses gibberish with advice', () => {
    expect(() => parseDateTime('next tuesday-ish')).toThrow(/Could not read/);
    expect(() => parseDateTime('')).toThrow(/Enter a date/);
  });
});

describe('calendar arithmetic', () => {
  it('knows leap years and month lengths', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('clamps when adding months to a long month', () => {
    expect(formatIsoUtc(addMonthsUtc(Date.UTC(2026, 0, 31), 1), { milliseconds: false })).toBe(
      '2026-02-28T00:00:00Z',
    );
    expect(formatIsoUtc(addMonthsUtc(Date.UTC(2024, 0, 31), 1), { milliseconds: false })).toBe(
      '2024-02-29T00:00:00Z',
    );
  });

  it('builds time values for years below 100', () => {
    expect(new Date(utcFromFields(99, 1, 1)).getUTCFullYear()).toBe(99);
  });
});

describe('calendarDiff', () => {
  it('breaks a span into years, months and days', () => {
    const d = calendarDiff(Date.UTC(2020, 0, 15), Date.UTC(2026, 8, 24));
    expect(d.years).toBe(6);
    expect(d.months).toBe(8);
    expect(d.days).toBe(9);
    expect(d.reversed).toBe(false);
  });

  it('follows the clamping rule at month ends', () => {
    // 31 Jan + 1 month clamps to 29 Feb, leaving one day to 1 March.
    const d = calendarDiff(Date.UTC(2024, 0, 31), Date.UTC(2024, 2, 1));
    expect(d).toMatchObject({ years: 0, months: 1, days: 1 });
  });

  it('handles a leap day start', () => {
    const d = calendarDiff(Date.UTC(2000, 1, 29), Date.UTC(2001, 2, 1));
    expect(d).toMatchObject({ years: 1, months: 0, days: 1 });
  });

  it('carries hours, minutes and seconds', () => {
    const d = calendarDiff(Date.UTC(2026, 0, 1, 23, 59, 59), Date.UTC(2026, 0, 2, 0, 0, 1));
    expect(d).toMatchObject({ years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 2 });
  });

  it('never produces negative components when the dates are the wrong way round', () => {
    const d = calendarDiff(Date.UTC(2026, 8, 24), Date.UTC(2026, 8, 21));
    expect(d.reversed).toBe(true);
    expect(d.days).toBe(3);
    for (const value of [d.years, d.months, d.days, d.hours, d.minutes, d.seconds]) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns all zeros for an identical pair', () => {
    const d = calendarDiff(T_2023, T_2023);
    expect(d).toMatchObject({ years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('durationTotals', () => {
  it('reports each unit as a truncated total', () => {
    const t = durationTotals(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 31, 12));
    expect(t.days).toBe(30);
    expect(t.weeks).toBe(4);
    expect(t.hours).toBe(30 * 24 + 12);
    expect(t.minutes).toBe((30 * 24 + 12) * 60);
    expect(t.seconds).toBe((30 * 24 + 12) * 3600);
    expect(t.months).toBe(0);
  });

  it('marks a reversed pair without going negative', () => {
    const t = durationTotals(Date.UTC(2026, 0, 31), Date.UTC(2026, 0, 1));
    expect(t.reversed).toBe(true);
    expect(t.days).toBe(30);
  });
});

describe('businessDaysBetween', () => {
  // 21 September 2026 is a Monday; 24 September 2026 is a Thursday.
  it('counts a plain working week', () => {
    const r = businessDaysBetween(Date.UTC(2026, 8, 21), Date.UTC(2026, 8, 28));
    expect(r.businessDays).toBe(5);
    expect(r.weekendDays).toBe(2);
    expect(r.totalDays).toBe(7);
  });

  it('counts the end day when asked', () => {
    expect(
      businessDaysBetween(Date.UTC(2026, 8, 21), Date.UTC(2026, 8, 25), { inclusive: true })
        .businessDays,
    ).toBe(5);
    expect(
      businessDaysBetween(Date.UTC(2026, 8, 21), Date.UTC(2026, 8, 25)).businessDays,
    ).toBe(4);
  });

  it('returns zero across a weekend', () => {
    // Saturday 26th to Monday 28th, end exclusive.
    expect(businessDaysBetween(Date.UTC(2026, 8, 26), Date.UTC(2026, 8, 28)).businessDays).toBe(0);
  });

  it('is symmetric and non-negative when the arguments are swapped', () => {
    const a = businessDaysBetween(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 21));
    expect(a.businessDays).toBe(5);
  });

  it('scales to long spans without looping per day', () => {
    // 1970-01-01 (a Thursday) to 2020-01-01: 18,262 days, 13,044 weekdays.
    const r = businessDaysBetween(0, Date.UTC(2020, 0, 1));
    expect(r.totalDays).toBe(18_262);
    expect(r.businessDays + r.weekendDays).toBe(r.totalDays);
    expect(r.businessDays).toBe(13_044);
  });
});
