import { describe, expect, it } from 'vitest';
import {
  CASE_VARIANTS,
  countCodePoints,
  countGraphemes,
  countLines,
  countParagraphs,
  countSentences,
  countWords,
  dedupeLines,
  findInvisibles,
  formatDuration,
  keywordFrequency,
  leadingNumber,
  naturalCompare,
  normalizeWhitespace,
  readingSeconds,
  smsReport,
  sortLines,
  splitGraphemes,
  splitGraphemesFallback,
  splitWords,
  textStats,
  toCamelCase,
  toDotCase,
  toKebabCase,
  toPascalCase,
  toPathCase,
  toScreamingSnakeCase,
  toSentenceCase,
  toSnakeCase,
  toTitleCase,
  toTrainCase,
  utf8ByteLength,
} from '~/lib/text';

// ─── Counting ─────────────────────────────────────────────────────────────

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('the quick brown fox')).toBe(4);
  });

  it('treats a hyphenated compound as one word', () => {
    expect(countWords('state-of-the-art tooling')).toBe(2);
  });

  it('ignores stray punctuation tokens', () => {
    expect(countWords('one — two')).toBe(2);
    expect(countWords('a . b')).toBe(2);
  });

  it('collapses runs of whitespace and newlines', () => {
    expect(countWords('  alpha \n\n  beta \t gamma  ')).toBe(3);
  });

  it('returns 0 for empty and whitespace-only input', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
  });

  it('counts CJK characters individually', () => {
    expect(countWords('日本語')).toBe(3);
    expect(countWords('hello 日本語 world')).toBe(5);
  });
});

describe('countSentences', () => {
  it('counts terminators', () => {
    expect(countSentences('Hello world. How are you? Fine!')).toBe(3);
  });

  it('does not split on an ellipsis followed by lowercase', () => {
    expect(countSentences('Hi... there!')).toBe(1);
  });

  it('counts a final sentence with no terminator', () => {
    expect(countSentences('One. Two. Three')).toBe(3);
  });

  it('treats a line break as a sentence boundary', () => {
    expect(countSentences('A heading\nA second heading')).toBe(2);
  });

  it('handles trailing quotes after a full stop', () => {
    expect(countSentences('He said "no." She left.')).toBe(2);
  });

  it('returns 0 for empty input', () => {
    expect(countSentences('')).toBe(0);
    expect(countSentences('...')).toBe(0);
  });
});

describe('countParagraphs and countLines', () => {
  it('splits paragraphs on blank lines', () => {
    expect(countParagraphs('one\nstill one\n\ntwo')).toBe(2);
  });

  it('ignores blank-only blocks', () => {
    expect(countParagraphs('one\n\n   \n\ntwo')).toBe(2);
  });

  it('counts lines the way a gutter does', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\n')).toBe(2);
  });
});

// ─── Graphemes ────────────────────────────────────────────────────────────

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
const FLAG = '\u{1F1EC}\u{1F1E7}';
const THUMBS_UP_TONE = '\u{1F44D}\u{1F3FD}';

