// Token Model v2 — tenant-facing compile entry (docs/33-token-model-v2.md §5).
//
// The ONE function the live read paths call: given a theme key, the tenant's
// brand columns, and the Site Builder presentation overlay, produce a complete
// CompiledThemeV2. Both the published-snapshot read (publish-service) and the
// dashboard's live theme inspector go through here, so the storefront SSR and
// the editor preview can never drift.
//
// Brand identity (primary/accent/type) is read from the existing TenantBrand
// columns; shape/rhythm/effect arrive with the §2.4 `TenantBrand.tokens` JSONB
// column, at which point `brandColsToTokenDoc` widens to merge that doc in.

import { compileTokensV2 } from './compile';
import { getThemePresetV2 } from '../presets/v2';
import type { BrandTokenDoc, CompiledThemeV2, PresentationOverlayV2 } from './types';

/** Tenant brand identity as stored in the TenantBrand columns (the subset the
 *  v2 engine consumes; selected by publish-service and returned by /v1/brand). */
export interface TenantBrandColumns {
  colorPrimary?: string | null;
  colorPrimaryForeground?: string | null;
  colorAccent?: string | null;
  fontHeading?: string | null;
  fontBody?: string | null;
}

/** Project the TenantBrand identity columns onto a v2 brand token doc. Empty
 *  columns stay null so the compiler falls through to the preset default. */
export function brandColsToTokenDoc(cols: TenantBrandColumns | null | undefined): BrandTokenDoc {
  return {
    v: 2,
    color: {
      primary: cols?.colorPrimary ?? null,
      primaryContent: cols?.colorPrimaryForeground ?? null,
      accent: cols?.colorAccent ?? null,
    },
    type: {
      heading: cols?.fontHeading ?? null,
      body: cols?.fontBody ?? null,
    },
  };
}

export interface CompileForTenantArgs {
  themeKey: string;
  /** TenantBrand identity columns (brand-owned slots win). */
  brand?: TenantBrandColumns | null;
  /** The Site Builder presentation overlay (surfaces/neutral/status/border). */
  presentation?: PresentationOverlayV2 | null;
}

/**
 * Compile a tenant's storefront theme: the v2 preset for `themeKey`, with brand
 * identity layered on top and the merchant's presentation overlay over that.
 * Always complete (the preset supplies every slot) even with no brand/overlay.
 */
export function compileThemeForTenant(args: CompileForTenantArgs): CompiledThemeV2 {
  return compileTokensV2(getThemePresetV2(args.themeKey), {
    brand: brandColsToTokenDoc(args.brand),
    presentation: args.presentation ?? null,
  });
}
