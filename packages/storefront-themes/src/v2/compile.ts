// Token Model v2 compiler (docs/33-token-model-v2.md §5.3).
//
// compileTokensV2 layers a brand doc + presentation overlay over a preset's
// defaults to produce a complete { shared, light, dark } token set. Resolution:
//   • shared   : preset ← brand (brand owns type/shape/rhythm/effect);
//                containerWidth is presentation-owned, so preset ← presentation.
//   • per-mode : brand identity (primary/secondary/accent) wins; presentation
//                (surfaces/neutral/status/border) wins for its slots.
//   • `-content`: explicit (brand/preset/overlay) wins, else auto-derived.
//
// The SAME function feeds both the storefront chrome read path and the Site
// Builder published snapshot, so the two can never drift. Because a preset
// always supplies every slot, the output is complete even for a tenant with no
// brand doc and no overlay — which is what makes dropping the legacy
// StorefrontTheme columns safe (decision #3's dependency).

import { deriveContent, normalizeHex } from './color';
import type {
  BrandTokenDoc,
  ColorTokensV2,
  CompiledColorTokensV2,
  CompiledThemeV2,
  PresentationColorOverlay,
  PresentationOverlayV2,
  SharedTokensV2,
  ThemePresetV2,
} from './types';

export interface CompileV2Options {
  brand?: BrandTokenDoc | null;
  presentation?: PresentationOverlayV2 | null;
}

// First value that is neither null/undefined nor an empty string. Written
// explicitly (not `??`) so an empty-string override counts as "absent" and
// falls through to the next source.
function pick(...vals: (string | null | undefined)[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return undefined;
}

// An explicit color slot, normalized to hex (or the raw string if it isn't hex,
// e.g. a CSS keyword), or undefined when no source supplied one.
function optColor(...vals: (string | null | undefined)[]): string | undefined {
  const v = pick(...vals);
  if (v == null) return undefined;
  return normalizeHex(v) ?? v;
}

// A required color slot — never empty (degrades to black on bad data so
// derivation never throws).
function color(...vals: (string | null | undefined)[]): string {
  return optColor(...vals) ?? '#000000';
}

function resolveShared(
  preset: SharedTokensV2,
  brand: BrandTokenDoc | null | undefined,
  presentation: PresentationOverlayV2 | null | undefined
): SharedTokensV2 {
  const depth = brand?.effect?.depth;
  return {
    fontHeading: pick(brand?.type?.heading, preset.fontHeading) ?? preset.fontHeading,
    fontBody: pick(brand?.type?.body, preset.fontBody) ?? preset.fontBody,
    radiusSelector:
      pick(brand?.shape?.radiusSelector, preset.radiusSelector) ?? preset.radiusSelector,
    radiusField: pick(brand?.shape?.radiusField, preset.radiusField) ?? preset.radiusField,
    radiusBox: pick(brand?.shape?.radiusBox, preset.radiusBox) ?? preset.radiusBox,
    borderWidth: pick(brand?.shape?.borderWidth, preset.borderWidth) ?? preset.borderWidth,
    spaceBase: pick(brand?.rhythm?.spaceBase, preset.spaceBase) ?? preset.spaceBase,
    sizeField: pick(brand?.rhythm?.sizeField, preset.sizeField) ?? preset.sizeField,
    sizeSelector: pick(brand?.rhythm?.sizeSelector, preset.sizeSelector) ?? preset.sizeSelector,
    depth: typeof depth === 'number' ? depth : preset.depth,
    containerWidth:
      pick(presentation?.containerWidth, preset.containerWidth) ?? preset.containerWidth,
  };
}

function resolveColors(
  base: ColorTokensV2,
  brand: BrandTokenDoc | null | undefined,
  overlay: PresentationColorOverlay | null | undefined
): CompiledColorTokensV2 {
  const bc = brand?.color;

  // Surfaces + line (presentation-owned).
  const base100 = color(overlay?.base100, base.base100);
  const base200 = color(overlay?.base200, base.base200);
  const base300 = color(overlay?.base300, base.base300);
  const baseContent = color(overlay?.baseContent, base.baseContent);
  const border = color(overlay?.border, base.border);

  // Brand identity (brand wins). Secondary falls back to primary if a preset
  // never defines it (docs/33 §3.1).
  const primary = color(bc?.primary, base.primary);
  const secondary = color(bc?.secondary, base.secondary, primary);
  const accent = color(bc?.accent, base.accent);

  // UI + status (presentation-owned).
  const neutral = color(overlay?.neutral, base.neutral);
  const info = color(overlay?.info, base.info);
  const success = color(overlay?.success, base.success);
  const warning = color(overlay?.warning, base.warning);
  const danger = color(overlay?.danger, base.danger);

  // `-content`: explicit wins (brand for identity, overlay/preset elsewhere),
  // else auto-derive for AA legibility.
  return {
    base100,
    base200,
    base300,
    baseContent,
    primary,
    primaryContent: optColor(bc?.primaryContent, base.primaryContent) ?? deriveContent(primary),
    secondary,
    secondaryContent:
      optColor(bc?.secondaryContent, base.secondaryContent) ?? deriveContent(secondary),
    accent,
    accentContent: optColor(bc?.accentContent, base.accentContent) ?? deriveContent(accent),
    neutral,
    neutralContent:
      optColor(overlay?.neutralContent, base.neutralContent) ?? deriveContent(neutral),
    info,
    infoContent: optColor(overlay?.infoContent, base.infoContent) ?? deriveContent(info),
    success,
    successContent:
      optColor(overlay?.successContent, base.successContent) ?? deriveContent(success),
    warning,
    warningContent:
      optColor(overlay?.warningContent, base.warningContent) ?? deriveContent(warning),
    danger,
    dangerContent: optColor(overlay?.dangerContent, base.dangerContent) ?? deriveContent(danger),
    border,
  };
}

/**
 * Compile a preset + optional brand doc + optional presentation overlay into a
 * complete { shared, light, dark } token set with all `-content` pairs resolved.
 */
export function compileTokensV2(
  preset: ThemePresetV2,
  opts: CompileV2Options = {}
): CompiledThemeV2 {
  const { brand, presentation } = opts;
  return {
    shared: resolveShared(preset.shared, brand, presentation),
    light: resolveColors(preset.light, brand, presentation?.light),
    dark: resolveColors(preset.dark, brand, presentation?.dark),
  };
}