describe('grapheme counting', () => {
  it('counts a ZWJ family emoji as one grapheme, not seven code points', () => {
    expect(countCodePoints(FAMILY)).toBe(7);
    expect(FAMILY.length).toBe(11);
    expect(countGraphemes(FAMILY)).toBe(1);
  });

  it('counts a flag as one grapheme', () => {
    expect(countGraphemes(FLAG)).toBe(1);
    expect(countCodePoints(FLAG)).toBe(2);
  });

  it('counts a skin-tone modifier as part of its emoji', () => {
    expect(countGraphemes(THUMBS_UP_TONE)).toBe(1);
  });

  it('counts combining marks as part of their base letter', () => {
    expect(countGraphemes('é')).toBe(1);
    expect(countCodePoints('é')).toBe(2);
  });

  it('agrees with Intl.Segmenter on the documented fallback path', () => {
    const samples = [
      FAMILY,
      FLAG,
      THUMBS_UP_TONE,
      'école',
      'abc',
      'a\r\nb',
      '\u{1F1EC}\u{1F1E7}\u{1F1EB}\u{1F1F7}',
      '\u{1F1EC}\u{1F1E7}\u{1F1EB}',
      '❤️',
      '',
    ];
    for (const sample of samples) {
      expect(splitGraphemesFallback(sample)).toEqual(splitGraphemes(sample));
    }
  });

  it('keeps three regional indicators as two clusters', () => {
    expect(splitGraphemesFallback('\u{1F1EC}\u{1F1E7}\u{1F1EB}')).toHaveLength(2);
  });
});

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte each', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('counts a two-byte character correctly', () => {
    expect(utf8ByteLength('é')).toBe(2);
  });

  it('counts an astral emoji as four bytes', () => {
    expect(utf8ByteLength('\u{1F600}')).toBe(4);
  });

  it('counts the family emoji as 25 bytes', () => {
    // 4 emoji × 4 bytes + 3 joiners × 3 bytes.
    expect(utf8ByteLength(FAMILY)).toBe(25);
  });
});

describe('reading time', () => {
  it('scales with word count', () => {
    expect(readingSeconds(238)).toBe(60);
    expect(readingSeconds(119)).toBe(30);
    expect(readingSeconds(0)).toBe(0);
  });

  it('never reports zero seconds for real content', () => {
    expect(readingSeconds(1)).toBe(1);
  });

  it('formats durations readably', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(95)).toBe('1m 35s');
    expect(formatDuration(3700)).toBe('1h 1m');
  });
});

describe('textStats', () => {
  it('reports every counter for a small document', () => {
    const s = textStats('Hello world.\n\nSecond paragraph here.');
    expect(s.words).toBe(5);
    expect(s.sentences).toBe(2);
    expect(s.paragraphs).toBe(2);
    expect(s.lines).toBe(3);
    expect(s.charactersNoSpaces).toBe(31);
    expect(s.averageWordsPerSentence).toBe(2.5);
  });

  it('is all zeros for empty input', () => {
    const s = textStats('');
    expect(s.words).toBe(0);
    expect(s.characters).toBe(0);
    expect(s.lines).toBe(0);
    expect(s.averageWordsPerSentence).toBe(0);
  });
});

// ─── Keyword frequency ────────────────────────────────────────────────────

describe('keywordFrequency', () => {
  const text = 'The cache stores the response. The response cache is warm, so the cache wins.';

  it('excludes stop words by default', () => {
    const top = keywordFrequency(text, { limit: 3 });
    expect(top[0]).toMatchObject({ word: 'cache', count: 3 });
    expect(top.map((k) => k.word)).not.toContain('the');
  });

  it('includes stop words when asked', () => {
    const top = keywordFrequency(text, { includeStopWords: true, limit: 1 });
    expect(top[0]!.word).toBe('the');
    expect(top[0]!.count).toBe(4);
  });

  it('breaks ties alphabetically so the table is stable', () => {
    const top = keywordFrequency('zebra apple zebra apple mango', { limit: 3 });
    expect(top.map((k) => k.word)).toEqual(['apple', 'zebra', 'mango']);
  });

  it('respects the limit and reports percentages', () => {
    const top = keywordFrequency(text, { limit: 2 });
    expect(top).toHaveLength(2);
    expect(top[0]!.percent).toBeGreaterThan(0);
  });
});

// ─── Word splitting and case conversion ───────────────────────────────────

