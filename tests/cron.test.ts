import { describe, expect, it } from 'vitest';
import {
  buildCron,
  CRON_MACROS,
  CRON_PRESETS,
  CronParseError,
  dayMatches,
  matchesInstant,
  nextRuns,
  nextRunsDetailed,
  parseCron,
} from '~/lib/cron';

/** Shorthand: the next `n` runs as ISO strings, so failures read clearly. */
const runs = (expr: string, fromIso: string, n = 5, timeZone = 'UTC'): string[] =>
  nextRuns(parseCron(expr), Date.parse(fromIso), n, { timeZone }).map((ms) =>
    new Date(ms).toISOString(),
  );

describe('field parsing', () => {
  it('parses the five standard fields', () => {
    const c = parseCron('*/15 9-17 * * 1-5');
    expect(c.fieldCount).toBe(5);
    expect(c.minute.values).toEqual([0, 15, 30, 45]);
    expect(c.hour.values).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(c.dayOfMonth.values.length).toBe(31);
    expect(c.month.values.length).toBe(12);
    expect(c.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    expect(c.second.values).toEqual([0]);
  });

  it('parses lists, ranges, steps and stepped ranges', () => {
    expect(parseCron('0,30 * * * *').minute.values).toEqual([0, 30]);
    expect(parseCron('0 0-4 * * *').hour.values).toEqual([0, 1, 2, 3, 4]);
    expect(parseCron('0 0-23/6 * * *').hour.values).toEqual([0, 6, 12, 18]);
    expect(parseCron('0 5/6 * * *').hour.values).toEqual([5, 11, 17, 23]);
    expect(parseCron('1,2,10-12,*/20 * * * *').minute.values).toEqual([0, 1, 2, 10, 11, 12, 20, 40]);
  });

  it('parses month and weekday names, including in ranges', () => {
    const c = parseCron('30 8 * JAN,JUL MON-FRI');
    expect(c.month.values).toEqual([1, 7]);
    expect(c.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron('0 0 * * sun').dayOfWeek.values).toEqual([0]);
  });

  it('treats day-of-week 7 as Sunday', () => {
    expect(parseCron('0 0 * * 7').dayOfWeek.values).toEqual([0]);
    expect(parseCron('0 0 * * 5-7').dayOfWeek.values).toEqual([0, 5, 6]);
  });

  it('supports a wrapping range', () => {
    expect(parseCron('0 22-2 * * *').hour.values).toEqual([0, 1, 2, 22, 23]);
  });

  it('reads six fields as seconds-first and seven as year-last', () => {
    const six = parseCron('*/30 * * * * *');
    expect(six.fieldCount).toBe(6);
    expect(six.second.values).toEqual([0, 30]);
    expect(six.warnings.join(' ')).toMatch(/read as seconds/);

    const seven = parseCron('0 0 12 1 1 ? 2030');
    expect(seven.fieldCount).toBe(7);
    expect(seven.year.values).toEqual([2030]);
  });

  it('accepts ? as "no specific value"', () => {
    const c = parseCron('0 0 12 ? * MON');
    expect(c.dayOfMonth.starred).toBe(true);
    expect(c.orRule).toBe(false);
  });
});

describe('macros', () => {
  it('expands every documented macro', () => {
    for (const [macro, expansion] of Object.entries(CRON_MACROS)) {
      const c = parseCron(macro);
      expect(c.macro).toBe(macro);
      expect(c.normalized).toBe(expansion);
    }
  });

  it('gives @daily, @weekly, @monthly and @yearly the right fields', () => {
    expect(parseCron('@hourly').minute.values).toEqual([0]);
    expect(parseCron('@daily').hour.values).toEqual([0]);
    expect(parseCron('@weekly').dayOfWeek.values).toEqual([0]);
    expect(parseCron('@monthly').dayOfMonth.values).toEqual([1]);
    expect(parseCron('@yearly').month.values).toEqual([1]);
    expect(parseCron('@annually').normalized).toBe(parseCron('@yearly').normalized);
    expect(parseCron('@midnight').normalized).toBe(parseCron('@daily').normalized);
  });

  it('is case-insensitive about macros', () => {
    expect(parseCron('@DAILY').normalized).toBe('0 0 * * *');
  });

  it('schedules from macros fire where expected', () => {
    expect(runs('@daily', '2026-09-24T10:00:00Z', 2)).toEqual([
      '2026-09-25T00:00:00.000Z',
      '2026-09-26T00:00:00.000Z',
    ]);
    // 27 September 2026 is a Sunday.
    expect(runs('@weekly', '2026-09-24T10:00:00Z', 2)).toEqual([
      '2026-09-27T00:00:00.000Z',
      '2026-10-04T00:00:00.000Z',
    ]);
    expect(runs('@monthly', '2026-09-24T10:00:00Z', 2)).toEqual([
      '2026-10-01T00:00:00.000Z',
      '2026-11-01T00:00:00.000Z',
    ]);
    expect(runs('@yearly', '2026-09-24T10:00:00Z', 1)).toEqual(['2027-01-01T00:00:00.000Z']);
  });

  it('refuses @reboot, which has no schedule', () => {
    expect(() => parseCron('@reboot')).toThrow(/no schedule/);
    expect(() => parseCron('@fortnightly')).toThrow(/not a cron macro/);
  });
});

describe('the day-of-month / day-of-week OR rule', () => {
  it('ORs the two day fields when neither begins with a star', () => {
    const c = parseCron('0 0 1 * 1');
    expect(c.orRule).toBe(true);
    expect(c.warnings.join(' ')).toMatch(/ORs them/);

    // January 2026: the 1st is a Thursday; Mondays are the 5th, 12th, 19th, 26th.
    // February 2026: the 1st is a Sunday; Mondays are the 2nd, 9th, 16th, 23rd.
    expect(runs('0 0 1 * 1', '2025-12-31T12:00:00Z', 10)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-05T00:00:00.000Z',
      '2026-01-12T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
      '2026-01-26T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      '2026-02-02T00:00:00.000Z',
      '2026-02-09T00:00:00.000Z',
      '2026-02-16T00:00:00.000Z',
      '2026-02-23T00:00:00.000Z',
    ]);
  });

  it('ANDs the two day fields when either begins with a star', () => {
    // */2 still *begins* with a star, so Vixie cron ANDs: odd-numbered Mondays.
    const c = parseCron('0 0 */2 * 1');
    expect(c.orRule).toBe(false);
    expect(c.dayOfMonth.starred).toBe(true);
    expect(runs('0 0 */2 * 1', '2026-01-01T00:00:01Z', 5)).toEqual([
      '2026-01-05T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
      '2026-02-09T00:00:00.000Z',
      '2026-02-23T00:00:00.000Z',
      '2026-03-09T00:00:00.000Z',
    ]);
  });

  it('uses only day-of-month when day-of-week is a star', () => {
    expect(parseCron('0 0 1 * *').orRule).toBe(false);
    expect(runs('0 0 1 * *', '2025-12-31T12:00:00Z', 3)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]);
  });

  it('uses only day-of-week when day-of-month is a star or ?', () => {
    expect(runs('0 0 * * 1', '2026-01-01T00:00:00Z', 3)).toEqual([
      '2026-01-05T00:00:00.000Z',
      '2026-01-12T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
    ]);
    expect(runs('0 0 12 ? * MON', '2026-09-24T00:00:00Z', 2)).toEqual([
      '2026-09-28T12:00:00.000Z',
      '2026-10-05T12:00:00.000Z',
    ]);
  });

  it('exposes the rule through dayMatches', () => {
    const or = parseCron('0 0 1 * 1');
    const and = parseCron('0 0 1 * *');
    expect(dayMatches(or, 2026, 1, 5)).toBe(true); // a Monday, not the 1st
    expect(dayMatches(and, 2026, 1, 5)).toBe(false);
    expect(dayMatches(or, 2026, 1, 1)).toBe(true); // the 1st, not a Monday
  });
});

