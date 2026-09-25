import type { FaqMap } from './index';

/**
 * FAQ content for the Date & Time tools. See ./index.ts for the rules that
 * govern what belongs here.
 */
export const timeFaqs: FaqMap = {
  'unix-timestamp-converter': [
    {
      q: 'How do I tell seconds from milliseconds?',
      a: 'A present-day timestamp in seconds has 10 digits; in milliseconds it has 13. This tool detects the likely unit automatically and tells you which one it used, so a millisecond value is never silently read as the year 56000.',
    },
    {
      q: 'What is the year 2038 problem?',
      a: 'Systems that store Unix time in a signed 32-bit integer overflow on 19 January 2038. Any modern language using 64-bit integers is unaffected, but legacy C code and some embedded databases still are.',
    },
    {
      q: 'Does a Unix timestamp depend on my timezone?',
      a: 'No. The count is the same integer in Auckland as in Los Angeles; only the rendering of it changes. So when two systems differ by exactly 3,600 or 19,800, that is not a timezone living inside the number — it is one side converting a wall-clock reading as though it were already UTC. MySQL is a frequent culprit: <code>TIMESTAMP</code> columns are converted using the session <code>time_zone</code>, <code>DATETIME</code> columns are not.',
    },
    {
      q: 'Does Unix time count leap seconds?',
      a: 'It does not. POSIX defines every day as exactly 86,400 seconds, so the 27 leap seconds inserted since 1972 are simply absent and the count now trails elapsed atomic time by that much. Rather than repeat a second and risk a clock going backwards, Google and AWS spread it across a 24-hour smear. The General Conference on Weights and Measures voted in 2022 to stop adding them by 2035.',
    },
    {
      q: 'How do I get the current timestamp in code?',
      a: 'In whole seconds: <code>date +%s</code> in a shell, <code>time.time()</code> in Python, <code>time()</code> in PHP, <code>EXTRACT(EPOCH FROM now())</code> in PostgreSQL, <code>UNIX_TIMESTAMP()</code> in MySQL, <code>time.Now().Unix()</code> in Go. JavaScript and Java are the outliers that hand back milliseconds — <code>Date.now()</code> and <code>System.currentTimeMillis()</code> — and that mismatch is where most unit confusion between a front end and its database begins.',
    },
  ],
  'date-difference-calculator': [
    {
      q: 'Why does a spreadsheet report a different number of days?',
      a: 'Spreadsheets subtract serial numbers, and Excel’s serials carry a deliberate defect: 1900 is treated as a leap year so that 29 February 1900 — a date that never existed — occupies serial 60, inherited from Lotus 1-2-3 for compatibility. Any span crossing early 1900 therefore comes out one day long, and Google Sheets copies the behaviour. Microsoft also documents that <code>DATEDIF</code> with the <code>MD</code> unit can return a negative result.',
    },
    {
      q: 'Which SQL function gives which of these two answers?',
      a: 'In PostgreSQL, subtracting one date from another returns whole days as an integer, while <code>age(a, b)</code> returns the calendar breakdown in years, months and days. MySQL separates them too, with a trap: <code>DATEDIFF(a, b)</code> gives a minus b in days and discards the time part entirely, whereas <code>TIMESTAMPDIFF(unit, a, b)</code> takes its arguments the other way round and truncates towards zero.',
    },
    {
      q: 'How many working days are there in a year?',
      a: 'A 365-day year is 52 weeks plus one day, so it holds 260 or 261 weekdays depending on which day it starts; a leap year starting on a Thursday or Friday reaches 262. 2026 opens on a Thursday and contains 261. Subtract your own public holidays from whatever this tool reports — eight statutory days in England and Wales, eleven US federal holidays — because only weekends are excluded here.',
    },
  ],
  'iso-date-converter': [
    {
      q: 'Why does a date-only string come out a day early in JavaScript?',
      a: 'ECMA-262 treats the two shapes differently. A bare <code>2026-03-01</code> is parsed as midnight UTC, whereas the same value with a time and no offset, <code>2026-03-01T00:00</code>, is parsed as midnight local. Format the first one in any zone behind UTC and it prints as 28 February. The cure is to stop leaving it implicit: attach the offset, or build the value from components in the zone you actually mean.',
    },
    {
      q: 'Can I sort ISO 8601 strings as plain text?',
      a: 'Yes, as long as every value is UTC and identically shaped, because the format is big-endian and zero-padded. It fails the moment shapes vary: mixed offsets sort by local wall clock rather than by instant, and <code>2026-01-01T00:00:00Z</code> sorts after <code>2026-01-01T00:00:00.000Z</code> despite naming the same moment, since a full stop is byte 0x2E and <code>Z</code> is 0x5A. Normalise to UTC with a fixed number of fractional digits first.',
    },
    {
      q: 'Is 23:59:60 or 24:00 a valid time?',
      a: 'The two specifications split on this. RFC 3339 allows a seconds value of 60 so that a leap second such as <code>1998-12-31T23:59:60Z</code> can be written down, and its grammar caps the hour at 23, making <code>24:00</code> invalid. ISO 8601 does the opposite for midnight, where <code>24:00</code> legitimately means the end of a day. Parsers are unforgiving — Go’s <code>time.Parse</code> rejects hour 24 outright — so keep both out of anything you exchange.',
    },
  ],
  'timezone-converter': [
    {
      q: 'Why is the gap between London and New York sometimes four hours?',
      a: 'Because the two sides do not change on the same weekend. The United States moves on the second Sunday in March and the first Sunday in November; the UK and EU move on the last Sunday in March and the last Sunday in October. That leaves about three weeks each spring and one week each autumn when the usual five-hour difference is four — the weeks that quietly derail recurring invitations.',
    },
    {
      q: 'Does a timestamptz column store the timezone?',
      a: 'No, in spite of the name. PostgreSQL converts the input to UTC, stores eight bytes, and renders it through the session’s <code>TimeZone</code> setting on the way out, so two connections can read one row and print different clock times. Add a separate text column for the IANA name when the original zone carries meaning. Plain <code>timestamp</code> keeps the wall-clock reading and ignores zones altogether.',
    },
    {
      q: 'Why does my platform not recognise a zone name?',
      a: 'Because three naming systems are in circulation. The tz database keeps retired names as aliases in its <code>backward</code> file — <code>Asia/Calcutta</code> still resolves to <code>Asia/Kolkata</code>, <code>US/Pacific</code> to <code>America/Los_Angeles</code> — and a trimmed runtime built without that file rejects them. Windows uses its own labels such as <code>Pacific Standard Time</code>, which need the CLDR windowsZones table to translate into IANA identifiers.',
    },
  ],
  'cron-expression-generator': [
    {
      q: 'Why does my job run twice, or not at all, twice a year?',
      a: 'Cron fires against the host’s local clock, so a daylight saving shift drags the schedule with it. Vixie cron patches half the problem: an entry with a fixed hour is still run once when the clock springs forward and is not repeated when it falls back. A wildcard schedule like <code>*/10 * * * *</code> gets no such help and genuinely runs twice through the repeated hour. Run the host on UTC, or use the Kubernetes CronJob <code>timeZone</code> field, stable since 1.27.',
    },
    {
      q: 'What do @daily and @reboot actually mean?',
      a: 'They are crontab shorthands rather than five-field expressions: <code>@hourly</code> is <code>0 * * * *</code>, <code>@daily</code> and <code>@midnight</code> are <code>0 0 * * *</code>, <code>@weekly</code> is <code>0 0 * * 0</code>, <code>@monthly</code> is <code>0 0 1 * *</code>, <code>@yearly</code> is <code>0 0 1 1 *</code>. <code>@reboot</code> is the odd one, firing when the cron daemon starts rather than when the machine boots. GitHub Actions rejects all of them and Quartz has no equivalent, so they do not travel.',
    },
    {
      q: 'Why is my GitHub Actions schedule running late?',
      a: 'It is best-effort by design. Scheduled workflows are evaluated on GitHub’s UTC clock and queued behind everything else on the platform, so delays of several minutes are routine and runs at the top of the hour — when every repository asks at once — can be dropped altogether. Choosing <code>17 * * * *</code> over <code>0 * * * *</code> measurably helps. A schedule is also disabled automatically after 60 days without a commit.',
    },
  ],
  'cron-expression-parser': [
    {
      q: 'Why does my schedule run more often than expected?',
      a: 'When both day-of-month and day-of-week are restricted (neither is <code>*</code>), cron treats them as OR, not AND. <code>0 0 1 * 1</code> runs on the 1st of the month <em>and</em> every Monday, which surprises almost everyone the first time.',
    },
    {
      q: 'My expression has six fields. Which one is extra?',
      a: 'It depends on the scheduler, and the two conventions sit at opposite ends. Quartz and Spring’s <code>@Scheduled</code> put <em>seconds</em> first, so <code>0 0 12 * * ?</code> is noon daily. AWS EventBridge instead appends a <em>year</em> after the five standard fields and requires <code>?</code> in exactly one of the two day fields. Pasting an expression from one into the other shifts every field by one position, and it usually still parses — which is why it reaches production.',
    },
    {
      q: 'Why does a step like */7 not fire every seven days?',
      a: 'Because a step counts across its own field’s range and restarts when the field does, rather than measuring an interval. <code>*/7</code> in day-of-month fires on the 1st, 8th, 15th, 22nd and 29th, then begins again at the 1st — a gap of two or three days across the month boundary, not seven. The same applies to <code>*/40</code> in minutes, which fires at :00 and :40 and then waits only twenty minutes. For a true fixed interval you need a scheduler that supports one, or a job that records its own last run.',
    },
  ],
};