describe('splitWords', () => {
  it('splits camelCase', () => {
    expect(splitWords('helloWorldAgain')).toEqual(['hello', 'World', 'Again']);
  });

  it('parses XMLHttpRequest into XML / Http / Request', () => {
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
  });

  it('handles an acronym in the middle', () => {
    expect(splitWords('getHTTPResponseCode')).toEqual(['get', 'HTTP', 'Response', 'Code']);
  });

  it('handles a trailing acronym', () => {
    expect(splitWords('parseURL')).toEqual(['parse', 'URL']);
  });

  it('absorbs digits that belong to their word', () => {
    expect(splitWords('utf8Encoder')).toEqual(['utf8', 'Encoder']);
    expect(splitWords('useHTTP2Pool')).toEqual(['use', 'HTTP2', 'Pool']);
  });

  it('splits on every common delimiter', () => {
    expect(splitWords('hello_world-foo.bar/baz qux')).toEqual([
      'hello', 'world', 'foo', 'bar', 'baz', 'qux',
    ]);
  });

  it('removes apostrophes rather than splitting on them', () => {
    expect(splitWords("user's profile")).toEqual(['users', 'profile']);
  });

  it('returns an empty array for punctuation-only input', () => {
    expect(splitWords('')).toEqual([]);
    expect(splitWords('--- ...')).toEqual([]);
  });
});

describe('case conversion', () => {
  it('converts the acronym example consistently', () => {
    const input = 'XMLHttpRequest';
    expect(toCamelCase(input)).toBe('xmlHttpRequest');
    expect(toPascalCase(input)).toBe('XmlHttpRequest');
    expect(toSnakeCase(input)).toBe('xml_http_request');
    expect(toScreamingSnakeCase(input)).toBe('XML_HTTP_REQUEST');
    expect(toKebabCase(input)).toBe('xml-http-request');
    expect(toTrainCase(input)).toBe('Xml-Http-Request');
    expect(toDotCase(input)).toBe('xml.http.request');
    expect(toPathCase(input)).toBe('xml/http/request');
  });

  it('converts a plain phrase', () => {
    const input = 'user account settings';
    expect(toCamelCase(input)).toBe('userAccountSettings');
    expect(toPascalCase(input)).toBe('UserAccountSettings');
    expect(toSnakeCase(input)).toBe('user_account_settings');
    expect(toKebabCase(input)).toBe('user-account-settings');
  });

  it('round-trips through every delimiter style', () => {
    const start = 'user_account_settings';
    expect(toSnakeCase(toCamelCase(start))).toBe(start);
    expect(toSnakeCase(toPascalCase(start))).toBe(start);
    expect(toSnakeCase(toKebabCase(start))).toBe(start);
    expect(toSnakeCase(toScreamingSnakeCase(start))).toBe(start);
    expect(toSnakeCase(toDotCase(start))).toBe(start);
    expect(toSnakeCase(toPathCase(start))).toBe(start);
    expect(toKebabCase(toCamelCase(toKebabCase(start)))).toBe('user-account-settings');
  });

  it('is idempotent for each delimiter style', () => {
    for (const fn of [toCamelCase, toPascalCase, toSnakeCase, toKebabCase, toDotCase, toPathCase]) {
      const once = fn('some mixed Input_value');
      expect(fn(once)).toBe(once);
    }
  });

  it('handles existing SCREAMING_SNAKE input', () => {
    expect(toCamelCase('MAX_RETRY_COUNT')).toBe('maxRetryCount');
    expect(toKebabCase('MAX_RETRY_COUNT')).toBe('max-retry-count');
  });

  it('handles digits at a boundary', () => {
    expect(toSnakeCase('parseInt2Value')).toBe('parse_int2_value');
    expect(toKebabCase('S3BucketName')).toBe('s3-bucket-name');
  });

  it('returns empty output for empty input', () => {
    for (const variant of CASE_VARIANTS) {
      expect(variant.convert('')).toBe('');
    }
  });
});

describe('toTitleCase', () => {
  it('capitalises words and lowercases minor ones', () => {
    expect(toTitleCase('the lord of the rings')).toBe('The Lord of the Rings');
  });

  it('capitalises a minor word in the final position', () => {
    expect(toTitleCase('what are you waiting for')).toBe('What Are You Waiting For');
  });

  it('leaves deliberate interior capitals alone', () => {
    expect(toTitleCase('using iPhone with macOS')).toBe('Using iPhone With macOS');
  });

  it('preserves punctuation and spacing', () => {
    expect(toTitleCase('hello,  world!')).toBe('Hello,  World!');
  });
});

