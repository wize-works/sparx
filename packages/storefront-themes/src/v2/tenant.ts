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

/** Tenant brand as stored in the TenantBrand columns + the `tokens` JSONB (the
 *  subset the v2 engine consumes; selected by publish-service and returned by
 *  /v1/brand). Colour/type are dedicated columns; shape/rhythm/effect live in
 *  the `tokens` doc — one source of truth per axis. */
export interface TenantBrandColumns {
  colorPrimary?: string | null;
  colorPrimaryForeground?: string | null;
  colorAccent?: string | null;
  colorAccentForeground?: string | null;
  colorSecondary?: string | null;
  colorSecondaryForeground?: string | null;
  fontHeading?: string | null;
  fontBody?: string | null;
  // Partial BrandTokenDoc (shape/rhythm/effect branches). `unknown` because it
  // arrives untyped from Prisma JSONB / the brand API; read defensively below.
  tokens?: unknown;
}

/** Project the TenantBrand columns + `tokens` doc onto a v2 brand token doc.
 *  Colour/type come from the columns (they win); shape/rhythm/effect from the
 *  `tokens` JSONB. Empty/absent values stay null/undefined so the compiler falls
 *  through to the preset default (resolveShared/resolveColors read defensively). */
export function brandColsToTokenDoc(cols: TenantBrandColumns | null | undefined): BrandTokenDoc {
  const tokens = (cols?.tokens ?? undefined) as BrandTokenDoc | undefined;
  return {
    v: 2,
    color: {
      primary: cols?.colorPrimary ?? null,
      primaryContent: cols?.colorPrimaryForeground ?? null,
      accent: cols?.colorAccent ?? null,
      accentContent: cols?.colorAccentForeground ?? null,
      secondary: cols?.colorSecondary ?? null,
      secondaryContent: cols?.colorSecondaryForeground ?? null,
    },
    type: {
      heading: cols?.fontHeading ?? null,
      body: cols?.fontBody ?? null,
    },
    shape: tokens?.shape,
    rhythm: tokens?.rhythm,
    effect: tokens?.effect,
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