describe('next run sequences', () => {
  it('walks a quarter-hourly working-hours schedule', () => {
    expect(runs('*/15 9-17 * * 1-5', '2026-09-24T08:50:00Z', 5)).toEqual([
      '2026-09-24T09:00:00.000Z',
      '2026-09-24T09:15:00.000Z',
      '2026-09-24T09:30:00.000Z',
      '2026-09-24T09:45:00.000Z',
      '2026-09-24T10:00:00.000Z',
    ]);
  });

  it('rolls over a weekend', () => {
    // Friday 25 September 2026: 17:45 is the day's last run, then nothing
    // until Monday the 28th at 09:00 — Saturday and Sunday are excluded.
    expect(runs('*/15 9-17 * * 1-5', '2026-09-25T17:44:00Z', 2)).toEqual([
      '2026-09-25T17:45:00.000Z',
      '2026-09-28T09:00:00.000Z',
    ]);
  });

  it('excludes the starting instant unless asked to include it', () => {
    const c = parseCron('0 * * * *');
    const from = Date.parse('2026-09-24T09:00:00Z');
    expect(nextRuns(c, from, 1)[0]).toBe(Date.parse('2026-09-24T10:00:00Z'));
    expect(nextRuns(c, from, 1, { inclusive: true })[0]).toBe(from);
  });

  it('handles a schedule that only exists in leap years', () => {
    expect(runs('0 0 29 2 *', '2026-01-01T00:00:00Z', 2)).toEqual([
      '2028-02-29T00:00:00.000Z',
      '2032-02-29T00:00:00.000Z',
    ]);
  });

  it('handles seconds and year fields', () => {
    expect(runs('*/30 * * * * *', '2026-09-24T09:00:05Z', 3)).toEqual([
      '2026-09-24T09:00:30.000Z',
      '2026-09-24T09:01:00.000Z',
      '2026-09-24T09:01:30.000Z',
    ]);
    expect(runs('0 0 12 1 1 ? 2030', '2026-09-24T00:00:00Z', 3)).toEqual([
      '2030-01-01T12:00:00.000Z',
    ]);
  });

  it('returns nothing for a schedule that can never fire', () => {
    const c = parseCron('0 0 30 2 *');
    expect(c.warnings.join(' ')).toMatch(/never fire/);
    expect(nextRuns(c, Date.parse('2026-01-01T00:00:00Z'), 5)).toEqual([]);
  });

  it('agrees with matchesInstant', () => {
    const c = parseCron('*/15 9-17 * * 1-5');
    for (const ms of nextRuns(c, Date.parse('2026-09-24T08:00:00Z'), 8)) {
      expect(matchesInstant(c, ms)).toBe(true);
    }
    expect(matchesInstant(c, Date.parse('2026-09-24T09:07:00Z'))).toBe(false);
  });
});

