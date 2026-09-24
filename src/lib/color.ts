/**
 * Colour parsing, conversion and contrast maths.
 *
 * sRGB is the hub: everything parses into `Rgb` and every formatter converts
 * out of it, so N formats need 2N conversions instead of N².
 *
 * The OKLCH path is the real work. OKLab is not a tweak of HSL — going there
 * means undoing the sRGB transfer function, moving through a cone-response
 * space, applying a cube root and then a second matrix. Approximating it (the
 * usual shortcut is to reuse HSL's hue) produces numbers that look plausible
 * and are wrong by tens of units, which defeats the point of a perceptual
 * space. The matrices below are Björn Ottosson's published OKLab constants.
 *
 * DOM-free and dependency-free so it can be unit-tested in Node.
 */

export interface Rgb {
  /** 0–255. Kept unrounded internally so round trips do not drift. */
  r: number;
  g: number;
  b: number;
  /** 0–1. */
  a: number;
}

export interface Hsl {
  /** Degrees, 0–360. */
  h: number;
  /** Percent, 0–100. */
  s: number;
  l: number;
  a: number;
}

export interface Hwb {
  h: number;
  /** Whiteness, percent. */
  w: number;
  /** Blackness, percent. */
  b: number;
  a: number;
}

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  l: number;
  /** Chroma. Unbounded in theory; sRGB tops out near 0.37. */
  c: number;
  /** Hue angle in degrees, 0–360. */
  h: number;
  a: number;
}

export interface Cmyk {
  /** All four 0–100. */
  c: number;
  m: number;
  y: number;
  k: number;
  a: number;
}

export class ColorParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ColorParseError';
  }
}

const clamp = (n: number, min = 0, max = 1) => (n < min ? min : n > max ? max : n);
const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Round to `places` and drop trailing zeros, so 50.00 prints as 50. */
function num(value: number, places = 2): string {
  const rounded = Number(value.toFixed(places));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

// ─── Named colours ────────────────────────────────────────────────────────

/** The CSS Color 4 named colours, plus `transparent`. */
export const NAMED_COLORS: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4',
  azure: 'f0ffff', beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000',
  blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a',
  burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00', chocolate: 'd2691e',
  coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c',
  cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b',
  darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b',
  darkmagenta: '8b008b', darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc',
  darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f', darkslateblue: '483d8b',
  darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3',
  deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969',
  dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22',
  fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700',
  goldenrod: 'daa520', gray: '808080', green: '008000', greenyellow: 'adff2f',
  grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c',
  indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa',
  lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6',
  lightcoral: 'f08080', lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3',
  lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1', lightsalmon: 'ffa07a',
  lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899',
  lightsteelblue: 'b0c4de', lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32',
  linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa',
  mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db', mediumseagreen: '3cb371',
  mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc',
  mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1',
  moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6',
  olive: '808000', olivedrab: '6b8e23', orange: 'ffa500', orangered: 'ff4500',
  orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee',
  palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f',
  pink: 'ffc0cb', plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080',
  rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1',
  saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57',
  seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb',
  slateblue: '6a5acd', slategray: '708090', slategrey: '708090', snow: 'fffafa',
  springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080',
  thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee',
  wheat: 'f5deb3', white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00',
  yellowgreen: '9acd32',
};

/** The CSS keyword for an exact match, or null. Alpha must be opaque. */
export function nameForColor(rgb: Rgb): string | null {
  if (rgb.a < 1) return null;
  const hex = rgbToHex(rgb, false).slice(1);
  for (const [name, value] of Object.entries(NAMED_COLORS)) {
    if (value === hex) return name;
  }
  return null;
}

// ─── Parsing ──────────────────────────────────────────────────────────────

/** Split the inside of a functional notation on commas, spaces and the alpha slash. */
function splitArgs(body: string): { parts: string[]; alpha: string | null } {
  const [main, alphaPart] = body.split('/');
  const parts = main!.trim().split(/[\s,]+/).filter(Boolean);
  return { parts, alpha: alphaPart?.trim() ?? null };
}

/** A component that may be a number or a percentage of `full`. */
function component(token: string | undefined, full: number, label: string): number {
  if (token === undefined) throw new ColorParseError(`The ${label} value is missing.`);
  if (token === 'none') return 0; // CSS Color 4 allows `none`; it behaves as 0 here.
  const m = /^([+-]?(?:\d*\.\d+|\d+))(%?)$/.exec(token);
  if (!m) throw new ColorParseError(`"${token}" is not a valid ${label} value.`);
  const value = Number(m[1]);
  return m[2] === '%' ? (value / 100) * full : value;
}

