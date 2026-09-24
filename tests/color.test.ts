import { describe, expect, it } from 'vitest';
import {
  BLACK,
  ColorParseError,
  WHITE,
  allFormats,
  assessContrast,
  cmykToRgb,
  contrastRatio,
  flattenOver,
  formatCmyk,
  formatHsl,
  formatHwb,
  formatOklch,
  formatRgb,
  isOutOfSrgbGamut,
  linearSrgbToOklab,
  nameForColor,
  oklabToLinearSrgb,
  oklchToRgb,
  parseColor,
  relativeLuminance,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHwb,
  rgbToOklch,
  tryParseColor,
} from '~/lib/color';

const round = (rgb: { r: number; g: number; b: number; a: number }) => ({
  r: Math.round(rgb.r),
  g: Math.round(rgb.g),
  b: Math.round(rgb.b),
  a: rgb.a,
});

describe('parsing hex', () => {
  it('reads 6-digit hex', () => {
    expect(round(parseColor('#ff0000'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(round(parseColor('#4F46E5'))).toEqual({ r: 79, g: 70, b: 229, a: 1 });
  });

  it('reads 3-digit hex by doubling each digit', () => {
    expect(round(parseColor('#f00'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(round(parseColor('#abc'))).toEqual({ r: 170, g: 187, b: 204, a: 1 });
  });

  it('reads 4- and 8-digit hex with alpha', () => {
    expect(parseColor('#ff000080').a).toBeCloseTo(128 / 255, 5);
    expect(parseColor('#f008').a).toBeCloseTo(136 / 255, 5);
    expect(round(parseColor('#ff000000'))).toEqual({ r: 255, g: 0, b: 0, a: 0 });
  });

  it('accepts hex without the hash', () => {
    expect(round(parseColor('00ff00'))).toEqual({ r: 0, g: 255, b: 0, a: 1 });
  });

  it('explains a wrong digit count', () => {
    expect(() => parseColor('#12345')).toThrow(/3, 4, 6 or 8 digits/);
  });

  it('names the character that is not a hex digit', () => {
    expect(() => parseColor('#gg0000')).toThrow(/"g" is not a hex digit/);
  });
});

describe('parsing functional notation', () => {
  it('reads legacy comma syntax', () => {
    expect(round(parseColor('rgb(255, 0, 0)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(255, 0, 0, 0.5)').a).toBe(0.5);
  });

  it('reads modern space syntax with a slash alpha', () => {
    expect(round(parseColor('rgb(255 0 0 / 50%)'))).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(round(parseColor('hsl(120deg 100% 25% / 0.25)'))).toEqual({
      r: 0,
      g: 128,
      b: 0,
      a: 0.25,
    });
  });

  it('reads percentage rgb components', () => {
    expect(round(parseColor('rgb(100%, 0%, 0%)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('reads every CSS hue unit', () => {
    const red = round(parseColor('hsl(0, 100%, 50%)'));
    expect(round(parseColor('hsl(360deg, 100%, 50%)'))).toEqual(red);
    expect(round(parseColor('hsl(1turn, 100%, 50%)'))).toEqual(red);
    expect(round(parseColor('hsl(400grad, 100%, 50%)'))).toEqual(red);
    expect(round(parseColor('hsl(6.28319rad, 100%, 50%)'))).toEqual(red);
  });

  it('reads hwb, oklch and cmyk', () => {
    expect(round(parseColor('hwb(0 0% 0%)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(round(parseColor('oklch(0.6279 0.2577 29.23)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(round(parseColor('cmyk(0%, 100%, 100%, 0%)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('reads CSS colour keywords', () => {
    expect(round(parseColor('red'))).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(round(parseColor('rebeccapurple'))).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('refuses unsupported colour functions by name', () => {
    expect(() => parseColor('lab(50% 40 59.5)')).toThrow(/not one of the formats/);
    expect(() => parseColor('notacolor(1 2 3)')).toThrow(/not a colour function/);
  });

  it('gives a useful message for an unknown keyword', () => {
    expect(() => parseColor('burgundy')).toThrow(/not a CSS colour keyword/);
  });

  it('throws ColorParseError, never a bare Error', () => {
    expect(() => parseColor('')).toThrow(ColorParseError);
  });

  it('tryParseColor returns null instead of throwing', () => {
    expect(tryParseColor('#ff0000')).not.toBeNull();
    expect(tryParseColor('nonsense')).toBeNull();
  });
});

describe('known conversions', () => {
  it('#ff0000 → rgb(255, 0, 0) → hsl(0, 100%, 50%)', () => {
    const red = parseColor('#ff0000');
    expect(formatRgb(red)).toBe('rgb(255, 0, 0)');
    expect(formatHsl(red)).toBe('hsl(0, 100%, 50%)');
    expect(rgbToHex(red)).toBe('#ff0000');
  });

  it('converts the primaries and secondaries to HSL', () => {
    expect(formatHsl(parseColor('#00ff00'))).toBe('hsl(120, 100%, 50%)');
    expect(formatHsl(parseColor('#0000ff'))).toBe('hsl(240, 100%, 50%)');
    expect(formatHsl(parseColor('#ffff00'))).toBe('hsl(60, 100%, 50%)');
    expect(formatHsl(parseColor('#00ffff'))).toBe('hsl(180, 100%, 50%)');
    expect(formatHsl(parseColor('#ff00ff'))).toBe('hsl(300, 100%, 50%)');
    expect(formatHsl(parseColor('#808080'))).toBe('hsl(0, 0%, 50.2%)');
  });

  it('converts to HWB', () => {
    expect(formatHwb(parseColor('#ff0000'))).toBe('hwb(0 0% 0%)');
    expect(formatHwb(parseColor('#ffffff'))).toBe('hwb(0 100% 0%)');
    expect(formatHwb(parseColor('#000000'))).toBe('hwb(0 0% 100%)');
  });

  it('converts to CMYK', () => {
    expect(formatCmyk(parseColor('#ff0000'))).toBe('cmyk(0%, 100%, 100%, 0%)');
    expect(formatCmyk(parseColor('#000000'))).toBe('cmyk(0%, 0%, 0%, 100%)');
    expect(formatCmyk(parseColor('#ffffff'))).toBe('cmyk(0%, 0%, 0%, 0%)');
    expect(formatCmyk(parseColor('#00ffff'))).toBe('cmyk(100%, 0%, 0%, 0%)');
  });

  it('computes OKLCH against published reference values', () => {
    // sRGB red: L 0.6279, C 0.2577, H 29.23 (Ottosson's reference conversion).
    const red = rgbToOklch(parseColor('#ff0000'));
    expect(red.l).toBeCloseTo(0.6279, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);

    const white = rgbToOklch(WHITE);
    expect(white.l).toBeCloseTo(1, 5);
    expect(white.c).toBeCloseTo(0, 5);

    const black = rgbToOklch(BLACK);
    expect(black.l).toBeCloseTo(0, 5);

    const blue = rgbToOklch(parseColor('#0000ff'));
    expect(blue.l).toBeCloseTo(0.452, 2);
    expect(blue.h).toBeCloseTo(264.05, 1);
  });

  it('formats OKLCH the way CSS expects', () => {
    expect(formatOklch(parseColor('#ff0000'))).toBe('oklch(0.628 0.2577 29.23)');
    expect(formatOklch(parseColor('#ffffff'))).toBe('oklch(1 0 0)');
  });

  it('OKLab and its inverse round-trip through linear sRGB', () => {
    const lab = linearSrgbToOklab(0.2, 0.5, 0.8);
    const back = oklabToLinearSrgb(lab);
    // Six decimal places: a cube root and its inverse cannot be exact in
    // binary floating point, and the error here is around 3e-8.
    expect(back.r).toBeCloseTo(0.2, 6);
    expect(back.g).toBeCloseTo(0.5, 6);
    expect(back.b).toBeCloseTo(0.8, 6);
  });
});

describe('round trips', () => {
  const samples = ['#000000', '#ffffff', '#ff0000', '#4f46e5', '#7fffd4', '#123456', '#cd853f'];

  it('survives hex → hsl → hex', () => {
    for (const hex of samples) {
      const rgb = parseColor(hex);
      expect(rgbToHex(parseColor(formatHsl(rgb)))).toBe(hex);
    }
  });

  it('survives hex → hwb → hex', () => {
    for (const hex of samples) {
      const rgb = parseColor(hex);
      expect(rgbToHex(parseColor(formatHwb(rgb)))).toBe(hex);
    }
  });

  it('survives hex → oklch → hex', () => {
    for (const hex of samples) {
      const rgb = parseColor(hex);
      expect(rgbToHex(parseColor(formatOklch(rgb)))).toBe(hex);
    }
  });

  it('survives hex → cmyk → hex', () => {
    for (const hex of samples) {
      const rgb = parseColor(hex);
      expect(rgbToHex(cmykToRgb(rgbToCmyk(rgb)))).toBe(hex);
    }
  });

  it('keeps alpha through every format', () => {
    const translucent = parseColor('rgba(79, 70, 229, 0.4)');
    expect(rgbToHsl(translucent).a).toBe(0.4);
    expect(rgbToHwb(translucent).a).toBe(0.4);
    expect(rgbToOklch(translucent).a).toBe(0.4);
    expect(rgbToCmyk(translucent).a).toBe(0.4);
    expect(rgbToHex(translucent)).toMatch(/^#4f46e566$/);
    expect(formatRgb(translucent)).toBe('rgba(79, 70, 229, 0.4)');
    expect(formatHwb(translucent)).toMatch(/\/ 0\.4\)$/);
  });
});

describe('out of gamut', () => {
  it('flags an OKLCH colour sRGB cannot show', () => {
    expect(isOutOfSrgbGamut({ l: 0.7, c: 0.35, h: 150, a: 1 })).toBe(true);
    expect(isOutOfSrgbGamut(rgbToOklch(parseColor('#4f46e5')))).toBe(false);
  });

  it('clamps rather than producing impossible channel values', () => {
    const clamped = oklchToRgb({ l: 0.7, c: 0.4, h: 150, a: 1 });
    for (const channel of [clamped.r, clamped.g, clamped.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });
});

describe('WCAG contrast', () => {
  it('black on white is exactly 21:1', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 10);
  });

  it('a colour against itself is 1:1', () => {
    const brand = parseColor('#4f46e5');
    expect(contrastRatio(brand, brand)).toBeCloseTo(1, 10);
  });

  it('matches published luminance values', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 10);
    expect(relativeLuminance(parseColor('#808080'))).toBeCloseTo(0.2159, 3);
  });

  it('matches known ratios from the WCAG reference implementation', () => {
    // #767676 is the canonical lightest grey that still passes AA on white.
    expect(contrastRatio(parseColor('#767676'), WHITE)).toBeCloseTo(4.54, 2);
    expect(contrastRatio(parseColor('#ff0000'), WHITE)).toBeCloseTo(3.998, 2);
    expect(contrastRatio(parseColor('#0000ff'), WHITE)).toBeCloseTo(8.59, 2);
    expect(contrastRatio(parseColor('#595959'), WHITE)).toBeCloseTo(7.0, 1);
  });

  it('applies the AA and AAA thresholds', () => {
    const passes = assessContrast(parseColor('#595959'), WHITE);
    expect(passes.aaNormal).toBe(true);
    expect(passes.aaaNormal).toBe(true);

    const borderline = assessContrast(parseColor('#767676'), WHITE);
    expect(borderline.aaNormal).toBe(true);
    expect(borderline.aaaNormal).toBe(false);
    expect(borderline.aaLarge).toBe(true);

    const fails = assessContrast(parseColor('#cccccc'), WHITE);
    expect(fails.aaNormal).toBe(false);
    expect(fails.aaLarge).toBe(false);
    expect(fails.uiComponents).toBe(false);
  });

  it('composites a translucent colour before measuring it', () => {
    const half = { r: 0, g: 0, b: 0, a: 0.5 };
    const overWhite = flattenOver(half, WHITE);
    expect(Math.round(overWhite.r)).toBe(128);
    expect(overWhite.a).toBe(1);
    expect(contrastRatio(overWhite, WHITE)).toBeGreaterThan(3);
    expect(contrastRatio(overWhite, WHITE)).toBeLessThan(5);
  });
});

describe('presentation', () => {
  it('lists every format for one colour', () => {
    const rows = allFormats(parseColor('#ff0000'));
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['hex', 'rgb', 'hsl', 'hwb', 'oklch', 'cmyk']));
    expect(rows.find((r) => r.id === 'name')?.value).toBe('red');
  });

  it('only offers a CSS name for an exact, opaque match', () => {
    expect(nameForColor(parseColor('#ff0000'))).toBe('red');
    expect(nameForColor(parseColor('#ff0001'))).toBeNull();
    expect(nameForColor(parseColor('rgba(255,0,0,0.5)'))).toBeNull();
  });
});