describe('daylight saving', () => {
  // US DST 2026: clocks forward 08 March, back 01 November.
  const NY = 'America/New_York';

  it('keeps a wall-clock schedule fixed across the spring transition', () => {
    // Noon stays noon locally, which moves from 17:00Z to 16:00Z.
    expect(runs('0 12 * * *', '2026-03-06T00:00:00Z', 4, NY)).toEqual([
      '2026-03-06T17:00:00.000Z',
      '2026-03-07T17:00:00.000Z',
      '2026-03-08T16:00:00.000Z',
      '2026-03-09T16:00:00.000Z',
    ]);
  });

  it('skips a time the spring-forward jump erases', () => {
    // 02:30 does not exist on 8 March 2026 in New York.
    expect(runs('30 2 * * *', '2026-03-06T00:00:00Z', 3, NY)).toEqual([
      '2026-03-06T07:30:00.000Z',
      '2026-03-07T07:30:00.000Z',
      '2026-03-09T06:30:00.000Z',
    ]);
  });

  it('fires once, on the first pass, when the clock repeats an hour', () => {
    // 01:30 happens twice on 1 November 2026: 05:30Z (EDT) and 06:30Z (EST).
    const detailed = nextRunsDetailed(
      parseCron('30 1 * * *'),
      Date.parse('2026-10-31T00:00:00Z'),
      3,
      { timeZone: NY },
    );
    expect(detailed.map((r) => new Date(r.ms).toISOString())).toEqual([
      '2026-10-31T05:30:00.000Z',
      '2026-11-01T05:30:00.000Z',
      '2026-11-02T06:30:00.000Z',
    ]);
    expect(detailed[1]!.dstNote).toMatch(/happens twice/);
  });

  it('is unaffected in a zone without daylight saving', () => {
    expect(runs('0 12 * * *', '2026-03-06T00:00:00Z', 2, 'Asia/Tokyo')).toEqual([
      '2026-03-06T03:00:00.000Z',
      '2026-03-07T03:00:00.000Z',
    ]);
  });

  it('follows the southern hemisphere transition too', () => {
    // Sydney leaves DST at 03:00 on 5 April 2026: +11:00 becomes +10:00, so
    // 09:00 local moves from 22:00Z the previous day to 23:00Z.
    expect(runs('0 9 * * *', '2026-04-03T00:00:00Z', 4, 'Australia/Sydney')).toEqual([
      '2026-04-03T22:00:00.000Z', // 4 April 09:00 AEDT (+11)
      '2026-04-04T23:00:00.000Z', // 5 April 09:00 AEST (+10, the switch was at 03:00)
      '2026-04-05T23:00:00.000Z', // 6 April 09:00 AEST
      '2026-04-06T23:00:00.000Z', // 7 April 09:00 AEST
    ]);
  });
});

