/**
 * A hand-written cron parser, describer and evaluator.
 *
 * No dependencies beyond the sibling `datetime` module, which supplies the
 * IANA-accurate wall-clock ⇄ instant conversion used when a schedule is
 * evaluated in a real time zone.
 *
 * Supported syntax
 * ----------------
 *  - 5 fields  `min hour dom month dow`          — POSIX / Vixie crontab
 *  - 6 fields  `sec min hour dom month dow`      — Quartz, Spring, node-cron
 *  - 7 fields  `sec min hour dom month dow year` — Quartz
 *  - `*`, `a`, `a-b`, `a-b/s`, `*` /s, `a/s`, and comma-separated lists
 *  - Three-letter names: `JAN`–`DEC`, `SUN`–`SAT`, including in ranges
 *  - `?` in day-of-month or day-of-week (Quartz "no specific value")
 *  - `@yearly` `@annually` `@monthly` `@weekly` `@daily` `@midnight` `@hourly`
 *
 * Deliberately *not* supported: `L`, `W`, `#` and `LW`. They are Quartz
 * extensions that Vixie cron rejects, and guessing at them would produce
 * confidently wrong run times. They are reported as a clear error instead.
 *
 * The day-of-month / day-of-week rule
 * -----------------------------------
 * This is the part almost every implementation gets wrong. Vixie cron records
 * whether each of the two day fields *begins with a star*, then:
 *
 *     if (DOM starts with * || DOW starts with *)  →  day matches DOM AND DOW
 *     else                                         →  day matches DOM OR  DOW
 *
 * So `0 0 1 * 1` fires on the 1st of every month **and** on every Monday —
 * roughly six times a month, not once. See `orRule` on the parsed result.
 */

import { daysInMonth, getWallTime, utcFromFields, wallTimeToUtc } from '~/lib/datetime';

// ─── Types ────────────────────────────────────────────────────────────────

export type CronFieldName =
  | 'second'
  | 'minute'
  | 'hour'
  | 'dayOfMonth'
  | 'month'
  | 'dayOfWeek'
  | 'year';

export type CronTerm =
  | { kind: 'all' }
  | { kind: 'value'; value: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'step'; start: number; end: number; step: number; fromAll: boolean };

export interface CronField {
  name: CronFieldName;
  /** Display label for the breakdown table, e.g. "Day of month". */
  label: string;
  /** Exactly what the user typed for this field. */
  raw: string;
  min: number;
  max: number;
  /** Every allowed value, sorted ascending and de-duplicated. */
  values: number[];
  terms: CronTerm[];
  /**
   * True when the field literally begins with `*`, or is `?`. This — not
   * "matches every value" — is what decides the OR rule, exactly as Vixie
   * cron's DOM_STAR / DOW_STAR flags do.
   */
  starred: boolean;
  /** Plain-English reading of this field alone. */
  description: string;
}

export interface CronExpression {
  /** The expression as typed, trimmed. */
  raw: string;
  /** After macro expansion and whitespace normalisation. */
  normalized: string;
  fieldCount: 5 | 6 | 7;
  /** The macro used, if the input was one, e.g. `@daily`. */
  macro?: string;
  second: CronField;
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
  year: CronField;
  /** Fields in display order, seconds and year included only when present. */
  fields: CronField[];
  /** True when day-of-month and day-of-week are ORed rather than ANDed. */
  orRule: boolean;
  /** One-sentence plain-English description. */
  description: string;
  /** Things worth telling the user that are not errors. */
  warnings: string[];
}

export class CronParseError extends Error {
  readonly field?: CronFieldName;
  constructor(message: string, field?: CronFieldName) {
    super(message);
    this.name = 'CronParseError';
    this.field = field;
  }
}

// ─── Field definitions ────────────────────────────────────────────────────

interface FieldSpec {
  name: CronFieldName;
  label: string;
  min: number;
  max: number;
  names?: readonly string[];
  /** Offset of the first name, e.g. JAN is 1 but SUN is 0. */
  nameBase?: number;
  allowQuestion?: boolean;
}

const MONTH_TOKENS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
const DOW_TOKENS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