describe('toSentenceCase', () => {
  it('capitalises the first letter of each sentence', () => {
    expect(toSentenceCase('HELLO WORLD. THIS IS FINE.')).toBe('Hello world. This is fine.');
  });

  it('restores a standalone I', () => {
    expect(toSentenceCase('THEN I LEFT.')).toBe('Then I left.');
  });

  it('starts a new sentence after a line break', () => {
    expect(toSentenceCase('first line\nSECOND LINE')).toBe('First line\nSecond line');
  });
});

// ─── Deduplication ────────────────────────────────────────────────────────

describe('dedupeLines', () => {
  const list = 'a\nb\na\nc\nb\na';

  it('keeps the first occurrence by default', () => {
    const r = dedupeLines(list);
    expect(r.lines).toEqual(['a', 'b', 'c']);
    expect(r.removed).toBe(3);
    expect(r.duplicateValues).toBe(2);
    expect(r.unique).toBe(3);
  });

  it('keeps the last occurrence when asked, preserving order', () => {
    const r = dedupeLines(list, { keep: 'last' });
    expect(r.lines).toEqual(['c', 'b', 'a']);
  });

  it('compares case-insensitively when asked', () => {
    const r = dedupeLines('Alpha\nALPHA\nbeta', { caseInsensitive: true });
    expect(r.lines).toEqual(['Alpha', 'beta']);
    expect(r.removed).toBe(1);
  });

  it('is case-sensitive by default', () => {
    expect(dedupeLines('Alpha\nALPHA').lines).toEqual(['Alpha', 'ALPHA']);
  });

  it('trims before comparing when asked', () => {
    const r = dedupeLines('  a\na  \nb', { trim: true });
    expect(r.lines).toEqual(['  a', 'b']);
  });

  it('inverts to show only duplicated lines', () => {
    const r = dedupeLines(list, { invert: true });
    expect(r.lines).toEqual(['a', 'b']);
  });

  it('can drop blank lines', () => {
    const r = dedupeLines('a\n\nb\n\n', { removeBlank: true });
    expect(r.lines).toEqual(['a', 'b']);
  });

  it('handles empty input', () => {
    const r = dedupeLines('');
    expect(r.lines).toEqual(['']);
    expect(r.removed).toBe(0);
  });
});

// ─── Sorting ──────────────────────────────────────────────────────────────

describe('naturalCompare', () => {
  it('puts file2 before file10', () => {
    expect(naturalCompare('file2', 'file10')).toBeLessThan(0);
  });

  it('sorts a realistic file list naturally', () => {
    const input = ['file10.txt', 'file2.txt', 'file1.txt', 'file20.txt', 'file3.txt'];
    expect(input.slice().sort(naturalCompare)).toEqual([
      'file1.txt', 'file2.txt', 'file3.txt', 'file10.txt', 'file20.txt',
    ]);
  });

  it('handles multiple numeric segments like versions', () => {
    const versions = ['v1.10.0', 'v1.2.0', 'v1.9.3', 'v1.2.10'];
    expect(versions.slice().sort(naturalCompare)).toEqual([
      'v1.2.0', 'v1.2.10', 'v1.9.3', 'v1.10.0',
    ]);
  });

  it('orders leading-zero variants deterministically', () => {
    expect(naturalCompare('01', '1')).toBeLessThan(0);
    expect(naturalCompare('a007', 'a7')).toBeLessThan(0);
  });

  it('stays correct past 2^53', () => {
    expect(naturalCompare('id9007199254740993', 'id9007199254740994')).toBeLessThan(0);
  });
});