describe('descriptions', () => {
  const describe_ = (expr: string) => parseCron(expr).description;

  it('describes common schedules in plain English', () => {
    expect(describe_('*/15 * * * *')).toBe('Every 15 minutes, every day.');
    expect(describe_('0 9 * * 1-5')).toBe('At 09:00, on Monday through Friday.');
    expect(describe_('0 0 * * *')).toBe('At 00:00, every day.');
    expect(describe_('@daily')).toBe('At 00:00, every day.');
    expect(describe_('* * * * *')).toBe('Every minute, every day.');
    expect(describe_('*/30 * * * * *')).toBe('Every 30 seconds, every day.');
  });

  it('spells out the OR rule in the description', () => {
    expect(describe_('0 0 1 * 1')).toBe('At 00:00, on the 1st, and also on Monday.');
  });

  it('names months and weekdays', () => {
    expect(describe_('30 8 * JAN,JUL MON-FRI')).toContain('January and July');
    expect(describe_('30 8 * JAN,JUL MON-FRI')).toContain('Monday through Friday');
    expect(describe_('0 3 1 1,4,7,10 *')).toContain('January, April, July and October');
  });

  it('describes hour ranges and steps', () => {
    expect(describe_('0 9-17 * * *')).toContain('between 09:00 and 17:59');
    expect(describe_('0 */6 * * *')).toContain('every 6 hours');
  });

  it('gives every field its own reading', () => {
    const c = parseCron('*/15 9-17 * * 1-5');
    expect(c.minute.description).toMatch(/Every 15th minute/);
    expect(c.hour.description).toBe('9 through 17');
    expect(c.dayOfMonth.description).toBe('Every day of month');
    expect(c.dayOfWeek.description).toBe('Monday through Friday');
  });

  it('describes every preset without throwing', () => {
    for (const preset of CRON_PRESETS) {
      const c = parseCron(preset.expression);
      expect(c.description.endsWith('.')).toBe(true);
      expect(c.description.length).toBeGreaterThan(8);
      expect(nextRuns(c, Date.parse('2026-09-24T00:00:00Z'), 1).length).toBe(1);
    }
  });
});

