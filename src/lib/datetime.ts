/**
 * Date, time, epoch and timezone helpers shared by the Time family of tools.
 *
 * Pure and DOM-free so it can be unit-tested in Node, and so the same parsing
 * rules back the timestamp converter, the ISO converter, the timezone
 * converter, the difference calculator and the live clock.
 *
 * Two design rules matter here:
 *
 *  1. **Nothing about timezones is hard-coded.** Every offset, abbreviation
 *     and DST answer is derived from `Intl.DateTimeFormat` with a `timeZone`
 *     option, which reads the platform's IANA database. That is the only way
 *     "what was the offset in Santiago on 3 September 2019" can be correct.
 *
 *  2. **Calendar maths is done on explicit fields**, never by adding
 *     milliseconds, because a month is not 30 days and a day is not always
 *     86,400,000 ms in a zone that observes daylight saving.
 */

// ─── Constants ────────────────────────────────────────────────────────────

export const MS = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
} as const;

/**
 * The ECMAScript time-value range: ±8,640,000,000,000,000 ms, which is
 * ±100,000,000 days around the epoch, i.e. 20 April 271821 BC to
 * 13 September 275760 AD. Anything outside it is not a representable Date.
 */
export const MAX_TIME_MS = 8_640_000_000_000_000;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));
const DAY_ABBR = DAY_NAMES.map((d) => d.slice(0, 3));

// ─── Epoch timestamps ─────────────────────────────────────────────────────

export type TimestampUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';

export interface UnitDetection {
  unit: TimestampUnit;
  /** Digit count of the integer part, ignoring any sign. */
  digits: number;
  /** True when the digit count is the canonical width for the unit. */
  confident: boolean;
  /** Why this unit was chosen, in words a user can check. */
  reason: string;
}

export interface ParsedTimestamp extends UnitDetection {
  /** Epoch milliseconds — the canonical internal representation. */
  ms: number;
  /** Sub-millisecond remainder that a Date cannot hold, e.g. 'µs 123'. */
  truncated: string | null;
  /** The unit the caller forced, if any. */
  forced: boolean;
}

/**
 * Decide whether a bare number is seconds, milliseconds, microseconds or
 * nanoseconds, purely from its digit count.
 *
 * The heuristic, and the reason it works:
 *
 * | Digits | Assumed unit | Range that digit count covers            |
 * | -----: | ------------ | ---------------------------------------- |
 * |   1–11 | seconds      | 10 digits ⇒ 2001-09-09 … 2286-11-20      |
 * |  12–14 | milliseconds | 13 digits ⇒ 2001-09-09 … 2286-11-20      |
 * |  15–17 | microseconds | 16 digits ⇒ 2001-09-09 … 2286-11-20      |
 * |   ≥ 18 | nanoseconds  | 19 digits ⇒ 2001-09-09 … 2262-04-11      |
 *
 * Every present-day timestamp is 10 digits in seconds and 13 in milliseconds,
 * and has been since 2001-09-09T01:46:40Z. It stays that way until 2286. So
 * the digit count is not a guess for current data — it is exact. The cutoff
 * sits at 12 digits because 100,000,000,000 seconds is the year 5138, which no
 * real log line contains, while the same value in milliseconds is 1973.
 *
 * Nanosecond timestamps (Go's `UnixNano`, Prometheus, OpenTelemetry) exceed
 * `Number.MAX_SAFE_INTEGER`, so they are converted with BigInt and the
 * sub-millisecond remainder is reported rather than silently dropped.
 */
export function detectTimestampUnit(raw: string | number): UnitDetection {
  const text = String(raw).trim();
  const digits = text.replace(/^[+-]/, '').split('.')[0]!.replace(/\D/g, '').length;

  if (digits >= 18) {
    return {
      unit: 'nanoseconds',
      digits,
      confident: digits === 19,
      reason: `${digits} digits — too long for microseconds, so this is nanoseconds since the epoch.`,
    };
  }
  if (digits >= 15) {
    return {
      unit: 'microseconds',
      digits,
      confident: digits === 16,
      reason: `${digits} digits — the width of a microsecond timestamp (16 digits today).`,
    };
  }
  if (digits >= 12) {
    return {
      unit: 'milliseconds',
      digits,
      confident: digits === 13,
      reason:
        digits === 13
          ? '13 digits — the exact width of a millisecond timestamp between 2001 and 2286.'
          : `${digits} digits — read as milliseconds, since that many seconds would be the year ${new Date(
              Number(text.replace(/[^\d-]/g, '')) * 1000,
            ).getUTCFullYear()}.`,
    };
  }
  return {
    unit: 'seconds',
    digits,
    confident: digits === 10,
    reason:
      digits === 10
        ? '10 digits — the exact width of a second timestamp between 2001 and 2286.'
        : `${digits} digit${digits === 1 ? '' : 's'} — short enough that seconds is the only sensible reading.`,
  };
}

