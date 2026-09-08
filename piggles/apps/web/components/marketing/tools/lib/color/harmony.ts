import { clamp, hslToRgb, rgbToHsl, type Rgb } from './convert';

export type HarmonyKind =
  'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'monochromatic' | 'random';

export const HARMONY_LABELS: Record<HarmonyKind, { label: string; blurb: string }> = {
  complementary: {
    label: 'Opposites',
    blurb:
      'Two colors from opposite sides of the wheel. High energy — good when one thing needs to stand out against everything else.',
  },
  analogous: {
    label: 'Neighbours',
    blurb:
      'Colors that sit beside each other. Calm and unmistakably related — good for backgrounds and large areas.',
  },
  triadic: {
    label: 'Three-way',
    blurb:
      'Three colors spread evenly around the wheel. Lively without clashing, and enough range for a whole brand.',
  },
  tetradic: {
    label: 'Four-way',
    blurb:
      'Two pairs of opposites. The most range on offer, and the easiest to overdo — pick one to lead and keep the rest quiet.',
  },
  monochromatic: {
    label: 'One color',
    blurb:
      'A single hue at different strengths. Impossible to get wrong, and the safest choice when the photography is doing the talking.',
  },
  random: {
    label: 'Surprise me',
    blurb:
      'Five colors picked at random, kept within a readable range. For when you have been staring at the same pink for an hour.',
  },
};

const OFFSETS: Record<Exclude<HarmonyKind, 'random' | 'monochromatic'>, number[]> = {
  complementary: [0, 180, 30, 210, 150],
  analogous: [0, 30, -30, 60, -60],
  triadic: [0, 120, 240, 60, 180],
  tetradic: [0, 90, 180, 270, 45],
};

/**
 * Lightness spread across the five, and it has to be WIDE.
 *
 * The obvious version nudges each color ±8 from the base, which produces five
 * swatches at nearly the same lightness — technically a harmony, and useless: a
 * palette needs something dark enough for text and something pale enough for a
 * background, and five mid-tones give you neither. It also reads as flat, because
 * the eye separates colors by lightness before it separates them by hue.
 */
const LIGHTNESS = [0, -22, 14, -11, 24];
const SATURATION = [0, -6, -14, 6, -20];

/** Five colors built from a base. Always five, so the UI never reflows when
 *  somebody switches harmony — a grid that changes length as you flick between
 *  options makes comparing them much harder than it needs to be. */
export function harmony(base: Rgb, kind: HarmonyKind, seed = 0): Rgb[] {
  const hsl = rgbToHsl(base);

  if (kind === 'monochromatic') {
    return [hsl.l, 82, 64, 46, 28].map((l, i) =>
      hslToRgb({ h: hsl.h, s: clamp(hsl.s - i * 4, 12, 100), l: i === 0 ? hsl.l : l })
    );
  }

  if (kind === 'random') {
    // Deterministic from the seed so "shuffle" is repeatable within a session
    // and the locked swatches genuinely stay put. A plain Math.random() here
    // re-rolls every locked color on each render.
    return Array.from({ length: 5 }, (_, i) => {
      const n = Math.sin(seed * 97.13 + i * 41.7) * 43758.5453;
      const frac = n - Math.floor(n);
      const n2 = Math.sin(seed * 13.7 + i * 91.3) * 21301.717;
      const frac2 = n2 - Math.floor(n2);
      return hslToRgb({
        h: Math.floor(frac * 360),
        s: 45 + Math.floor(frac2 * 45),
        l: 38 + Math.floor(((frac + frac2) / 2) * 32),
      });
    });
  }

  return OFFSETS[kind].map((offset, i) =>
    hslToRgb({
      h: hsl.h + offset,
      s: clamp(hsl.s + SATURATION[i]!, 18, 100),
      l: i === 0 ? hsl.l : clamp(hsl.l + LIGHTNESS[i]!, 20, 82),
    })
  );
}
