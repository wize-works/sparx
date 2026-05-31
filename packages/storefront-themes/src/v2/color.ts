// Color math for Token Model v2 (docs/33-token-model-v2.md §4).
//
// Merchants store base colors as hex. The only derivation that MUST be computed
// at compile time (rather than expressed as a CSS color-mix) is the auto-contrast
// `-content` pair: picking a text/icon color that clears WCAG AA on an arbitrary
// merchant color can't be done reliably in pure CSS. Everything else (hover,
// active, tint) is emitted as a `color-mix(in oklab …)` expression by the CSS
// layer, so this module stays small: parse + relative luminance + contrast.

export interface Rgb {
  r: number; // 0–255
  g: number;
  b: number;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Normalize `#abc` / `ABCDEF` / `#aabbcc` → lowercase `#aabbcc`. Returns null
 *  for anything that isn't a 3- or 6-digit hex (callers fall back). */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = HEX_RE.exec(input.trim());
  if (!m?.[1]) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
  return `#${hex}`;
}

/** Parse a hex string to 0–255 RGB. Falls back to black for invalid input so
 *  derivation never throws on bad data (it's degraded, not crashed). */
export function hexToRgb(input: string): Rgb {
  const hex = normalizeHex(input) ?? '#000000';
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// sRGB channel (0–1) → linear-light value, per WCAG.
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two colors (1 → 21). Symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// The two inks `-content` derivation chooses between. Near-black (not pure
// #000) reads softer on light surfaces while still clearing AA.
export const CONTENT_LIGHT_INK = '#ffffff';
export const CONTENT_DARK_INK = '#0a0a0a';

/**
 * Auto-derive the `-content` color (text/icon) for a base surface: pick
 * whichever of near-white / near-black has the higher contrast. Deterministic,
 * server-safe, and always the more legible of the two — merchants can override
 * any `-content` slot explicitly (docs/33 §3.1, the full-parity escape hatch).
 */
export function deriveContent(
  base: string,
  lightInk: string = CONTENT_LIGHT_INK,
  darkInk: string = CONTENT_DARK_INK
): string {
  return contrastRatio(base, lightInk) >= contrastRatio(base, darkInk) ? lightInk : darkInk;
}