/**
 * Parse an epoch timestamp written in any of the four common units.
 *
 * Accepts thousands separators and underscores (`1_700_000_000`), a leading
 * sign, and a fractional part (`1700000000.123`). Pass an explicit `unit` to
 * override detection.
 */
export function parseTimestamp(raw: string | number, unit: TimestampUnit | 'auto' = 'auto'): ParsedTimestamp {
  const text = String(raw).trim().replace(/[_,\s]/g, '');
  if (!text) throw new Error('Enter a timestamp first.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    throw new Error(
      `"${String(raw).trim()}" is not a number. A Unix timestamp is digits only — try 1700000000 or 1700000000000.`,
    );
  }

  const detected = detectTimestampUnit(text);
  const chosen = unit === 'auto' ? detected.unit : unit;

  const negative = text.startsWith('-');
  const body = text.replace(/^[+-]/, '');
  const [intPart = '0', fracPart = ''] = body.split('.');

  // Scale to whole nanoseconds with BigInt so a 19-digit value keeps every
  // digit, then divide down to milliseconds. Number would lose the tail above
  // 2^53 (9,007,199,254,740,992).
  const nanosPerUnit: Record<TimestampUnit, bigint> = {
    seconds: 1_000_000_000n,
    milliseconds: 1_000_000n,
    microseconds: 1_000n,
    nanoseconds: 1n,
  };
  const scale = nanosPerUnit[chosen];
  const fracDigits = (fracPart + '000000000').slice(0, 9);
  const fracNanos = (BigInt(fracDigits) * scale) / 1_000_000_000n;
  let totalNanos = BigInt(intPart) * scale + fracNanos;
  if (negative) totalNanos = -totalNanos;

  const msBig = totalNanos / 1_000_000n;
  const remainderNanos = totalNanos - msBig * 1_000_000n;
  const ms = Number(msBig);

  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_TIME_MS) {
    throw new Error(
      `${text} ${chosen} is outside the range a date can represent (±8.64×10¹⁵ ms, about ±273,790 years). Check the unit.`,
    );
  }

  let truncated: string | null = null;
  if (remainderNanos !== 0n) {
    const abs = remainderNanos < 0n ? -remainderNanos : remainderNanos;
    truncated =
      abs % 1_000n === 0n
        ? `${abs / 1_000n} µs beyond the millisecond`
        : `${abs} ns beyond the millisecond`;
  }

  return {
    ms,
    unit: chosen,
    digits: detected.digits,
    confident: unit === 'auto' ? detected.confident : true,
    reason: unit === 'auto' ? detected.reason : `You selected ${chosen}.`,
    truncated,
    forced: unit !== 'auto',
  };
}

/** Render epoch milliseconds in the requested unit, as an exact decimal string. */
export function timestampIn(ms: number, unit: TimestampUnit): string {
  switch (unit) {
    case 'seconds':
      return String(Math.floor(ms / 1000));
    case 'milliseconds':
      return String(Math.trunc(ms));
    case 'microseconds':
      return String(BigInt(Math.trunc(ms)) * 1_000n);
    case 'nanoseconds':
      return String(BigInt(Math.trunc(ms)) * 1_000_000n);
  }
}

// ─── Calendar primitives ──────────────────────────────────────────────────

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in `month` (1–12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30;
}

/**
 * `Date.UTC` maps years 0–99 onto 1900–1999. This builds a time value that
 * means what it says for every year, which matters for historical dates.
 */
export function utcFromFields(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): number {
  const t = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  if (year >= 0 && year <= 99) {
    const d = new Date(t);
    d.setUTCFullYear(year);
    return d.getTime();
  }
  return t;
}

