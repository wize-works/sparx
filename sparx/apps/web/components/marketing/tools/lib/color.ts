/**
 * Color primitives shared by the palette generator and the contrast checker:
 * hex parsing, a tint/shade ramp (50–950 with the base anchored at 500), and
 * the WCAG relative-luminance + contrast-ratio math.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(input: string): Rgb | null {
  let v = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(v)) return null;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const h = (c: number) =>
    Math.round(Math.min(255, Math.max(0, c)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function mix(color: Rgb, target: number, amount: number): Rgb {
  const ch = (c: number) => c + (target - c) * amount;
  return { r: ch(color.r), g: ch(color.g), b: ch(color.b) };
}

export interface Swatch {
  step: number;
  hex: string;
}

// Per-step mix toward white (tints) or black (shades); 500 is the base color.
const RAMP: { step: number; to: number; amount: number }[] = [
  { step: 50, to: 255, amount: 0.95 },
  { step: 100, to: 255, amount: 0.9 },
  { step: 200, to: 255, amount: 0.75 },
  { step: 300, to: 255, amount: 0.6 },
  { step: 400, to: 255, amount: 0.3 },
  { step: 500, to: 0, amount: 0 },
  { step: 600, to: 0, amount: 0.13 },
  { step: 700, to: 0, amount: 0.28 },
  { step: 800, to: 0, amount: 0.42 },
  { step: 900, to: 0, amount: 0.56 },
  { step: 950, to: 0, amount: 0.68 },
];

/** Build a 50–950 tint/shade scale from a base hex, base anchored at 500. */
export function buildPalette(baseHex: string): Swatch[] {
  const base = parseHex(baseHex);
  if (!base) return [];
  return RAMP.map(({ step, to, amount }) => ({
    step,
    hex: rgbToHex(amount === 0 ? base : mix(base, to, amount)),
  }));
}

export function relativeLuminance(rgb: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG contrast ratio (1–21) between two hex colors, or null if unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return null;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastRating {
  ratio: number;
  normalAA: boolean;
  normalAAA: boolean;
  largeAA: boolean;
  largeAAA: boolean;
}

export function rateContrast(ratio: number): ContrastRating {
  return {
    ratio,
    normalAA: ratio >= 4.5,
    normalAAA: ratio >= 7,
    largeAA: ratio >= 3,
    largeAAA: ratio >= 4.5,
  };
}

/** Pick black or white text for best contrast on a given background. */
export function readableTextOn(bgHex: string): '#000000' | '#FFFFFF' {
  const onWhite = contrastRatio(bgHex, '#FFFFFF') ?? 1;
  const onBlack = contrastRatio(bgHex, '#000000') ?? 1;
  return onBlack >= onWhite ? '#000000' : '#FFFFFF';
}

/* ------------------------------------------------------------------ *
 * HSL + color-wheel harmonies
 *
 * The palette generator builds matching accent colors by rotating the
 * base hue around the wheel (complementary/triadic/etc.) or stepping its
 * lightness (monochromatic). That needs HSL, so we convert to/from it
 * here and keep the harmony schemes data-driven.
 * ------------------------------------------------------------------ */

export interface Hsl {
  /** 0–360 */ h: number;
  /** 0–1 */ s: number;
  /** 0–1 */ l: number;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}

export type HarmonyKind =
  'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'monochromatic' | 'random';

export const HARMONY_KINDS: { value: HarmonyKind; label: string }[] = [
  { value: 'complementary', label: 'Complementary' },
  { value: 'analogous', label: 'Analogous' },
  { value: 'triadic', label: 'Triadic' },
  { value: 'tetradic', label: 'Tetradic' },
  { value: 'monochromatic', label: 'Monochromatic' },
  { value: 'random', label: 'Random (anything goes)' },
];

// Ordered hue rotations (degrees) per scheme; we take the first `count`. Exported
// so the shuffle generator can jitter around the same anchor offsets.
export const HARMONY_HUE_OFFSETS: Record<
  Exclude<HarmonyKind, 'monochromatic' | 'random'>,
  number[]
> = {
  complementary: [180, 30, 330, 210],
  analogous: [30, 330, 60, 300],
  triadic: [120, 240, 60, 300],
  tetradic: [180, 60, 240, 120],
};

// Monochromatic steps the base lightness instead of rotating hue.
export const HARMONY_MONO_LIGHTNESS = [0.16, -0.16, 0.3, -0.3];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A named color in a generated palette (one primary + up to four accents). */
export interface PaletteColor {
  role: string;
  hex: string;
}

/**
 * Generate `count` (1–4) accent colors that harmonise with `baseHex` using a
 * classic color-wheel scheme. Hue schemes rotate the base hue by fixed
 * offsets; monochromatic keeps the hue and steps the lightness. The base color
 * is the primary and is NOT included in the returned accents.
 */
export function buildHarmony(
  baseHex: string,
  kind: Exclude<HarmonyKind, 'random'>,
  count: number
): string[] {
  const hsl = hexToHsl(baseHex);
  if (!hsl) return [];
  const n = Math.min(4, Math.max(1, Math.round(count)));
  if (kind === 'monochromatic') {
    return HARMONY_MONO_LIGHTNESS.slice(0, n).map((d) =>
      hslToHex({ h: hsl.h, s: hsl.s, l: clamp01(hsl.l + d) })
    );
  }
  return HARMONY_HUE_OFFSETS[kind]
    .slice(0, n)
    .map((offset) => hslToHex({ h: (hsl.h + offset) % 360, s: hsl.s, l: hsl.l }));
}