/** Alpha accepts 0–1 or a percentage. Missing means fully opaque. */
function alphaValue(token: string | null): number {
  if (token === null || token === '' || token === 'none') return 1;
  const m = /^([+-]?(?:\d*\.\d+|\d+))(%?)$/.exec(token);
  if (!m) throw new ColorParseError(`"${token}" is not a valid alpha value. Use 0–1 or a percentage.`);
  return clamp(m[2] === '%' ? Number(m[1]) / 100 : Number(m[1]));
}

/** Hue accepts deg, rad, grad and turn, matching CSS. */
function hueValue(token: string | undefined): number {
  if (token === undefined) throw new ColorParseError('The hue value is missing.');
  if (token === 'none') return 0;
  const m = /^([+-]?(?:\d*\.\d+|\d+))(deg|rad|grad|turn)?$/.exec(token);
  if (!m) throw new ColorParseError(`"${token}" is not a valid hue angle.`);
  const value = Number(m[1]);
  switch (m[2]) {
    case 'rad':
      return mod360((value * 180) / Math.PI);
    case 'grad':
      return mod360(value * 0.9);
    case 'turn':
      return mod360(value * 360);
    default:
      return mod360(value);
  }
}

function parseHex(text: string): Rgb {
  const hex = text.replace(/^#/, '');
  if (!/^[0-9a-f]+$/i.test(hex)) {
    const bad = [...hex].find((c) => !/[0-9a-f]/i.test(c));
    throw new ColorParseError(
      `"${bad}" is not a hex digit. Hex colours use 0–9 and a–f only.`,
    );
  }
  const expand = (s: string) => Number.parseInt(s.length === 1 ? s + s : s, 16);

  switch (hex.length) {
    case 3:
      return { r: expand(hex[0]!), g: expand(hex[1]!), b: expand(hex[2]!), a: 1 };
    case 4:
      return {
        r: expand(hex[0]!),
        g: expand(hex[1]!),
        b: expand(hex[2]!),
        a: expand(hex[3]!) / 255,
      };
    case 6:
      return {
        r: expand(hex.slice(0, 2)),
        g: expand(hex.slice(2, 4)),
        b: expand(hex.slice(4, 6)),
        a: 1,
      };
    case 8:
      return {
        r: expand(hex.slice(0, 2)),
        g: expand(hex.slice(2, 4)),
        b: expand(hex.slice(4, 6)),
        a: expand(hex.slice(6, 8)) / 255,
      };
    default:
      throw new ColorParseError(
        `A hex colour needs 3, 4, 6 or 8 digits — this one has ${hex.length}. ` +
          `Four and eight digits carry alpha in the last digit or pair.`,
      );
  }
}

/**
 * Parse any supported notation into sRGB.
 *
 * Accepts hex (3/4/6/8 digits, with or without `#`), `rgb()`/`rgba()`,
 * `hsl()`/`hsla()`, `hwb()`, `oklch()`, `cmyk()`/`device-cmyk()` and the CSS
 * colour keywords — in both the legacy comma syntax and the modern
 * space-separated syntax with a `/ alpha` component.
 */
export function parseColor(input: string): Rgb {
  const text = input.trim();
  if (!text) throw new ColorParseError('Enter a colour to convert.');

  const lower = text.toLowerCase();

  if (lower === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED_COLORS[lower]) return parseHex(NAMED_COLORS[lower]!);

  const fn = /^([a-z-]+)\s*\(([\s\S]*)\)$/.exec(lower);
  if (!fn) {
    // A leading # can only ever be hex, so let parseHex explain what is wrong.
    if (lower.startsWith('#') || /^[0-9a-f]+$/.test(lower)) return parseHex(lower);
    if (/^[a-z]+$/.test(lower)) {
      throw new ColorParseError(
        `"${text}" is not a CSS colour keyword. Try a hex value such as #4f46e5, or rgb(), hsl(), hwb(), oklch() or cmyk().`,
      );
    }
    throw new ColorParseError(
      `Could not read "${text}". Supported formats are hex, rgb(), hsl(), hwb(), oklch(), cmyk() and CSS colour names.`,
    );
  }

  const name = fn[1]!;
  const { parts, alpha } = splitArgs(fn[2]!);
  // Legacy comma syntax puts alpha in the slot after the colour components;
  // modern syntax puts it after a "/". CMYK has four components, not three,
  // so its fourth value is the key plate rather than an alpha.
  const components = name === 'cmyk' || name === 'device-cmyk' ? 4 : 3;
  const legacyAlpha = alpha === null && parts.length > components ? parts[components]! : null;
  const a = alphaValue(alpha ?? legacyAlpha);

  switch (name) {
    case 'rgb':
    case 'rgba': {
      return {
        r: clamp(component(parts[0], 255, 'red'), 0, 255),
        g: clamp(component(parts[1], 255, 'green'), 0, 255),
        b: clamp(component(parts[2], 255, 'blue'), 0, 255),
        a,
      };
    }
    case 'hsl':
    case 'hsla': {
      return hslToRgb({
        h: hueValue(parts[0]),
        s: clamp(component(parts[1], 100, 'saturation'), 0, 100),
        l: clamp(component(parts[2], 100, 'lightness'), 0, 100),
        a,
      });
    }
    case 'hwb': {
      return hwbToRgb({
        h: hueValue(parts[0]),
        w: clamp(component(parts[1], 100, 'whiteness'), 0, 100),
        b: clamp(component(parts[2], 100, 'blackness'), 0, 100),
        a,
      });
    }
    case 'oklch': {
      // L accepts 0–1 or a percentage; chroma's 100% is 0.4 per CSS Color 4.
      return oklchToRgb({
        l: clamp(component(parts[0], 1, 'lightness')),
        c: Math.max(0, component(parts[1], 0.4, 'chroma')),
        h: hueValue(parts[2]),
        a,
      });
    }
    case 'cmyk':
    case 'device-cmyk': {
      return cmykToRgb({
        c: clamp(component(parts[0], 100, 'cyan'), 0, 100),
        m: clamp(component(parts[1], 100, 'magenta'), 0, 100),
        y: clamp(component(parts[2], 100, 'yellow'), 0, 100),
        k: clamp(component(parts[3], 100, 'key'), 0, 100),
        a,
      });
    }
    case 'lab':
    case 'lch':
    case 'oklab':
    case 'color':
      throw new ColorParseError(
        `${name}() is a valid CSS colour function but is not one of the formats this tool converts. Supported: hex, rgb, hsl, hwb, oklch and cmyk.`,
      );
    default:
      throw new ColorParseError(`"${name}()" is not a colour function this tool recognises.`);
  }
}

/** Parse without throwing, for live typing where an error every keystroke is noise. */
export function tryParseColor(input: string): Rgb | null {
  try {
    return parseColor(input);
  } catch {
    return null;
  }
}

// ─── sRGB ↔ HSL ───────────────────────────────────────────────────────────

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = mod360(h * 60);
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100, a: rgb.a };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const h = mod360(hsl.h);
  const s = clamp(hsl.s / 100);
  const l = clamp(hsl.l / 100);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a: hsl.a };
}