/** Add whole months to an instant's UTC calendar date, clamping the day. */
export function addMonthsUtc(ms: number, months: number): number {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  // 31 Jan + 1 month is 28 Feb, not 3 March. Every date library clamps here.
  const day = Math.min(d.getUTCDate(), daysInMonth(targetYear, targetMonth + 1));
  return utcFromFields(
    targetYear,
    targetMonth + 1,
    day,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/** ISO 8601 week date, e.g. `2026-W39-4`. Weeks start on Monday. */
export function isoWeekDate(ms: number): string {
  const d = new Date(ms);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // ISO weekday: Monday = 1 … Sunday = 7.
  const dayNumber = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  // Thursday decides the year a week belongs to (ISO 8601 §4.3.2.2).
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((target.getTime() - yearStart) / MS.day + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}-${dayNumber}`;
}

/** ISO 8601 ordinal date, e.g. `2026-268`. */
export function ordinalDate(ms: number): string {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const day = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / MS.day) + 1;
  return `${d.getUTCFullYear()}-${String(day).padStart(3, '0')}`;
}

// ─── Timezones, via Intl ──────────────────────────────────────────────────

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        era: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
      });
    } catch {
      throw new Error(
        `"${timeZone}" is not a time zone this browser recognises. Use an IANA name like Europe/Berlin or America/Sao_Paulo.`,
      );
    }
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Break an instant into the wall-clock fields shown in `timeZone`. */
export function getWallTime(ms: number, timeZone: string): WallTime {
  const parts = partsFormatter(timeZone).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const era = get('era');
  let year = Number(get('year'));
  // "1 BC" is astronomical year 0, "2 BC" is −1, and so on.
  if (/^B/i.test(era)) year = 1 - year;
  return {
    year,
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    millisecond: ((ms % 1000) + 1000) % 1000,
    weekday: Math.max(0, DAY_ABBR.indexOf(get('weekday'))),
  };
}

/** Offset of `timeZone` at that instant, in milliseconds east of UTC. */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const w = getWallTime(ms, timeZone);
  const asUtc = utcFromFields(w.year, w.month, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Offset of `timeZone` at that instant, in minutes east of UTC.
 * Computed from the platform's IANA data, so DST is applied for the *given*
 * instant — New York is −300 in January and −240 in July, automatically.
 */
export function zoneOffsetMinutes(ms: number, timeZone: string): number {
  return Math.round(zoneOffsetMs(ms, timeZone) / 60_000);
}

/** Format an offset in minutes as `+05:30`, `-04:00` or `Z`. */
export function formatOffset(minutes: number, zeroAsZ = false): string {
  if (minutes === 0 && zeroAsZ) return 'Z';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** The short zone name the platform shows, e.g. `EDT`, `CET`, `GMT+5:30`. */
export function zoneAbbreviation(ms: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(
      new Date(ms),
    );
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

export interface ZoneInfo {
  timeZone: string;
  offsetMinutes: number;
  /** The zone's non-DST offset for the year containing `ms`. */
  standardOffsetMinutes: number;
  /** True when the clock is currently shifted forward from standard time. */
  dst: boolean;
  abbreviation: string;
}

/**
 * Everything the UI needs to describe a zone at one instant.
 *
 * DST is detected by comparing this instant's offset with the smallest offset
 * the zone uses during the same year. Daylight saving only ever moves clocks
 * forward, so the yearly minimum is standard time — and sampling January and
 * July covers both hemispheres.
 */
export function zoneInfo(ms: number, timeZone: string): ZoneInfo {
  const offsetMinutes = zoneOffsetMinutes(ms, timeZone);
  const year = new Date(ms).getUTCFullYear();
  const jan = zoneOffsetMinutes(Date.UTC(year, 0, 15), timeZone);
  const jul = zoneOffsetMinutes(Date.UTC(year, 6, 15), timeZone);
  const standardOffsetMinutes = Math.min(jan, jul);
  return {
    timeZone,
    offsetMinutes,
    standardOffsetMinutes,
    dst: offsetMinutes > standardOffsetMinutes,
    abbreviation: zoneAbbreviation(ms, timeZone),
  };
}

export type WallConversionStatus = 'exact' | 'ambiguous' | 'skipped';

export interface WallConversion {
  ms: number;
  status: WallConversionStatus;
  offsetMinutes: number;
  /** Populated for 'ambiguous': the second instant with the same wall time. */
  alternativeMs?: number;
  note?: string;
}

/**
 * Convert a wall-clock reading in `timeZone` to an instant.
 *
 * Two local times a year are not a single instant:
 *
 *  - **Skipped.** 02:30 on the spring-forward day never happens. Reported as
 *    `skipped`, with `ms` set to the instant the clock jumps to.
 *  - **Ambiguous.** 01:30 on the autumn day happens twice. Reported as
 *    `ambiguous`, resolved to the *first* (still-DST) occurrence, with the
 *    second in `alternativeMs`.
 *
 * The search samples the zone's offset a day either side of the target, so a
 * transition of any size — including Lord Howe Island's 30 minutes — is found.
 */
export function wallTimeToUtc(
  wall: Omit<WallTime, 'weekday' | 'millisecond'> & { millisecond?: number },
  timeZone: string,
): WallConversion {
  const naive = utcFromFields(
    wall.year,
    wall.month,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond ?? 0,
  );

  const offsets = new Set([
    zoneOffsetMs(naive - MS.day, timeZone),
    zoneOffsetMs(naive, timeZone),
    zoneOffsetMs(naive + MS.day, timeZone),
  ]);

  const matches: number[] = [];
  for (const offset of offsets) {
    const candidate = naive - offset;
    const back = getWallTime(candidate, timeZone);
    if (
      back.year === wall.year &&
      back.month === wall.month &&
      back.day === wall.day &&
      back.hour === wall.hour &&
      back.minute === wall.minute &&
      back.second === wall.second
    ) {
      matches.push(candidate);
    }
  }
  matches.sort((a, b) => a - b);

  if (matches.length === 0) {
    const shifted = naive - zoneOffsetMs(naive + MS.day, timeZone);
    return {
      ms: shifted,
      status: 'skipped',
      offsetMinutes: zoneOffsetMinutes(shifted, timeZone),
      note: `${pad2(wall.hour)}:${pad2(wall.minute)} does not exist on this date in ${timeZone} — the clocks jump forward past it.`,
    };
  }
  if (matches.length > 1) {
    return {
      ms: matches[0]!,
      status: 'ambiguous',
      offsetMinutes: zoneOffsetMinutes(matches[0]!, timeZone),
      alternativeMs: matches[matches.length - 1],
      note: `${pad2(wall.hour)}:${pad2(wall.minute)} happens twice on this date in ${timeZone}. The earlier occurrence was used.`,
    };
  }
  return { ms: matches[0]!, status: 'exact', offsetMinutes: zoneOffsetMinutes(matches[0]!, timeZone) };
}

/** The visitor's own zone, or UTC when the browser will not say. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * A short, representative zone list for browsers without
 * `Intl.supportedValuesOf` (Safari gained it in 17, Firefox in 93).
 */
export const FALLBACK_TIME_ZONES = [
  'UTC',
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
  'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Toronto',
  'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Atlantic/Reykjavik', 'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid',
  'Europe/Paris', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Zurich',
  'Europe/Rome', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Athens', 'Europe/Helsinki',
  'Europe/Kyiv', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Casablanca', 'Africa/Lagos',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Nairobi', 'Asia/Jerusalem', 'Asia/Dubai',
  'Asia/Tehran', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai',
  'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo', 'Australia/Perth', 'Australia/Adelaide',
  'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Fiji',
];

/** Every zone the browser knows, or the fallback list. Always includes UTC. */
export function listTimeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf;
  let zones: string[];
  try {
    zones = supported ? supported('timeZone') : FALLBACK_TIME_ZONES.slice();
  } catch {
    zones = FALLBACK_TIME_ZONES.slice();
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  return zones;
}

// ─── Formatting ───────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(Math.abs(n)).padStart(2, '0');
}

function padYear(year: number): string {
  // ISO 8601 needs an explicit sign and six digits outside 0000–9999.
  if (year >= 0 && year <= 9999) return String(year).padStart(4, '0');
  const sign = year < 0 ? '-' : '+';
  return sign + String(Math.abs(year)).padStart(6, '0');
}

export interface IsoOptions {
  /** Include `.mmm`. Default: only when the value is not a whole second. */
  milliseconds?: boolean;
  /** Use `Z` rather than `+00:00` at zero offset. Default true. */
  zeroAsZ?: boolean;
  /** Space instead of `T` — RFC 3339 §5.6 allows it; ISO 8601 does not. */
  spaceSeparator?: boolean;
}

function isoFromWall(wall: WallTime, offsetMinutes: number, opts: IsoOptions = {}): string {
  const showMs = opts.milliseconds ?? wall.millisecond !== 0;
  const sep = opts.spaceSeparator ? ' ' : 'T';
  const time = `${pad2(wall.hour)}:${pad2(wall.minute)}:${pad2(wall.second)}${
    showMs ? `.${String(wall.millisecond).padStart(3, '0')}` : ''
  }`;
  return `${padYear(wall.year)}-${pad2(wall.month)}-${pad2(wall.day)}${sep}${time}${formatOffset(
    offsetMinutes,
    opts.zeroAsZ ?? true,
  )}`;
}

/** ISO 8601 / RFC 3339 in UTC, e.g. `2026-09-24T14:30:05.000Z`. */
export function formatIsoUtc(ms: number, opts: IsoOptions = {}): string {
  return isoFromWall(getWallTime(ms, 'UTC'), 0, { milliseconds: true, ...opts });
}

/** ISO 8601 with the real local offset of `timeZone`, e.g. `…T10:30:05-04:00`. */
export function formatIsoInZone(ms: number, timeZone: string, opts: IsoOptions = {}): string {
  return isoFromWall(getWallTime(ms, timeZone), zoneOffsetMinutes(ms, timeZone), opts);
}

/** ISO 8601 with a fixed offset supplied in minutes. */
export function formatIsoWithOffset(ms: number, offsetMinutes: number, opts: IsoOptions = {}): string {
  const shifted = getWallTime(ms + offsetMinutes * MS.minute, 'UTC');
  return isoFromWall(shifted, offsetMinutes, opts);
}

/**
 * RFC 2822 §3.3 date-time — the format in email `Date:` headers, HTTP dates
 * and `new Date().toString()`, e.g. `Thu, 24 Sep 2026 14:30:05 +0000`.
 */
export function formatRfc2822(ms: number, timeZone = 'UTC'): string {
  const w = getWallTime(ms, timeZone);
  const offset = zoneOffsetMinutes(ms, timeZone);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${DAY_ABBR[w.weekday]}, ${pad2(w.day)} ${MONTH_ABBR[w.month - 1]} ${padYear(w.year)} ` +
    `${pad2(w.hour)}:${pad2(w.minute)}:${pad2(w.second)} ` +
    `${sign}${pad2(Math.floor(abs / 60))}${pad2(abs % 60)}`
  );
}

/** Readable long form, e.g. `Thursday, 24 September 2026, 14:30:05`. */
export function formatHuman(ms: number, timeZone = 'UTC'): string {
  const w = getWallTime(ms, timeZone);
  return `${DAY_NAMES[w.weekday]}, ${w.day} ${MONTH_NAMES[w.month - 1]} ${padYear(w.year)}, ${pad2(
    w.hour,
  )}:${pad2(w.minute)}:${pad2(w.second)}`;
}

/** Compact grid form, e.g. `2026-09-24 14:30:05`. */
export function formatShort(ms: number, timeZone = 'UTC'): string {
  const w = getWallTime(ms, timeZone);
  return `${padYear(w.year)}-${pad2(w.month)}-${pad2(w.day)} ${pad2(w.hour)}:${pad2(w.minute)}:${pad2(
    w.second,
  )}`;
}

/** Value for an `<input type="datetime-local">`, e.g. `2026-09-24T14:30`. */
export function toDatetimeLocalValue(ms: number, timeZone: string, withSeconds = false): string {
  const w = getWallTime(ms, timeZone);
  const base = `${padYear(w.year)}-${pad2(w.month)}-${pad2(w.day)}T${pad2(w.hour)}:${pad2(w.minute)}`;
  return withSeconds ? `${base}:${pad2(w.second)}` : base;
}

/**
 * Relative phrasing — "3 hours ago", "in 2 days".
 *
 * Thresholds are chosen so the wording never lies by more than half a unit,
 * and the unit only grows once the smaller one would read absurdly
 * ("in 90 minutes" is fine, "in 2,880 minutes" is not).
 */
export function formatRelative(ms: number, nowMs: number = Date.now()): string {
  const diff = ms - nowMs;
  const abs = Math.abs(diff);
  const rtf =
    typeof Intl.RelativeTimeFormat === 'function'
      ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
      : null;

  const say = (value: number, unit: Intl.RelativeTimeFormatUnit): string => {
    if (rtf) return rtf.format(value, unit);
    const plural = Math.abs(value) === 1 ? unit : `${unit}s`;
    return value < 0 ? `${Math.abs(value)} ${plural} ago` : `in ${value} ${plural}`;
  };

  if (abs < 5 * MS.second) return 'just now';
  if (abs < 90 * MS.second) return say(Math.round(diff / MS.second), 'second');
  if (abs < 90 * MS.minute) return say(Math.round(diff / MS.minute), 'minute');
  if (abs < 36 * MS.hour) return say(Math.round(diff / MS.hour), 'hour');
  if (abs < 26 * MS.day) return say(Math.round(diff / MS.day), 'day');

  // Beyond a month, count real calendar months so "1 month ago" is a month.
  const from = Math.min(ms, nowMs);
  const to = Math.max(ms, nowMs);
  const diffCal = calendarDiff(from, to);
  const totalMonths = diffCal.years * 12 + diffCal.months;
  const sign = diff < 0 ? -1 : 1;
  if (totalMonths < 12) return say(sign * Math.max(1, totalMonths), 'month');
  return say(sign * diffCal.years, 'year');
}

// ─── Parsing arbitrary input ──────────────────────────────────────────────

export type ParsedKind = 'timestamp' | 'iso' | 'rfc2822' | 'date-only' | 'other';

export interface ParsedDateTime {
  ms: number;
  kind: ParsedKind;
  /** True when the input itself carried `Z` or an explicit offset. */
  hasOffset: boolean;
  /** The offset the input carried, in minutes. Null when it carried none. */
  offsetMinutes: number | null;
  /** A short, honest note about how the value was interpreted. */
  note: string;
}

const ISO_RE =
  /^(?<year>[+-]?\d{4,6})-(?<month>\d{2})-(?<day>\d{2})(?:[T ](?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:[.,](?<fraction>\d{1,9}))?)?)?(?<offset>Z|z|[+-]\d{2}:?\d{2})?$/;

