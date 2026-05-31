// Brand "shape & feel" presets (Token Model v2 brand-owned shape/rhythm/effect,
// docs/33). The Brand pane exposes these as a few approachable knobs rather than
// raw CSS lengths: Corners drives the three radii together, plus border weight,
// spacing rhythm, control size, and depth. They serialize into the brand
// `tokens` JSONB (shape/rhythm/effect branches) and compile through
// `compileThemeForTenant` exactly like the storefront does.
//
// Semantics: an UNSET knob (sentinel '') means "inherit the theme preset" — we
// omit that branch from the doc so the brand never silently pins a default. A
// set knob WINS over the preset (brand owns shape/rhythm/effect).

import type { BrandTokenDoc } from '@sparx/storefront-themes';

export type BrandTokens = Pick<BrandTokenDoc, 'shape' | 'rhythm' | 'effect'>;

export const UNSET = '';

// Corner roundness → the three radii at once (selector = pills/badges, field =
// inputs/buttons, box = cards/panels).
export const CORNER_OPTIONS = [
  { key: 'sharp', label: 'Sharp', selector: '0px', field: '0px', box: '0px' },
  { key: 'subtle', label: 'Subtle', selector: '0.25rem', field: '0.25rem', box: '0.375rem' },
  { key: 'rounded', label: 'Rounded', selector: '0.5rem', field: '0.5rem', box: '0.75rem' },
  { key: 'soft', label: 'Soft', selector: '0.75rem', field: '0.75rem', box: '1rem' },
  { key: 'pill', label: 'Pill', selector: '9999px', field: '0.75rem', box: '1.25rem' },
] as const;

export const BORDER_OPTIONS = [
  { key: '0px', label: 'None' },
  { key: '1px', label: 'Hairline' },
  { key: '1.5px', label: 'Thin' },
  { key: '2px', label: 'Bold' },
] as const;

export const SPACING_OPTIONS = [
  { key: '0.2rem', label: 'Compact' },
  { key: '0.25rem', label: 'Default' },
  { key: '0.3rem', label: 'Roomy' },
] as const;

// Control size → field (inputs/buttons) + selector (pills/toggles) heights.
export const SIZE_OPTIONS = [
  { key: 'sm', label: 'Small', field: '2.25rem', selector: '1.75rem' },
  { key: 'md', label: 'Default', field: '2.5rem', selector: '2rem' },
  { key: 'lg', label: 'Large', field: '2.75rem', selector: '2.25rem' },
] as const;

export const DEPTH_OPTIONS = [
  { key: '0', label: 'Flat', depth: 0 },
  { key: '0.5', label: 'Subtle', depth: 0.5 },
  { key: '1', label: 'Default', depth: 1 },
  { key: '1.5', label: 'Lifted', depth: 1.5 },
  { key: '2', label: 'Dramatic', depth: 2 },
] as const;

// Which Corners preset the stored radii currently match (else UNSET).
export function cornerKeyOf(tokens: BrandTokens): string {
  const s = tokens.shape;
  if (!s) return UNSET;
  const hit = CORNER_OPTIONS.find(
    (o) => o.selector === s.radiusSelector && o.field === s.radiusField && o.box === s.radiusBox
  );
  return hit?.key ?? UNSET;
}

// Which Control-size preset the stored sizes currently match (else UNSET).
export function sizeKeyOf(tokens: BrandTokens): string {
  const r = tokens.rhythm;
  if (!r) return UNSET;
  const hit = SIZE_OPTIONS.find((o) => o.field === r.sizeField && o.selector === r.sizeSelector);
  return hit?.key ?? UNSET;
}

// Resolved feel for the live board preview — brand value → a sensible default
// so a half-set brand never renders broken samples.
export interface ResolvedFeel {
  radiusSelector: string;
  radiusField: string;
  radiusBox: string;
  borderWidth: string;
  depth: number;
}

const DEFAULTS: ResolvedFeel = {
  radiusSelector: '9999px',
  radiusField: '0.5rem',
  radiusBox: '0.75rem',
  borderWidth: '1px',
  depth: 1,
};

export function resolveFeel(tokens: BrandTokens): ResolvedFeel {
  return {
    radiusSelector: tokens.shape?.radiusSelector ?? DEFAULTS.radiusSelector,
    radiusField: tokens.shape?.radiusField ?? DEFAULTS.radiusField,
    radiusBox: tokens.shape?.radiusBox ?? DEFAULTS.radiusBox,
    borderWidth: tokens.shape?.borderWidth ?? DEFAULTS.borderWidth,
    depth: tokens.effect?.depth ?? DEFAULTS.depth,
  };
}

// A box-shadow expressing the depth multiplier (mirrors the storefront's
// --sf-shadow-md scaling so the board reads like the real card shadow).
export function depthShadow(depth: number): string | undefined {
  if (depth <= 0) return undefined;
  return `0 4px 12px -2px rgb(0 0 0 / ${0.08 * depth}), 0 2px 6px -2px rgb(0 0 0 / ${0.05 * depth})`;
}

// Strip empty branches so an all-unset feel serializes to `null` (clears the
// column) rather than `{ shape:{}, rhythm:{}, effect:{} }`. Stamps `v: 2` so the
// result is a complete BrandTokenDoc the brand PATCH accepts.
export function cleanTokens(tokens: BrandTokens): BrandTokenDoc | null {
  const shape = pruned(tokens.shape);
  const rhythm = pruned(tokens.rhythm);
  const effect = tokens.effect?.depth != null ? tokens.effect : undefined;
  if (!shape && !rhythm && !effect) return null;
  return {
    v: 2,
    ...(shape ? { shape } : {}),
    ...(rhythm ? { rhythm } : {}),
    ...(effect ? { effect } : {}),
  };
}

function pruned<T extends Record<string, unknown>>(obj: T | undefined): T | undefined {
  if (!obj) return undefined;
  const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}