// ─── sRGB ↔ HWB ───────────────────────────────────────────────────────────

export function rgbToHwb(rgb: Rgb): Hwb {
  const { h } = rgbToHsl(rgb);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  return {
    h,
    w: Math.min(r, g, b) * 100,
    b: (1 - Math.max(r, g, b)) * 100,
    a: rgb.a,
  };
}

export function hwbToRgb(hwb: Hwb): Rgb {
  let w = clamp(hwb.w / 100);
  let b = clamp(hwb.b / 100);

  // Whiteness and blackness that sum past 1 describe a grey; CSS Color 4
  // normalises them rather than rejecting them.
  if (w + b >= 1) {
    const grey = (w / (w + b)) * 255;
    return { r: grey, g: grey, b: grey, a: hwb.a };
  }

  const base = hslToRgb({ h: hwb.h, s: 100, l: 50, a: 1 });
  const mix = (channel: number) => (channel / 255) * (1 - w - b) * 255 + w * 255;
  return { r: mix(base.r), g: mix(base.g), b: mix(base.b), a: hwb.a };
}

// ─── sRGB ↔ OKLCH ─────────────────────────────────────────────────────────

/** Undo the sRGB transfer function: gamma-encoded 0–1 to linear-light 0–1. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Re-apply the sRGB transfer function. */
export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export interface Oklab {
  l: number;
  a: number;
  b: number;
}