describe('errors', () => {
  it('rejects the wrong number of fields', () => {
    expect(() => parseCron('* * *')).toThrow(/has 3/);
    expect(() => parseCron('* * * * * * * *')).toThrow(/has 8/);
    expect(() => parseCron('   ')).toThrow(/Enter a cron expression/);
  });

  it('rejects out-of-range values, naming the field', () => {
    expect(() => parseCron('60 * * * *')).toThrow(/Minute must be between 0 and 59/);
    expect(() => parseCron('0 24 * * *')).toThrow(/Hour must be between 0 and 23/);
    expect(() => parseCron('0 0 32 * *')).toThrow(/Day of month must be between 1 and 31/);
    expect(() => parseCron('0 0 * 13 *')).toThrow(/Month must be between 1 and 12/);
    try {
      parseCron('0 0 * * 9');
    } catch (err) {
      expect(err).toBeInstanceOf(CronParseError);
      expect((err as CronParseError).field).toBe('dayOfWeek');
    }
  });

  it('rejects Quartz extensions rather than guessing', () => {
    expect(() => parseCron('0 0 L * *')).toThrow(/Quartz extension/);
    expect(() => parseCron('0 0 * * 5#3')).toThrow(/Quartz extension/);
    expect(() => parseCron('0 0 15W * *')).toThrow(/Quartz extension/);
  });

  it('does not mistake JUL or WED for an extension', () => {
    expect(() => parseCron('0 0 * JUL WED')).not.toThrow();
    expect(parseCron('0 0 * JUL WED').month.values).toEqual([7]);
  });

  it('rejects bad steps and malformed lists', () => {
    expect(() => parseCron('*/0 * * * *')).toThrow(/invalid step/);
    expect(() => parseCron('0,,5 * * * *')).toThrow(/empty item/);
    expect(() => parseCron('0 0 * * FUNDAY')).toThrow(/not a valid day of week name/i);
  });

  it('rejects ? outside the day fields', () => {
    expect(() => parseCron('? * * * *')).toThrow(/only meaningful in day-of-month/);
  });

  it('warns about days that some months do not have', () => {
    expect(parseCron('0 0 31 * *').warnings.join(' ')).toMatch(/does not exist in every month/);
  });
});

describe('buildCron', () => {
  it('assembles the standard five fields', () => {
    expect(
      buildCron({ minute: '0', hour: '9', dayOfMonth: '*', month: '*', dayOfWeek: '1-5' }),
    ).toBe('0 9 * * 1-5');
  });

  it('adds optional seconds and year fields only when supplied', () => {
    expect(
      buildCron({ second: '30', minute: '0', hour: '9', dayOfMonth: '*', month: '*', dayOfWeek: '*' }),
    ).toBe('30 0 9 * * *');
    expect(
      buildCron({
        second: '0',
        minute: '0',
        hour: '9',
        dayOfMonth: '*',
        month: '*',
        dayOfWeek: '*',
        year: '2030',
      }),
    ).toBe('0 0 9 * * * 2030');
  });

  it('falls back to * for an empty field', () => {
    expect(buildCron({ minute: '', hour: '', dayOfMonth: '', month: '', dayOfWeek: '' })).toBe(
      '* * * * *',
    );
  });

  it('produces expressions its own parser accepts', () => {
    const expr = buildCron({
      minute: '*/10',
      hour: '8-18',
      dayOfMonth: '*',
      month: 'MAR-NOV',
      dayOfWeek: 'MON-FRI',
    });
    expect(() => parseCron(expr)).not.toThrow();
    expect(parseCron(expr).month.values).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