describe('sortLines', () => {
  const list = 'banana\nApple\ncherry';

  it('sorts alphabetically, case-insensitively by default', () => {
    expect(sortLines(list).lines).toEqual(['Apple', 'banana', 'cherry']);
  });

  it('honours case sensitivity', () => {
    expect(sortLines(list, { caseSensitive: true }).lines).toEqual(['Apple', 'banana', 'cherry']);
    expect(sortLines('b\nA\na', { caseSensitive: true }).lines).toEqual(['A', 'a', 'b']);
  });

  it('reverses', () => {
    expect(sortLines(list, { reverse: true }).lines).toEqual(['cherry', 'banana', 'Apple']);
  });

  it('sorts numerically by leading number', () => {
    const r = sortLines('10 apples\n2 pears\n33 plums\nno number', { mode: 'numeric' });
    expect(r.lines).toEqual(['2 pears', '10 apples', '33 plums', 'no number']);
  });

  it('sorts naturally so file2 precedes file10', () => {
    const r = sortLines('file10.txt\nfile2.txt\nfile1.txt', { mode: 'natural' });
    expect(r.lines).toEqual(['file1.txt', 'file2.txt', 'file10.txt']);
  });

  it('sorts by length', () => {
    const r = sortLines('ccc\na\nbb', { mode: 'length' });
    expect(r.lines).toEqual(['a', 'bb', 'ccc']);
  });

  it('shuffles with an injected generator', () => {
    const r = sortLines('a\nb\nc\nd', { mode: 'random', random: () => 0 });
    expect(r.lines.slice().sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.lines).toHaveLength(4);
  });

  it('ignores leading whitespace when asked', () => {
    const r = sortLines('   zeta\nalpha', { ignoreLeadingWhitespace: true });
    expect(r.lines).toEqual(['alpha', '   zeta']);
  });

  it('removes blank lines and reports how many', () => {
    const r = sortLines('b\n\na\n  \n', { removeBlank: true });
    expect(r.lines).toEqual(['a', 'b']);
    expect(r.blanksRemoved).toBe(3);
  });

  it('is stable for equal keys', () => {
    const r = sortLines('a 1\na 2\na 3', { mode: 'length' });
    expect(r.lines).toEqual(['a 1', 'a 2', 'a 3']);
  });
});

describe('leadingNumber', () => {
  it('parses signs, decimals and thousands separators', () => {
    expect(leadingNumber('42 items')).toBe(42);
    expect(leadingNumber('-3.5 degrees')).toBe(-3.5);
    expect(leadingNumber('1,240.00 EUR')).toBe(1240);
    expect(Number.isNaN(leadingNumber('no digits here'))).toBe(true);
  });
});

// ─── Whitespace ───────────────────────────────────────────────────────────

