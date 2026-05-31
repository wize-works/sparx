// Preview-only helpers shared by the brand surfaces (the board + the contrast
// readout). None of this is stored: an unset brand color falls back to the
// active theme at render time, but the editor still needs *something* to draw so
// the board never looks broken and the contrast badge has a pair to rate. The
// fallbacks mirror the Sparx defaults (indigo / white / sky); keep them here as
// the single source so the board and the form can't drift apart.

export const BRAND_PREVIEW_FALLBACK = {
  primary: '#6366f1',
  primaryForeground: '#ffffff',
  accent: '#0ea5e9',
  heading: 'Geist',
  body: 'Inter',
} as const;

// A font *name* → a preview-safe family stack (the editor doesn't load the
// webfont; this is just so the specimen renders in something close).
export function fontStack(name: string | null, fallbackName: string): string {
  const clean = (name ?? fallbackName).replace(/['"]/g, '').trim() || fallbackName;
  return `"${clean}", ui-sans-serif, system-ui, sans-serif`;
}

// ── WCAG contrast ────────────────────────────────────────────────────────────
// A brand tool is the one place that owes the merchant a contrast check: the
// primary / on-primary pair set here renders on every storefront and email
// button. We rate it inline so an unreadable pair can never ship silently.

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1–21) between two hex colors, or null if either can't
 *  be parsed (e.g. an unset field). */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastRating = 'AAA' | 'AA' | 'AA Large' | 'Fail';

/** Rate a ratio against WCAG thresholds for normal-size text. */
export function rateContrast(ratio: number): ContrastRating {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}