const RFC2822_RE =
  /^(?:(?<dow>Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?(?<day>\d{1,2})\s+(?<month>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(?<year>\d{2,4})\s+(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?(?:\s+(?<offset>[+-]\d{4}|UT|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|[A-IK-Za-ik-z]))?$/;

const OBSOLETE_ZONES: Record<string, number> = {
  UT: 0, GMT: 0, Z: 0,
  EST: -300, EDT: -240, CST: -360, CDT: -300,
  MST: -420, MDT: -360, PST: -480, PDT: -420,
};

function parseOffsetToken(token: string): number {
  if (/^[Zz]$/.test(token)) return 0;
  const m = token.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const minutes = Number(m[2]) * 60 + Number(m[3]);
    return m[1] === '-' ? -minutes : minutes;
  }
  const upper = token.toUpperCase();
  if (upper in OBSOLETE_ZONES) return OBSOLETE_ZONES[upper]!;
  // RFC 2822 §4.3: single-letter military zones are unreliable; treat as UTC.
  return 0;
}

/**
 * Parse whatever the user pasted.
 *
 * `naiveZone` decides how a string with no offset is read. ISO 8601 itself
 * says an offsetless value is local time; JavaScript historically read
 * date-only values as UTC and date-time values as local, which is the single
 * most common source of "my date is off by a day" bugs. Making the choice
 * explicit — and telling the user about it — is the honest fix.
 */
export function parseDateTime(input: string, naiveZone = 'UTC'): ParsedDateTime {
  const text = input.trim();
  if (!text) throw new Error('Enter a date, a timestamp or an ISO string first.');

  // 1. A bare number is an epoch timestamp.
  if (/^[+-]?\d+(\.\d+)?$/.test(text.replace(/[_,\s]/g, ''))) {
    const parsed = parseTimestamp(text);
    return {
      ms: parsed.ms,
      kind: 'timestamp',
      hasOffset: true,
      offsetMinutes: 0,
      note: `Read as a Unix timestamp in ${parsed.unit}. ${parsed.reason}`,
    };
  }

  // 2. ISO 8601 / RFC 3339.
  const iso = ISO_RE.exec(text);
  if (iso?.groups) {
    const g = iso.groups;
    const year = Number(g.year);
    const month = Number(g.month);
    const day = Number(g.day);
    if (month < 1 || month > 12) throw new Error(`Month ${month} is out of range — ISO months run 01 to 12.`);
    if (day < 1 || day > daysInMonth(year, month)) {
      throw new Error(
        `${padYear(year)}-${pad2(month)} has ${daysInMonth(year, month)} days, so day ${day} does not exist.`,
      );
    }
    const hour = Number(g.hour ?? 0);
    const minute = Number(g.minute ?? 0);
    const second = Number(g.second ?? 0);
    if (hour > 23 || minute > 59 || second > 60) {
      throw new Error(
        `${pad2(hour)}:${pad2(minute)}:${pad2(second)} is not a valid time. Hours run 00–23 and minutes 00–59.`,
      );
    }
    const millisecond = g.fraction ? Math.round(Number(`0.${g.fraction}`) * 1000) : 0;
    const dateOnly = g.hour === undefined;

    if (g.offset) {
      const offsetMinutes = parseOffsetToken(g.offset);
      const ms = utcFromFields(year, month, day, hour, minute, second, millisecond) - offsetMinutes * MS.minute;
      return {
        ms,
        kind: dateOnly ? 'date-only' : 'iso',
        hasOffset: true,
        offsetMinutes,
        note:
          offsetMinutes === 0 && /^[Zz]$/.test(g.offset)
            ? 'ISO 8601 with a Z suffix — an explicit UTC instant, no guessing required.'
            : `ISO 8601 with an explicit ${formatOffset(offsetMinutes)} offset.`,
      };
    }

    const conv = wallTimeToUtc({ year, month, day, hour, minute, second, millisecond }, naiveZone);
    return {
      ms: conv.ms,
      kind: dateOnly ? 'date-only' : 'iso',
      hasOffset: false,
      offsetMinutes: null,
      note:
        conv.note ??
        `No offset in the string, so it was read as wall-clock time in ${naiveZone} (${formatOffset(
          conv.offsetMinutes,
        )}).`,
    };
  }

  // 3. RFC 2822 — email Date: headers, HTTP, Date.prototype.toString().
  const rfc = RFC2822_RE.exec(text.replace(/\s*\([^)]*\)\s*$/, ''));
  if (rfc?.groups) {
    const g = rfc.groups;
    let year = Number(g.year);
    // RFC 2822 §4.3: two-digit years 00–49 are 2000s, 50–99 are 1900s.
    if (g.year!.length === 2) year += year < 50 ? 2000 : 1900;
    const month = MONTH_ABBR.indexOf(g.month!.slice(0, 3)) + 1;
    const offsetMinutes = g.offset ? parseOffsetToken(g.offset) : 0;
    const ms =
      utcFromFields(year, month, Number(g.day), Number(g.hour), Number(g.minute), Number(g.second ?? 0)) -
      offsetMinutes * MS.minute;
    return {
      ms,
      kind: 'rfc2822',
      hasOffset: Boolean(g.offset),
      offsetMinutes,
      note: g.offset
        ? `RFC 2822 date with a ${formatOffset(offsetMinutes)} offset.`
        : 'RFC 2822 date with no zone, so UTC was assumed.',
    };
  }

  // 4. Last resort: hand it to the engine and say so.
  const fallback = Date.parse(text);
  if (Number.isNaN(fallback)) {
    throw new Error(
      `Could not read "${text}" as a date. Try an ISO string like 2026-09-24T14:30:00Z, an RFC 2822 date, or a Unix timestamp.`,
    );
  }
  return {
    ms: fallback,
    kind: 'other',
    hasOffset: /[+-]\d{2}:?\d{2}$|Z$|GMT|UTC/i.test(text),
    offsetMinutes: null,
    note: 'Not a standard format — parsed by the browser, whose rules for non-standard dates differ between engines. Verify the result.',
  };
}

// ─── Differences ──────────────────────────────────────────────────────────

export interface CalendarDiff {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  /** True when the end was earlier than the start; the magnitude is unsigned. */
  reversed: boolean;
}

/**
 * Calendar-aware difference: the Y / M / D / h / m / s breakdown a human
 * expects, not a division by 2,629,746,000.
 *
 * The algorithm walks whole months forward from the start until one more
 * month would overshoot, then measures the remainder in exact milliseconds.
 * That is what makes 31 January → 1 March come out as "1 month, 1 day"
 * (31 Jan + 1 month clamps to 28 Feb, leaving one day) rather than as a
 * fabricated average. Fields are read in UTC, so callers pass wall-clock
 * values as UTC and get a DST-free breakdown.
 *
 * The magnitude is always positive and `reversed` records the direction, so a
 * user who enters the dates the wrong way round gets "3 days, reversed"
 * instead of "-2 months, -28 days".
 */
export function calendarDiff(startMs: number, endMs: number): CalendarDiff {
  const reversed = endMs < startMs;
  const from = reversed ? endMs : startMs;
  const to = reversed ? startMs : endMs;

  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (months > 0 && addMonthsUtc(from, months) > to) months -= 1;
  const anchor = months > 0 ? addMonthsUtc(from, months) : from;

  let rest = to - anchor;
  const days = Math.floor(rest / MS.day);
  rest -= days * MS.day;
  const hours = Math.floor(rest / MS.hour);
  rest -= hours * MS.hour;
  const minutes = Math.floor(rest / MS.minute);
  rest -= minutes * MS.minute;
  const seconds = Math.floor(rest / MS.second);
  rest -= seconds * MS.second;

  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days,
    hours,
    minutes,
    seconds,
    milliseconds: rest,
    reversed,
  };
}

export interface DurationTotals {
  milliseconds: number;
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
  weeks: number;
  /** Whole months, counted on the calendar rather than averaged. */
  months: number;
  reversed: boolean;
}

/** The same span expressed as a single total in each unit, always truncated. */
export function durationTotals(startMs: number, endMs: number): DurationTotals {
  const reversed = endMs < startMs;
  const span = Math.abs(endMs - startMs);
  const cal = calendarDiff(startMs, endMs);
  return {
    milliseconds: span,
    seconds: Math.floor(span / MS.second),
    minutes: Math.floor(span / MS.minute),
    hours: Math.floor(span / MS.hour),
    days: Math.floor(span / MS.day),
    weeks: Math.floor(span / MS.week),
    months: cal.years * 12 + cal.months,
    reversed,
  };
}

export interface BusinessDayCount {
  businessDays: number;
  weekendDays: number;
  totalDays: number;
}

/**
 * Count Monday–Friday days in a span, using UTC calendar dates.
 *
 * The half-open convention — start day counted, end day not — is what makes
 * "Monday to Tuesday" one business day. Pass `inclusive` to count the end day
 * too, which is what payroll and SLA rules usually mean.
 *
 * Counting is done with whole weeks plus a short remainder loop, so a span of
 * four centuries costs the same as a span of four days.
 */
export function businessDaysBetween(
  startMs: number,
  endMs: number,
  opts: { inclusive?: boolean } = {},
): BusinessDayCount {
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  const startDay = Math.floor(dayIndex(from));
  const endDay = Math.floor(dayIndex(to)) + (opts.inclusive ? 1 : 0);
  const totalDays = Math.max(0, endDay - startDay);

  const wholeWeeks = Math.floor(totalDays / 7);
  let business = wholeWeeks * 5;
  for (let i = wholeWeeks * 7; i < totalDays; i++) {
    const dow = ((startDay + i + 4) % 7 + 7) % 7; // epoch day 0 was a Thursday
    if (dow !== 0 && dow !== 6) business++;
  }
  return { businessDays: business, weekendDays: totalDays - business, totalDays };
}

/** Whole days since the epoch for an instant's UTC date. */
function dayIndex(ms: number): number {
  return Math.floor(ms / MS.day);
}

/** Human duration for a span of milliseconds, e.g. `2d 3h 04m 12s`. */
export function formatDuration(spanMs: number): string {
  const abs = Math.abs(spanMs);
  const days = Math.floor(abs / MS.day);
  const hours = Math.floor((abs % MS.day) / MS.hour);
  const minutes = Math.floor((abs % MS.hour) / MS.minute);
  const seconds = Math.floor((abs % MS.minute) / MS.second);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  if (days || hours || minutes) parts.push(`${pad2(minutes)}m`);
  parts.push(`${pad2(seconds)}s`);
  return parts.join(' ');
}