describe('normalizeWhitespace', () => {
  it('collapses runs of spaces', () => {
    const r = normalizeWhitespace('a    b\tc', { collapseSpaces: true });
    expect(r.text).toBe('a b\tc');
    expect(r.changes.some((c) => c.label.includes('Repeated spaces'))).toBe(true);
  });

  it('never collapses across a line break', () => {
    const r = normalizeWhitespace('a  \n  b', { collapseSpaces: true });
    expect(r.text).toBe('a \n b');
  });

  it('trims each line', () => {
    expect(normalizeWhitespace('  a  \n  b  ', { trimLines: true }).text).toBe('a\nb');
  });

  it('removes blank lines', () => {
    const r = normalizeWhitespace('a\n\n\nb\n   \nc', { removeBlankLines: true });
    expect(r.text).toBe('a\nb\nc');
    expect(r.changes.find((c) => c.label.includes('Blank'))!.count).toBe(3);
  });

  it('converts tabs to spaces and back', () => {
    expect(normalizeWhitespace('\tx', { tabsToSpaces: true, tabWidth: 4 }).text).toBe('    x');
    expect(normalizeWhitespace('    x', { spacesToTabs: true, tabWidth: 4 }).text).toBe('\tx');
  });

  it('strips zero-width characters and the BOM', () => {
    const dirty = '\uFEFFin\u200Bvoice\u00AD';
    const r = normalizeWhitespace(dirty, { stripZeroWidth: true });
    expect(r.text).toBe('invoice');
    expect(r.changes.find((c) => c.label.includes('Invisible'))!.count).toBe(3);
  });

  it('keeps the zero-width joiners inside a family emoji', () => {
    const r = normalizeWhitespace(`a\u200Bb ${FAMILY}`, { stripZeroWidth: true });
    expect(r.text).toBe(`ab ${FAMILY}`);
    expect(countGraphemes(r.text.slice(3))).toBe(1);
  });

  it('strips emoji joiners when the protection is disabled', () => {
    const r = normalizeWhitespace(FAMILY, {
      stripZeroWidth: true,
      preserveEmojiJoiners: false,
    });
    expect(countGraphemes(r.text)).toBe(4);
  });

  it('normalises non-breaking and exotic spaces', () => {
    const r = normalizeWhitespace('1\u00A0240\u202F00\u3000x', { normalizeNbsp: true });
    expect(r.text).toBe('1 240 00 x');
    expect(r.changes.find((c) => c.label.includes('Non-breaking'))!.count).toBe(3);
  });

  it('normalises CRLF', () => {
    expect(normalizeWhitespace('a\r\nb\rc', { normalizeNewlines: true }).text).toBe('a\nb\nc');
  });

  it('does nothing when no operation is enabled', () => {
    const messy = '  a  \n\n\tb\u200B  ';
    const r = normalizeWhitespace(messy, {});
    expect(r.text).toBe(messy);
    expect(r.changes).toEqual([]);
  });

  it('reports how much it removed', () => {
    const r = normalizeWhitespace('a    b\n\n\nc', {
      collapseSpaces: true,
      removeBlankLines: true,
    });
    expect(r.text).toBe('a b\nc');
    expect(r.charactersRemoved).toBeGreaterThan(0);
    expect(r.linesRemoved).toBe(2);
  });
});

describe('findInvisibles', () => {
  it('reports what is hiding in the text', () => {
    const found = findInvisibles('a\u200Bb\u00A0c\td  \n');
    const labels = found.map((f) => f.label);
    expect(labels).toContain('U+200B zero-width space');
    expect(labels).toContain('U+00A0 non-breaking space');
    expect(labels).toContain('Tab');
    expect(labels).toContain('Line with trailing whitespace');
  });

  it('finds nothing in clean text', () => {
    expect(findInvisibles('clean text\nhere')).toEqual([]);
  });
});

// ─── SMS segmentation ─────────────────────────────────────────────────────

describe('smsReport', () => {
  it('uses GSM-7 for plain ASCII', () => {
    const r = smsReport('Your code is 4821.');
    expect(r.encoding).toBe('GSM-7');
    expect(r.units).toBe(18);
    expect(r.segments).toBe(1);
    expect(r.remaining).toBe(142);
  });

  it('bills GSM-7 extension characters as two septets', () => {
    expect(smsReport('{}').units).toBe(4);
    expect(smsReport('€').units).toBe(2);
  });

  it('switches to UCS-2 for a single emoji and names the offender', () => {
    const r = smsReport('Hi 👋');
    expect(r.encoding).toBe('UCS-2');
    expect(r.singleLimit).toBe(70);
    expect(r.offenders).toEqual(['👋']);
  });

  it('switches to UCS-2 for a curly apostrophe', () => {
    expect(smsReport('don’t').encoding).toBe('UCS-2');
    expect(smsReport("don't").encoding).toBe('GSM-7');
  });

  it('splits into concatenated parts at the right boundary', () => {
    expect(smsReport('a'.repeat(160)).segments).toBe(1);
    expect(smsReport('a'.repeat(161)).segments).toBe(2);
    expect(smsReport('a'.repeat(306)).segments).toBe(2);
    expect(smsReport('a'.repeat(307)).segments).toBe(3);
  });

  it('reports nothing for empty input', () => {
    const r = smsReport('');
    expect(r.segments).toBe(0);
    expect(r.units).toBe(0);
  });
});