const SPECS: Record<CronFieldName, FieldSpec> = {
  second: { name: 'second', label: 'Second', min: 0, max: 59 },
  minute: { name: 'minute', label: 'Minute', min: 0, max: 59 },
  hour: { name: 'hour', label: 'Hour', min: 0, max: 23 },
  dayOfMonth: { name: 'dayOfMonth', label: 'Day of month', min: 1, max: 31, allowQuestion: true },
  month: { name: 'month', label: 'Month', min: 1, max: 12, names: MONTH_TOKENS, nameBase: 1 },
  // 7 is accepted for Sunday (Vixie cron), and normalised to 0.
  dayOfWeek: { name: 'dayOfWeek', label: 'Day of week', min: 0, max: 7, names: DOW_TOKENS, nameBase: 0, allowQuestion: true },
  year: { name: 'year', label: 'Year', min: 1970, max: 2199 },
};

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Macro → 5-field equivalent, as documented in `man 5 crontab`. */
export const CRON_MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

// ─── Parsing ──────────────────────────────────────────────────────────────

function parseToken(token: string, spec: FieldSpec): number {
  const upper = token.toUpperCase();
  if (spec.names) {
    const index = spec.names.indexOf(upper as never);
    if (index >= 0) return index + (spec.nameBase ?? 0);
    if (/^[A-Z]+$/.test(upper)) {
      throw new CronParseError(
        `"${token}" is not a valid ${spec.label.toLowerCase()} name. Use ${spec.names[0]}–${spec.names[spec.names.length - 1]}.`,
        spec.name,
      );
    }
  }
  if (!/^\d+$/.test(token)) {
    throw new CronParseError(
      `"${token}" is not a number the ${spec.label.toLowerCase()} field understands.`,
      spec.name,
    );
  }
  const value = Number(token);
  if (value < spec.min || value > spec.max) {
    throw new CronParseError(
      `${spec.label} must be between ${spec.min} and ${spec.max} — got ${value}.`,
      spec.name,
    );
  }
  return value;
}

