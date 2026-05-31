// Transitional v1 → v2 bridge (docs/33-token-model-v2.md §7 step 3).
//
// Until the Phase 2 generator editor writes v2 token docs natively, the live
// storefront still has only the v1 stores: the tenant brand columns (identity),
// the StorefrontTheme presentation columns (single, light-biased), and — when a
// site is published — the per-mode v1 compiled tokens in the snapshot. This
// module maps those into v2 compiler inputs so the storefront renders through
// the v2 engine with NO schema or API change. It is deleted in §6 once the
// editor persists v2 docs directly.

import { compileTokensV2 } from './compile';
import { buildThemeCssV2 } from './css';
import { getThemePresetV2 } from '../presets/v2';
import type {
  BrandTokenDoc,
  CompiledThemeV2,
  PresentationColorOverlay,
  PresentationOverlayV2,
} from './types';

/** Tenant brand identity, as stored in the v1 columns. */
export interface LegacyBrandInput {
  colorPrimary?: string | null;
  colorPrimaryForeground?: string | null;
  colorAccent?: string | null;
  fontHeading?: string | null;
  fontBody?: string | null;
  // A merchant-chosen corner radius (v1 presentation) maps onto brand shape.
  radiusBase?: string | null;
}

export interface LegacySources {
  themeKey: string;
  brand?: LegacyBrandInput | null;
  // StorefrontTheme presentation columns (light-biased single values).
  presentationLight?: { colorBackground?: string | null; colorMuted?: string | null } | null;
  // A published snapshot's per-mode v1 compiled tokens, when present.
  snapshotTokens?: { light: Record<string, string>; dark: Record<string, string> } | null;
}

// First non-empty string, else undefined (the v2 compiler reads undefined as
// "absent" → preset default wins).
function present(...vals: (string | null | undefined)[]): string | undefined {
  for (const v of vals) if (typeof v === 'string' && v.trim() !== '') return v;
  return undefined;
}

// v1 presentation tokens → a v2 presentation overlay for one mode (surfaces
// only; neutral/status stay on the preset until a merchant edits them).
function presentationFromV1(t: Record<string, string>): PresentationColorOverlay {
  return {
    base100: present(t.colorBackground),
    base300: present(t.colorMuted),
    baseContent: present(t.colorForeground),
    border: present(t.colorBorder),
  };
}

/** Compile a v2 token set from the legacy v1 stores. */
export function compileFromLegacy(sources: LegacySources): CompiledThemeV2 {
  const { themeKey, brand, presentationLight, snapshotTokens } = sources;
  const preset = getThemePresetV2(themeKey);

  const radiusSource = present(snapshotTokens?.light.radiusBase, brand?.radiusBase);
  const brandDoc: BrandTokenDoc = {
    v: 2,
    color: {
      primary: present(brand?.colorPrimary),
      primaryContent: present(brand?.colorPrimaryForeground),
      accent: present(brand?.colorAccent),
    },
    type: {
      heading: present(brand?.fontHeading),
      body: present(brand?.fontBody),
    },
    ...(radiusSource ? { shape: { radiusBox: radiusSource, radiusField: radiusSource } } : {}),
  };

  // Prefer the published snapshot's per-mode surfaces; otherwise seed light from
  // the StorefrontTheme columns and let the preset fill dark.
  const presentation: PresentationOverlayV2 = snapshotTokens
    ? {
        v: 2,
        containerWidth: present(snapshotTokens.light.containerWidth),
        light: presentationFromV1(snapshotTokens.light),
        dark: presentationFromV1(snapshotTokens.dark),
      }
    : {
        v: 2,
        light: {
          base100: present(presentationLight?.colorBackground),
          base300: present(presentationLight?.colorMuted),
        },
      };

  return compileTokensV2(preset, { brand: brandDoc, presentation });
}

/** Build the storefront theme stylesheet from the legacy v1 stores. */
export function buildLegacyThemeCss(sources: LegacySources): string {
  return buildThemeCssV2(compileFromLegacy(sources));
}
