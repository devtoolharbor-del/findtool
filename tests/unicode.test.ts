import { describe, it, expect } from 'vitest';
import {
  CP,
  codePoints,
  describeCodePoint,
  blockOf,
  nameOf,
  isInvisible,
  isCombining,
  utf8Bytes,
  utf16Units,
  splitGraphemes,
  fallbackGraphemes,
  hasSegmenter,
  toEscapes,
  fromEscapes,
  wellFormed,
  normalize,
  normalizationReport,
  textStats,
  SAMPLE_UNICODE,
} from '~/lib/unicode';

const HAMMER = String.fromCodePoint(0x1f6e0);
const VS16 = String.fromCodePoint(0xfe0f);
const ZWJ = String.fromCodePoint(0x200d);
const FAMILY = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
const FLAG_JP = String.fromCodePoint(0x1f1ef, 0x1f1f5);
const E_COMBINING = String.fromCodePoint(0x0065, 0x0301);
const E_PRECOMPOSED = String.fromCodePoint(0x00e9);

describe('describeCodePoint', () => {
  it('describes an ASCII letter', () => {
    const info = describeCodePoint('A');
    expect(info.codePoint).toBe(65);
    expect(info.notation).toBe('U+0041');
    expect(info.name).toBe('LATIN CAPITAL LETTER A');
    expect(info.block).toBe('Basic Latin');
    expect(info.utf8).toEqual([65]);
    expect(info.utf16).toEqual([65]);
    expect(info.astral).toBe(false);
  });

  it('describes an astral character with its surrogate pair', () => {
    const info = describeCodePoint(HAMMER);
    expect(info.codePoint).toBe(0x1f6e0);
    expect(info.notation).toBe('U+1F6E0');
    expect(info.astral).toBe(true);
    expect(info.utf16).toEqual([0xd83d, 0xdee0]);
    expect(info.utf8).toEqual([0xf0, 0x9f, 0x9b, 0xa0]);
    expect(info.escapeJs).toBe('\\uD83D\\uDEE0');
    expect(info.escapeEs6).toBe('\\u{1F6E0}');
    expect(info.escapePython).toBe('\\U0001F6E0');
    expect(info.htmlDecimal).toBe('&#128736;');
    expect(info.htmlHex).toBe('&#x1F6E0;');
    expect(info.percentEncoded).toBe('%F0%9F%9B%A0');
  });

  it('flags a combining mark', () => {
    const info = describeCodePoint(String.fromCodePoint(0x0301));
    expect(info.combining).toBe(true);
    expect(info.name).toMatch(/COMBINING/);
  });

  it('names the invisible characters people are hunting for', () => {
    expect(nameOf(0x00a0)).toBe('NO-BREAK SPACE');
    expect(nameOf(0x200b)).toBe('ZERO WIDTH SPACE');
    expect(nameOf(0x200d)).toBe('ZERO WIDTH JOINER');
    expect(nameOf(0xfeff)).toMatch(/byte order mark/);
    expect(nameOf(0x0009)).toMatch(/tab/);
  });

  it('names regional indicators and skin tone modifiers', () => {
    expect(nameOf(0x1f1ef)).toBe('REGIONAL INDICATOR SYMBOL LETTER J');
    expect(nameOf(0x1f3fb)).toBe('EMOJI MODIFIER FITZPATRICK TYPE-1');
  });

  it('places code points in a block', () => {
    expect(blockOf(0x41)).toBe('Basic Latin');
    expect(blockOf(0x1f600)).toBe('Emoticons');
    expect(blockOf(0x4e2d)).toBe('CJK Unified Ideographs');
  });
});

describe('isInvisible', () => {
  it('spots a no-break space and a zero-width joiner', () => {
    expect(isInvisible(String.fromCodePoint(0x00a0))).toBe(true);
    expect(isInvisible(ZWJ)).toBe(true);
    expect(isInvisible(String.fromCodePoint(0xfeff))).toBe(true);
  });

  it('does not flag ordinary whitespace or letters', () => {
    expect(isInvisible(' ')).toBe(false);
    expect(isInvisible('\n')).toBe(false);
    expect(isInvisible('\t')).toBe(false);
    expect(isInvisible('a')).toBe(false);
  });

  it('flags a variation selector', () => {
    expect(isInvisible(VS16)).toBe(true);
  });
});