function parseField(raw: string, spec: FieldSpec): CronField {
  const text = raw.trim();
  if (!text) throw new CronParseError(`The ${spec.label.toLowerCase()} field is empty.`, spec.name);

  // Check for Quartz extensions only after removing legal names, since JUL
  // contains an L and WED contains a W.
  const withoutNames = spec.names
    ? text.toUpperCase().split(new RegExp(spec.names.join('|'), 'g')).join('')
    : text;
  if (/[LW#]/i.test(withoutNames)) {
    throw new CronParseError(
      `"${text}" uses a Quartz extension (L, W or #) in the ${spec.label.toLowerCase()} field. Standard crontab has no such syntax, and this tool will not guess at what it should mean.`,
      spec.name,
    );
  }

  if (text === '?') {
    if (!spec.allowQuestion) {
      throw new CronParseError(
        `"?" is only meaningful in day-of-month and day-of-week, not in ${spec.label.toLowerCase()}.`,
        spec.name,
      );
    }
    return finishField(spec, text, [{ kind: 'all' }], true);
  }

  const terms: CronTerm[] = [];
  for (const part of text.split(',')) {
    terms.push(parseTerm(part.trim(), spec, text));
  }
  return finishField(spec, text, terms, text.startsWith('*'));
}

function parseTerm(part: string, spec: FieldSpec, whole: string): CronTerm {
  if (!part) {
    throw new CronParseError(
      `"${whole}" has an empty item in its list — check for a stray comma.`,
      spec.name,
    );
  }

  const [body, stepText, ...extra] = part.split('/');
  if (extra.length) {
    throw new CronParseError(`"${part}" has more than one "/" step.`, spec.name);
  }

  let step: number | undefined;
  if (stepText !== undefined) {
    if (!/^\d+$/.test(stepText) || Number(stepText) === 0) {
      throw new CronParseError(
        `"${part}" has an invalid step. A step must be a positive whole number, as in */15.`,
        spec.name,
      );
    }
    step = Number(stepText);
    if (step > spec.max - spec.min + 1) {
      throw new CronParseError(
        `A step of ${step} is larger than the whole ${spec.label.toLowerCase()} range (${spec.min}–${spec.max}), so it can only ever match the first value.`,
        spec.name,
      );
    }
  }

  if (body === '*' || body === '') {
    if (step === undefined) return { kind: 'all' };
    return { kind: 'step', start: spec.min, end: spec.max, step, fromAll: true };
  }

  if (body!.includes('-')) {
    const [startText, endText, ...rest] = body!.split('-');
    if (rest.length || endText === undefined) {
      throw new CronParseError(`"${part}" is not a valid range. Use a form like 9-17.`, spec.name);
    }
    const start = parseToken(startText!, spec);
    const end = parseToken(endText, spec);
    if (step !== undefined) return { kind: 'step', start, end, step, fromAll: false };
    return { kind: 'range', start, end };
  }

  const value = parseToken(body!, spec);
  // Quartz reads `5/10` as "from 5, every 10 to the end of the range".
  if (step !== undefined) return { kind: 'step', start: value, end: spec.max, step, fromAll: false };
  return { kind: 'value', value };
}

function expand(term: CronTerm, spec: FieldSpec): number[] {
  const out: number[] = [];
  switch (term.kind) {
    case 'all':
      for (let v = spec.min; v <= spec.max; v++) out.push(v);
      break;
    case 'value':
      out.push(term.value);
      break;
    case 'range':
    case 'step': {
      const step = term.kind === 'step' ? term.step : 1;
      if (term.start <= term.end) {
        for (let v = term.start; v <= term.end; v += step) out.push(v);
      } else {
        // A wrapping range like FRI-MON or 22-2 is legal in Vixie cron.
        for (let v = term.start; v <= spec.max; v += step) out.push(v);
        const carry = (spec.max - term.start + 1) % step;
        for (let v = spec.min + (carry === 0 ? 0 : step - carry); v <= term.end; v += step) out.push(v);
      }
      break;
    }
  }
  return out;
}

function finishField(spec: FieldSpec, raw: string, terms: CronTerm[], starred: boolean): CronField {
  let values = terms.flatMap((t) => expand(t, spec));
  if (spec.name === 'dayOfWeek') values = values.map((v) => (v === 7 ? 0 : v));
  values = [...new Set(values)].sort((a, b) => a - b);

  const field: CronField = {
    name: spec.name,
    label: spec.label,
    raw,
    min: spec.min,
    max: spec.max,
    values,
    terms,
    starred,
    description: '',
  };
  field.description = describeField(field);
  return field;
}

/** Turn 1, 2, 3 into "1, 2 and 3". */
function listPhrase(items: string[], conjunction = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function nameOf(field: CronField, value: number): string {
  if (field.name === 'month') return MONTH_FULL[value - 1] ?? String(value);
  if (field.name === 'dayOfWeek') return DOW_FULL[value === 7 ? 0 : value] ?? String(value);
  return String(value);
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** A human reading of one field, used by the breakdown table. */
function describeField(field: CronField): string {
  const unit = field.label.toLowerCase();
  if (field.raw === '?') return `Unrestricted — "?" means this field defers to the other day field.`;
  if (field.terms.length === 1) {
    const t = field.terms[0]!;
    if (t.kind === 'all') return `Every ${unit}`;
    if (t.kind === 'step' && t.fromAll) {
      return `Every ${t.step === 1 ? unit : `${ordinal(t.step)} ${unit}`}${
        t.step === 1 ? '' : ` (${field.values.length} values)`
      }`;
    }
    if (t.kind === 'range') {
      return `${nameOf(field, t.start)} through ${nameOf(field, t.end)}`;
    }
    if (t.kind === 'step') {
      return `Every ${ordinal(t.step)} ${unit} from ${nameOf(field, t.start)} to ${nameOf(field, t.end)}`;
    }
    if (t.kind === 'value') return nameOf(field, t.value);
  }
  const shown = field.values.slice(0, 12).map((v) => nameOf(field, v));
  const suffix = field.values.length > 12 ? `, … (${field.values.length} values)` : '';
  return listPhrase(shown) + suffix;
}

/**
 * Parse a cron expression.
 *
 * Throws `CronParseError` with a message written for the person who typed the
 * expression, naming the field at fault.
 */
export function parseCron(input: string): CronExpression {
  const raw = input.trim();
  if (!raw) throw new CronParseError('Enter a cron expression first.');

  if (raw.startsWith('@')) {
    const key = raw.toLowerCase();
    if (key === '@reboot') {
      throw new CronParseError(
        '@reboot runs once when the machine starts, so it has no schedule and no next run time to show.',
      );
    }
    const expanded = CRON_MACROS[key];
    if (!expanded) {
      throw new CronParseError(
        `"${raw}" is not a cron macro. The standard set is ${Object.keys(CRON_MACROS).join(', ')}.`,
      );
    }
    const parsed = parseCron(expanded);
    return {
      ...parsed,
      raw,
      macro: key,
      warnings: [`${key} is shorthand for "${expanded}".`, ...parsed.warnings],
    };
  }

  const parts = raw.split(/\s+/);
  if (parts.length < 5 || parts.length > 7) {
    throw new CronParseError(
      `A cron expression has 5 fields (minute hour day-of-month month day-of-week), 6 with a leading seconds field, or 7 with a trailing year. This one has ${parts.length}.`,
    );
  }

  const fieldCount = parts.length as 5 | 6 | 7;
  const warnings: string[] = [];

  // A 6-field expression is seconds-first. Quartz, Spring's @Scheduled and
  // node-cron all read it that way; only a handful of tools put the year there.
  const hasSeconds = fieldCount >= 6;
  const offset = hasSeconds ? 1 : 0;

  const second = hasSeconds
    ? parseField(parts[0]!, SPECS.second)
    : finishField(SPECS.second, '0', [{ kind: 'value', value: 0 }], false);
  const minute = parseField(parts[offset]!, SPECS.minute);
  const hour = parseField(parts[offset + 1]!, SPECS.hour);
  const dayOfMonth = parseField(parts[offset + 2]!, SPECS.dayOfMonth);
  const month = parseField(parts[offset + 3]!, SPECS.month);
  const dayOfWeek = parseField(parts[offset + 4]!, SPECS.dayOfWeek);
  const year =
    fieldCount === 7
      ? parseField(parts[6]!, SPECS.year)
      : finishField(SPECS.year, '*', [{ kind: 'all' }], true);

  const orRule = !dayOfMonth.starred && !dayOfWeek.starred;

  const fields: CronField[] = [
    ...(hasSeconds ? [second] : []),
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    ...(fieldCount === 7 ? [year] : []),
  ];

  if (hasSeconds) {
    warnings.push(
      'Six fields were given, so the first one is read as seconds. Plain Unix crontab has no seconds field — this form is Quartz, Spring and node-cron syntax.',
    );
  }
  if (orRule) {
    warnings.push(
      `Day-of-month ("${dayOfMonth.raw}") and day-of-week ("${dayOfWeek.raw}") are both restricted, so cron ORs them: this fires on matching days of the month AND on matching weekdays, not only where the two coincide.`,
    );
  }
  if (dayOfWeek.raw.includes('7')) {
    warnings.push('Day-of-week 7 means Sunday, the same as 0. Both are accepted by Vixie cron.');
  }
  if (dayOfMonth.values.some((d) => d > 28) && !dayOfMonth.starred) {
    warnings.push(
      `Day ${listPhrase(dayOfMonth.values.filter((d) => d > 28).map(String))} does not exist in every month, so some months will be skipped. The 31st occurs in only seven months a year.`,
    );
  }

  const expression: CronExpression = {
    raw,
    normalized: fields.map((f) => f.raw).join(' '),
    fieldCount,
    second,
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
    year,
    fields,
    orRule,
    description: '',
    warnings,
  };
  expression.description = describeCron(expression);

  if (!canEverMatch(expression)) {
    expression.warnings.push(
      'This schedule can never fire — no calendar date satisfies all of its fields at once.',
    );
  }

  return expression;
}

/** True unless month/day combinations make the schedule impossible. */
function canEverMatch(c: CronExpression): boolean {
  if (!c.orRule && !c.dayOfMonth.starred) {
    // Every allowed day-of-month must exist in at least one allowed month.
    const possible = c.month.values.some((m) =>
      c.dayOfMonth.values.some((d) => d <= daysInMonth(2024, m)),
    );
    if (!possible) return false;
  }
  return true;
}

// ─── Description ──────────────────────────────────────────────────────────

function isAll(field: CronField): boolean {
  return field.terms.length === 1 && field.terms[0]!.kind === 'all';
}

function fullStep(field: CronField): number | null {
  if (field.terms.length !== 1) return null;
  const t = field.terms[0]!;
  return t.kind === 'step' && t.fromAll ? t.step : null;
}

function singleValue(field: CronField): number | null {
  return field.values.length === 1 ? field.values[0]! : null;
}

function timePhrase(c: CronExpression): string {
  const hasSeconds = c.fieldCount >= 6;
  const secAll = isAll(c.second);
  const secStep = fullStep(c.second);
  const secSingle = singleValue(c.second);
  const minAll = isAll(c.minute);
  const minStep = fullStep(c.minute);
  const minSingle = singleValue(c.minute);
  const hourAll = isAll(c.hour);
  const hourSingle = singleValue(c.hour);
  const hourPhrase = hourAll ? '' : describeHours(c.hour);

  /** How the minute and hour fields qualify a sub-minute schedule. */
  const minuteHourQualifier = (): string => {
    if (minAll && hourAll) return '';
    if (minAll) return hourPhrase;
    const tail = hourPhrase ? ` ${hourPhrase}` : '';
    if (minStep !== null) {
      return `during every ${minStep === 1 ? 'minute' : `${ordinal(minStep)} minute`}${tail}`;
    }
    return `during minute ${listPhrase(c.minute.values.map(String))}${tail}`;
  };

  if (hasSeconds && (secAll || secStep !== null)) {
    const every = secAll || secStep === 1 ? 'every second' : `every ${secStep} seconds`;
    const qualifier = minuteHourQualifier();
    return qualifier ? `${every} ${qualifier}` : every;
  }

  if (hasSeconds && secSingle !== null && secSingle !== 0 && minSingle !== null && hourSingle !== null) {
    return `at ${pad2(hourSingle)}:${pad2(minSingle)}:${pad2(secSingle)}`;
  }

  let core: string;
  if (minAll && hourAll) {
    core = 'every minute';
  } else if (minStep !== null && hourAll) {
    core = minStep === 1 ? 'every minute' : `every ${minStep} minutes`;
  } else if (minSingle !== null) {
    const base =
      minSingle === 0 ? 'at the top of every hour' : `at ${minSingle} minutes past every hour`;
    if (hourAll) {
      core = base;
    } else if (c.hour.terms.every((t) => t.kind === 'value') && c.hour.values.length <= 4) {
      core = `at ${listPhrase(c.hour.values.map((h) => `${pad2(h)}:${pad2(minSingle)}`))}`;
    } else {
      core = `${base} ${hourPhrase}`;
    }
  } else if (minAll) {
    core = `every minute ${hourPhrase}`;
  } else if (minStep !== null) {
    core = `every ${minStep} minutes ${hourPhrase}`;
  } else {
    core = `at minute ${listPhrase(c.minute.values.map(String))}${hourPhrase ? ` ${hourPhrase}` : ''}`;
  }

  if (hasSeconds && secSingle !== 0) {
    core += `, at second ${listPhrase(c.second.values.map(String))}`;
  }
  return core;
}

function describeHours(hour: CronField): string {
  const step = fullStep(hour);
  if (step !== null) return `every ${step === 1 ? 'hour' : `${step} hours`}`;
  if (hour.terms.length === 1 && hour.terms[0]!.kind === 'range') {
    const t = hour.terms[0]!;
    return `between ${pad2(t.start)}:00 and ${pad2(t.end)}:59`;
  }
  if (hour.terms.length === 1 && hour.terms[0]!.kind === 'step') {
    const t = hour.terms[0]!;
    return `every ${t.step} hours between ${pad2(t.start)}:00 and ${pad2(t.end)}:59`;
  }
  return `past hour ${listPhrase(hour.values.map(String))}`;
}

function dayPhrase(c: CronExpression): string {
  const domAll = c.dayOfMonth.starred && isAllOrQuestion(c.dayOfMonth);
  const dowAll = c.dayOfWeek.starred && isAllOrQuestion(c.dayOfWeek);
  if (domAll && dowAll) return 'every day';

  const domText = describeDayOfMonth(c.dayOfMonth);
  const dowText = describeDayOfWeek(c.dayOfWeek);

  if (domAll) return `on ${dowText}`;
  if (dowAll) return `on ${domText}`;
  // Both restricted — the OR rule, spelled out.
  return c.orRule ? `on ${domText}, and also on ${dowText}` : `on ${domText} that fall on ${dowText}`;
}

function isAllOrQuestion(field: CronField): boolean {
  return field.values.length === field.max - field.min + 1 || field.raw === '?' || isAll(field);
}

function describeDayOfMonth(field: CronField): string {
  const step = fullStep(field);
  if (step !== null) return `every ${ordinal(step)} day of the month`;
  if (field.values.length === 1) return `the ${ordinal(field.values[0]!)}`;
  if (field.terms.length === 1 && field.terms[0]!.kind === 'range') {
    const t = field.terms[0]!;
    return `the ${ordinal(t.start)} through the ${ordinal(t.end)}`;
  }
  return `the ${listPhrase(field.values.map(ordinal))}`;
}

function describeDayOfWeek(field: CronField): string {
  const step = fullStep(field);
  if (step !== null) return `every ${ordinal(step)} weekday`;
  if (field.terms.length === 1 && field.terms[0]!.kind === 'range') {
    const t = field.terms[0]!;
    return `${DOW_FULL[t.start === 7 ? 0 : t.start]} through ${DOW_FULL[t.end === 7 ? 0 : t.end]}`;
  }
  return listPhrase(field.values.map((v) => DOW_FULL[v]!));
}

function monthPhrase(c: CronExpression): string {
  if (isAllOrQuestion(c.month)) return '';
  const step = fullStep(c.month);
  if (step !== null) return ` every ${ordinal(step)} month`;
  if (c.month.terms.length === 1 && c.month.terms[0]!.kind === 'range') {
    const t = c.month.terms[0]!;
    return ` from ${MONTH_FULL[t.start - 1]} through ${MONTH_FULL[t.end - 1]}`;
  }
  return ` in ${listPhrase(c.month.values.map((m) => MONTH_FULL[m - 1]!))}`;
}

function yearPhrase(c: CronExpression): string {
  if (c.fieldCount !== 7 || isAll(c.year)) return '';
  if (c.year.values.length <= 4) return `, in ${listPhrase(c.year.values.map(String))}`;
  return `, in ${c.year.values.length} specified years from ${c.year.values[0]} to ${c.year.values[c.year.values.length - 1]}`;
}

/** One sentence describing the whole schedule. */
export function describeCron(c: CronExpression): string {
  const sentence = `${timePhrase(c)}, ${dayPhrase(c)}${monthPhrase(c)}${yearPhrase(c)}`;
  const trimmed = sentence.replace(/\s+/g, ' ').trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1) + '.';
}

// ─── Evaluation ───────────────────────────────────────────────────────────

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function nextAtLeast(values: number[], target: number): number | null {
  for (const v of values) if (v >= target) return v;
  return null;
}

/** Day-of-week (0 = Sunday) for a proleptic Gregorian calendar date. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(utcFromFields(year, month, day)).getUTCDay();
}

/**
 * Does this calendar day satisfy the schedule?
 *
 * This is where the OR rule lives. When neither day field begins with `*`,
 * either one matching is enough.
 */
export function dayMatches(c: CronExpression, year: number, month: number, day: number): boolean {
  const domOk = c.dayOfMonth.values.includes(day);
  const dowOk = c.dayOfWeek.values.includes(weekdayOf(year, month, day));
  return c.orRule ? domOk || dowOk : domOk && dowOk;
}

/**
 * Walk the calendar forward to the first wall-clock time at or after `start`
 * that the expression matches. Fields are skipped a whole unit at a time, so
 * a "29 February" schedule costs a few thousand comparisons, not four years
 * of minutes.
 */
function findNextWall(c: CronExpression, start: Wall): Wall | null {
  let { year, month, day, hour, minute, second } = start;
  const lastYear = c.year.values[c.year.values.length - 1]!;

  for (let guard = 0; guard < 200_000; guard++) {
    if (year > lastYear) return null;

    const y = nextAtLeast(c.year.values, year);
    if (y === null) return null;
    if (y !== year) {
      year = y;
      month = 1; day = 1; hour = 0; minute = 0; second = 0;
    }

    const m = nextAtLeast(c.month.values, month);
    if (m === null) {
      year += 1; month = 1; day = 1; hour = 0; minute = 0; second = 0;
      continue;
    }
    if (m !== month) {
      month = m; day = 1; hour = 0; minute = 0; second = 0;
    }

    if (day > daysInMonth(year, month) || !dayMatches(c, year, month, day)) {
      day += 1;
      hour = 0; minute = 0; second = 0;
      if (day > daysInMonth(year, month)) {
        day = 1;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
      }
      continue;
    }

    const h = nextAtLeast(c.hour.values, hour);
    if (h === null) {
      day += 1; hour = 0; minute = 0; second = 0;
      if (day > daysInMonth(year, month)) {
        day = 1; month += 1;
        if (month > 12) { month = 1; year += 1; }
      }
      continue;
    }
    if (h !== hour) { hour = h; minute = 0; second = 0; }

    const mi = nextAtLeast(c.minute.values, minute);
    if (mi === null) {
      hour += 1; minute = 0; second = 0;
      if (hour > 23) {
        hour = 0; day += 1;
        if (day > daysInMonth(year, month)) {
          day = 1; month += 1;
          if (month > 12) { month = 1; year += 1; }
        }
      }
      continue;
    }
    if (mi !== minute) { minute = mi; second = 0; }

    const s = nextAtLeast(c.second.values, second);
    if (s === null) {
      minute += 1; second = 0;
      if (minute > 59) {
        minute = 0; hour += 1;
        if (hour > 23) {
          hour = 0; day += 1;
          if (day > daysInMonth(year, month)) {
            day = 1; month += 1;
            if (month > 12) { month = 1; year += 1; }
          }
        }
      }
      continue;
    }
    second = s;

    return { year, month, day, hour, minute, second };
  }
  return null;
}

function addSecond(w: Wall): Wall {
  let { year, month, day, hour, minute, second } = w;
  second += 1;
  if (second > 59) { second = 0; minute += 1; }
  if (minute > 59) { minute = 0; hour += 1; }
  if (hour > 23) { hour = 0; day += 1; }
  if (day > daysInMonth(year, month)) { day = 1; month += 1; }
  if (month > 12) { month = 1; year += 1; }
  return { year, month, day, hour, minute, second };
}

export interface NextRunOptions {
  /** IANA zone the schedule runs in. Cron uses the server's zone; default UTC. */
  timeZone?: string;
  /** Include `fromMs` itself when it matches. Default false. */
  inclusive?: boolean;
}

export interface CronRun {
  ms: number;
  /** Set when the wall-clock time fell in a DST gap or repeat. */
  dstNote?: string;
}

/**
 * The next `count` fire times at or after `fromMs`, as epoch milliseconds.
 *
 * Cron schedules are wall-clock schedules: "02:30 every day" means 02:30 on
 * the office wall, whatever UTC is doing. So the search runs over local
 * calendar fields and each match is converted back to an instant using the
 * zone's real offset at that moment.
 *
 * Daylight saving therefore behaves the way an operator sees it:
 *
 *  - A time that the spring-forward jump erases simply does not fire that day.
 *  - A time that the autumn fall-back repeats fires once, on the first pass.
 *
 * Vixie cron has its own rules for the gap (it runs jobs it skipped); Quartz
 * and Kubernetes differ again. The results here are labelled rather than
 * silently reconciled.
 */
export function nextRunsDetailed(
  c: CronExpression,
  fromMs: number,
  count = 10,
  opts: NextRunOptions = {},
): CronRun[] {
  const timeZone = opts.timeZone ?? 'UTC';
  const runs: CronRun[] = [];
  const floor = opts.inclusive ? fromMs - 1 : fromMs;

  const startWall = getWallTime(fromMs, timeZone);
  let cursor: Wall = {
    year: startWall.year,
    month: startWall.month,
    day: startWall.day,
    hour: startWall.hour,
    minute: startWall.minute,
    second: startWall.second,
  };
  // Move to the next whole second unless we are allowed to match `fromMs`.
  if (!opts.inclusive || startWall.millisecond > 0) cursor = addSecond(cursor);

  let previous = floor;
  for (let i = 0; i < count * 4 && runs.length < count; i++) {
    const match = findNextWall(c, cursor);
    if (!match) break;

    const conv = wallTimeToUtc(
      {
        year: match.year,
        month: match.month,
        day: match.day,
        hour: match.hour,
        minute: match.minute,
        second: match.second,
        millisecond: 0,
      },
      timeZone,
    );
    cursor = addSecond(match);

    if (conv.status === 'skipped') continue; // the clock jumped over this time
    if (conv.ms <= previous) continue; // the fall-back repeat, already emitted
    previous = conv.ms;
    runs.push(conv.status === 'ambiguous' ? { ms: conv.ms, dstNote: conv.note } : { ms: conv.ms });
  }
  return runs;
}

/** The next `count` fire times as epoch milliseconds. */
export function nextRuns(
  c: CronExpression,
  fromMs: number,
  count = 10,
  opts: NextRunOptions = {},
): number[] {
  return nextRunsDetailed(c, fromMs, count, opts).map((r) => r.ms);
}

/** Does the schedule fire at exactly this instant (to the second)? */
export function matchesInstant(c: CronExpression, ms: number, timeZone = 'UTC'): boolean {
  const w = getWallTime(ms, timeZone);
  return (
    c.second.values.includes(w.second) &&
    c.minute.values.includes(w.minute) &&
    c.hour.values.includes(w.hour) &&
    c.month.values.includes(w.month) &&
    c.year.values.includes(w.year) &&
    dayMatches(c, w.year, w.month, w.day)
  );
}

// ─── Building ─────────────────────────────────────────────────────────────

export interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  second?: string;
  year?: string;
}

/** Assemble an expression from parts, omitting optional fields left empty. */
export function buildCron(parts: CronParts): string {
  const core = [parts.minute, parts.hour, parts.dayOfMonth, parts.month, parts.dayOfWeek];
  const withSeconds = parts.second && parts.second.trim() ? [parts.second.trim(), ...core] : core;
  const all = parts.year && parts.year.trim() ? [...withSeconds, parts.year.trim()] : withSeconds;
  return all.map((p) => (p ?? '').trim() || '*').join(' ');
}

export interface CronPreset {
  label: string;
  expression: string;
}

/** Ready-made schedules for the generator's quick-pick list. */
export const CRON_PRESETS: CronPreset[] = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every 15 minutes', expression: '*/15 * * * *' },
  { label: 'Every 30 minutes', expression: '*/30 * * * *' },
  { label: 'Hourly, on the hour', expression: '0 * * * *' },
  { label: 'Every 6 hours', expression: '0 */6 * * *' },
  { label: 'Daily at midnight', expression: '0 0 * * *' },
  { label: 'Daily at 02:30', expression: '30 2 * * *' },
  { label: 'Weekdays at 09:00', expression: '0 9 * * 1-5' },
  { label: 'Weekdays every 15 min, 09:00–17:00', expression: '*/15 9-17 * * 1-5' },
  { label: 'Every Monday at 08:00', expression: '0 8 * * 1' },
  { label: 'Every Sunday at 03:00', expression: '0 3 * * 0' },
  { label: 'First of the month at 00:00', expression: '0 0 1 * *' },
  { label: 'Last quarter-hour of each month (28th)', expression: '45 23 28 * *' },
  { label: 'Quarterly, 1st at 00:00', expression: '0 0 1 1,4,7,10 *' },
  { label: 'Yearly on 1 January', expression: '0 0 1 1 *' },
];