/** Linear sRGB → OKLab, via the LMS cone responses and a cube root. */
export function linearSrgbToOklab(r: number, g: number, b: number): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab → linear sRGB. The exact inverse of the matrices above. */
export function oklabToLinearSrgb(lab: Oklab): { r: number; g: number; b: number } {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const lab = linearSrgbToOklab(
    srgbToLinear(rgb.r / 255),
    srgbToLinear(rgb.g / 255),
    srgbToLinear(rgb.b / 255),
  );
  const c = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  // A neutral colour has no meaningful hue; report 0 rather than atan2 noise.
  const h = c < 1e-7 ? 0 : mod360((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
  return { l: lab.l, c, h, a: rgb.a };
}

export function oklchToRgb(oklch: Oklch): Rgb {
  const rad = (oklch.h * Math.PI) / 180;
  const linear = oklabToLinearSrgb({
    l: oklch.l,
    a: Math.cos(rad) * oklch.c,
    b: Math.sin(rad) * oklch.c,
  });
  return {
    r: clamp(linearToSrgb(linear.r)) * 255,
    g: clamp(linearToSrgb(linear.g)) * 255,
    b: clamp(linearToSrgb(linear.b)) * 255,
    a: oklch.a,
  };
}

/**
 * True when an OKLCH colour falls outside sRGB — which most vivid OKLCH values
 * do, since the space covers far more than a monitor can show. The converters
 * clamp, so this is how a caller learns that clamping happened.
 */
export function isOutOfSrgbGamut(oklch: Oklch, tolerance = 0.0005): boolean {
  const rad = (oklch.h * Math.PI) / 180;
  const linear = oklabToLinearSrgb({
    l: oklch.l,
    a: Math.cos(rad) * oklch.c,
    b: Math.sin(rad) * oklch.c,
  });
  return [linear.r, linear.g, linear.b].some(
    (channel) => channel < -tolerance || channel > 1 + tolerance,
  );
}

// ─── sRGB ↔ CMYK ──────────────────────────────────────────────────────────

/**
 * The naive device-independent conversion. It is what every web tool uses and
 * what `device-cmyk()` describes, but it is not colour management: real print
 * output depends on an ICC profile for the specific press, ink and stock.
 */
export function rgbToCmyk(rgb: Rgb): Cmyk {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);

  if (k === 1) return { c: 0, m: 0, y: 0, k: 100, a: rgb.a };

  return {
    c: ((1 - r - k) / (1 - k)) * 100,
    m: ((1 - g - k) / (1 - k)) * 100,
    y: ((1 - b - k) / (1 - k)) * 100,
    k: k * 100,
    a: rgb.a,
  };
}

export function cmykToRgb(cmyk: Cmyk): Rgb {
  const c = clamp(cmyk.c / 100);
  const m = clamp(cmyk.m / 100);
  const y = clamp(cmyk.y / 100);
  const k = clamp(cmyk.k / 100);
  return {
    r: 255 * (1 - c) * (1 - k),
    g: 255 * (1 - m) * (1 - k),
    b: 255 * (1 - y) * (1 - k),
    a: cmyk.a,
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────

const byte = (n: number) => Math.round(clamp(n, 0, 255));
const hexPair = (n: number) => byte(n).toString(16).padStart(2, '0');

/** `#rrggbb`, or `#rrggbbaa` when `withAlpha` and the colour is translucent. */
export function rgbToHex(rgb: Rgb, withAlpha = rgb.a < 1): string {
  const base = `#${hexPair(rgb.r)}${hexPair(rgb.g)}${hexPair(rgb.b)}`;
  return withAlpha ? `${base}${hexPair(rgb.a * 255)}` : base;
}

export function formatRgb(rgb: Rgb): string {
  const parts = `${byte(rgb.r)}, ${byte(rgb.g)}, ${byte(rgb.b)}`;
  return rgb.a < 1 ? `rgba(${parts}, ${num(rgb.a, 3)})` : `rgb(${parts})`;
}

export function formatHsl(rgb: Rgb): string {
  const hsl = rgbToHsl(rgb);
  const parts = `${num(hsl.h, 1)}, ${num(hsl.s, 1)}%, ${num(hsl.l, 1)}%`;
  return rgb.a < 1 ? `hsla(${parts}, ${num(rgb.a, 3)})` : `hsl(${parts})`;
}

export function formatHwb(rgb: Rgb): string {
  const hwb = rgbToHwb(rgb);
  const parts = `${num(hwb.h, 1)} ${num(hwb.w, 1)}% ${num(hwb.b, 1)}%`;
  return rgb.a < 1 ? `hwb(${parts} / ${num(rgb.a, 3)})` : `hwb(${parts})`;
}

export function formatOklch(rgb: Rgb): string {
  const ok = rgbToOklch(rgb);
  const parts = `${num(ok.l, 4)} ${num(ok.c, 4)} ${num(ok.h, 2)}`;
  return rgb.a < 1 ? `oklch(${parts} / ${num(rgb.a, 3)})` : `oklch(${parts})`;
}

export function formatCmyk(rgb: Rgb): string {
  const cmyk = rgbToCmyk(rgb);
  return `cmyk(${num(cmyk.c, 1)}%, ${num(cmyk.m, 1)}%, ${num(cmyk.y, 1)}%, ${num(cmyk.k, 1)}%)`;
}

export interface FormattedColor {
  id: string;
  label: string;
  value: string;
  /** A short caveat shown under the value, where one is warranted. */
  note?: string;
}

/** Every supported representation of one colour, for the results table. */
export function allFormats(rgb: Rgb): FormattedColor[] {
  const name = nameForColor(rgb);
  const rows: FormattedColor[] = [
    { id: 'hex', label: 'HEX', value: rgbToHex(rgb, false) },
    {
      id: 'hexa',
      label: 'HEX + alpha',
      value: rgbToHex(rgb, true),
      note: 'Eight-digit hex. Supported everywhere except Internet Explorer.',
    },
    { id: 'rgb', label: 'RGB', value: formatRgb(rgb) },
    { id: 'hsl', label: 'HSL', value: formatHsl(rgb) },
    {
      id: 'hwb',
      label: 'HWB',
      value: formatHwb(rgb),
      note: 'Hue plus whiteness and blackness — easier to reason about for tints and shades.',
    },
    {
      id: 'oklch',
      label: 'OKLCH',
      value: formatOklch(rgb),
      note: 'Perceptually uniform: equal lightness steps look equal.',
    },
    {
      id: 'cmyk',
      label: 'CMYK',
      value: formatCmyk(rgb),
      note: 'Unmanaged conversion. A print shop will want an ICC profile, not this.',
    },
  ];
  if (name) {
    rows.push({ id: 'name', label: 'CSS name', value: name });
  }
  return rows;
}

// ─── WCAG contrast ────────────────────────────────────────────────────────

/**
 * Relative luminance, WCAG 2.2 definition: linearise each channel, then weight
 * by how much the eye contributes each one — green carries 72% of perceived
 * brightness, blue barely 7%.
 */
export function relativeLuminance(rgb: Rgb): number {
  const r = srgbToLinear(clamp(rgb.r / 255));
  const g = srgbToLinear(clamp(rgb.g / 255));
  const b = srgbToLinear(clamp(rgb.b / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio, 1:1 to 21:1. The 0.05 offsets model ambient screen flare,
 * which is why pure black on pure white is 21 and not infinite.
 *
 * Alpha is ignored: a translucent colour has no defined luminance until it is
 * composited, so callers should flatten against the real backdrop first.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite a translucent colour over an opaque backdrop. */
export function flattenOver(color: Rgb, backdrop: Rgb): Rgb {
  const a = clamp(color.a);
  return {
    r: color.r * a + backdrop.r * (1 - a),
    g: color.g * a + backdrop.g * (1 - a),
    b: color.b * a + backdrop.b * (1 - a),
    a: 1,
  };
}

export interface WcagAssessment {
  ratio: number;
  /** 4.5:1 — body text below 18.66px, or below 14px when bold. */
  aaNormal: boolean;
  /** 3:1 — text at 18.66px+, or 14px+ bold. */
  aaLarge: boolean;
  /** 7:1 */
  aaaNormal: boolean;
  /** 4.5:1 */
  aaaLarge: boolean;
  /** 3:1 — icons, form borders, focus rings (WCAG 1.4.11). */
  uiComponents: boolean;
}

export function assessContrast(foreground: Rgb, background: Rgb): WcagAssessment {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    uiComponents: ratio >= 3,
  };
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };
export const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 };

/** Display form of a ratio, e.g. "4.62:1". */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

export const SAMPLE_COLOR = '#4f46e5';