describe('codePoints', () => {
  it('keeps surrogate pairs together', () => {
    expect(codePoints(HAMMER)).toHaveLength(1);
    expect(HAMMER.length).toBe(2); // but String.length still counts two
  });

  it('lists each part of a ZWJ sequence separately', () => {
    const points = codePoints(FAMILY);
    expect(points).toHaveLength(5);
    expect(points[1]!.codePoint).toBe(CP.ZWJ);
  });
});

describe('splitGraphemes', () => {
  it('is backed by Intl.Segmenter in this runtime', () => {
    expect(hasSegmenter()).toBe(true);
  });

  it('counts a ZWJ family emoji as one character', () => {
    expect(splitGraphemes(FAMILY)).toHaveLength(1);
  });

  it('counts a flag as one character', () => {
    expect(splitGraphemes(FLAG_JP)).toHaveLength(1);
  });

  it('keeps a base letter and its combining mark together', () => {
    expect(splitGraphemes(E_COMBINING)).toHaveLength(1);
    expect(splitGraphemes('e' + String.fromCodePoint(0x0301, 0x0302, 0x0303))).toHaveLength(1);
  });

  it('keeps an emoji with its variation selector together', () => {
    expect(splitGraphemes(HAMMER + VS16)).toHaveLength(1);
  });
});

describe('fallbackGraphemes', () => {
  it('matches Intl.Segmenter on the cases it claims to cover', () => {
    for (const input of [FAMILY, FLAG_JP, E_COMBINING, HAMMER + VS16, 'plain text', '']) {
      expect(fallbackGraphemes(input).length, JSON.stringify(input)).toBe(splitGraphemes(input).length);
    }
  });

  it('treats CR LF as one cluster', () => {
    expect(fallbackGraphemes('a\r\nb')).toEqual(['a', '\r\n', 'b']);
  });

  it('pairs two flags rather than merging four regional indicators', () => {
    const twoFlags = FLAG_JP + String.fromCodePoint(0x1f1eb, 0x1f1f7);
    expect(fallbackGraphemes(twoFlags)).toHaveLength(2);
  });

  it('never loses characters', () => {
    for (const input of [SAMPLE_UNICODE, FAMILY, 'abc']) {
      expect(fallbackGraphemes(input).join('')).toBe(input);
    }
  });
});

describe('toEscapes', () => {
  it('leaves printable ASCII alone by default', () => {
    expect(toEscapes('abc', 'js')).toBe('abc');
  });

  it('escapes everything when asked', () => {
    expect(toEscapes('ab', 'js', { asciiOnly: false })).toBe('\\u0061\\u0062');
  });

  it('produces each supported style', () => {
    expect(toEscapes('é', 'js')).toBe('\\u00E9');
    expect(toEscapes('é', 'es6')).toBe('\\u{E9}');
    expect(toEscapes('é', 'python')).toBe('\\U000000E9');
    expect(toEscapes('é', 'html-dec')).toBe('&#233;');
    expect(toEscapes('é', 'html-hex')).toBe('&#xE9;');
    expect(toEscapes('é', 'percent')).toBe('%C3%A9');
    expect(toEscapes('é', 'css')).toBe('\\0000E9 ');
  });

  it('lists code points for the codepoint style, including ASCII', () => {
    expect(toEscapes('Aé', 'codepoint')).toBe('U+0041 U+00E9');
  });

  it('uses a surrogate pair for js and a single value for es6', () => {
    expect(toEscapes(HAMMER, 'js')).toBe('\\uD83D\\uDEE0');
    expect(toEscapes(HAMMER, 'es6')).toBe('\\u{1F6E0}');
  });
});

describe('fromEscapes', () => {
  it('reverses every style it emits', () => {
    for (const style of ['js', 'es6', 'python', 'html-dec', 'html-hex', 'percent'] as const) {
      const text = 'café ' + HAMMER;
      expect(fromEscapes(toEscapes(text, style)), style).toBe(text);
    }
  });

  it('recombines a surrogate pair written as two four-digit escapes', () => {
    expect(fromEscapes('\\uD83D\\uDEE0')).toBe(HAMMER);
  });

  it('accepts a mixed blob of notations', () => {
    expect(fromEscapes('a \\u00E9 &#233; U+00E9 %C3%A9')).toBe('a é é é é');
  });

  it('accepts hex byte escapes', () => {
    expect(fromEscapes('\\x41\\x42')).toBe('AB');
  });

  it('leaves text that is not an escape alone', () => {
    expect(fromEscapes('a normal sentence')).toBe('a normal sentence');
    expect(fromEscapes('\\username')).toBe('\\username');
  });

  it('refuses a value above the Unicode maximum', () => {
    expect(fromEscapes('\\u{110000}')).toBe('\\u{110000}');
  });

  it('handles empty input', () => {
    expect(fromEscapes('')).toBe('');
  });
});

describe('wellFormed', () => {
  it('leaves valid text untouched', () => {
    expect(wellFormed('café ' + HAMMER)).toBe('café ' + HAMMER);
  });

  it('replaces a lone surrogate', () => {
    const lone = String.fromCharCode(0xd83d);
    expect(wellFormed('a' + lone + 'b')).toBe('a�b');
  });
});

describe('normalisation', () => {
  it('composes and decomposes an accented letter', () => {
    expect(normalize(E_COMBINING, 'NFC')).toBe(E_PRECOMPOSED);
    expect(normalize(E_PRECOMPOSED, 'NFD')).toBe(E_COMBINING);
  });

  it('shows that the two forms look identical but do not compare equal', () => {
    expect(E_COMBINING).not.toBe(E_PRECOMPOSED);
    expect(normalize(E_COMBINING, 'NFC')).toBe(normalize(E_PRECOMPOSED, 'NFC'));
  });

  it('folds compatibility characters only in the K forms', () => {
    const ligature = String.fromCodePoint(0xfb01); // ﬁ
    expect(normalize(ligature, 'NFC')).toBe(ligature);
    expect(normalize(ligature, 'NFKC')).toBe('fi');
    expect(normalize(String.fromCodePoint(0x00b2), 'NFKC')).toBe('2');
  });

  it('reports what changed and by how much', () => {
    const report = normalizationReport(E_COMBINING, 'NFC');
    expect(report.changed).toBe(true);
    expect(report.codePointsBefore).toBe(2);
    expect(report.codePointsAfter).toBe(1);
    expect(report.bytesBefore).toBe(3);
    expect(report.bytesAfter).toBe(2);
  });

  it('reports no change when the text is already normalised', () => {
    expect(normalizationReport('plain', 'NFC').changed).toBe(false);
  });
});

describe('textStats', () => {
  it('separates the four ways of counting a family emoji', () => {
    const stats = textStats(FAMILY);
    expect(stats.graphemes).toBe(1);
    expect(stats.codePointCount).toBe(5);
    expect(stats.codeUnits).toBe(8);
    expect(stats.utf8Bytes).toBe(18);
  });

  it('flags astral, combining and invisible characters', () => {
    expect(textStats(HAMMER).hasAstral).toBe(true);
    expect(textStats(E_COMBINING).hasCombining).toBe(true);
    expect(textStats('a' + ZWJ + 'b').hasInvisible).toBe(true);
    expect(textStats('plain').hasInvisible).toBe(false);
  });

  it('detects text that is not in NFC', () => {
    expect(textStats(E_COMBINING).needsNfc).toBe(true);
    expect(textStats(E_PRECOMPOSED).needsNfc).toBe(false);
  });

  it('counts lines and handles empty input', () => {
    expect(textStats('a\nb\r\nc').lines).toBe(3);
    const empty = textStats('');
    expect(empty.lines).toBe(0);
    expect(empty.graphemes).toBe(0);
    expect(empty.utf8Bytes).toBe(0);
  });
});

describe('byte views', () => {
  it('encodes UTF-8 and lists UTF-16 code units', () => {
    expect([...utf8Bytes('é')]).toEqual([0xc3, 0xa9]);
    expect(utf16Units('é')).toEqual([0xe9]);
    expect(utf16Units(HAMMER)).toEqual([0xd83d, 0xdee0]);
  });
});

describe('the shipped sample', () => {
  it('exercises every hard case at once', () => {
    const stats = textStats(SAMPLE_UNICODE);
    expect(stats.hasAstral).toBe(true);
    expect(stats.hasCombining).toBe(true);
    expect(stats.hasInvisible).toBe(true);
    expect(stats.needsNfc).toBe(true);
    expect(stats.graphemes).toBeLessThan(stats.codePointCount);
    expect(isCombining(String.fromCodePoint(0x0301))).toBe(true);
  });
});
