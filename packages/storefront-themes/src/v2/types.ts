// Token Model v2 data shapes (docs/33-token-model-v2.md §3, §5).
//
// Three inputs feed the compiler:
//   • a ThemePresetV2 — the preset's complete defaults (shared + light/dark),
//   • a BrandTokenDoc — tenant-level identity + shape + rhythm (brand-OWNED;
//     wins for its slots; read-only to cms/commerce/email),
//   • a PresentationOverlayV2 — the merchant's per-mode surface/status overrides.
//
// Brand owns identity (color/type) + shape + rhythm; presentation owns surfaces,
// neutral, status, border color, container width. `-content` pairs are derived
// unless explicitly set (docs/33 §3.1).

// ── Color slots (per light/dark mode) ──────────────────────────────────────

/** The base color slots a preset must define for one mode. `*Content` are
 *  optional — omit to auto-derive (deriveContent). */
export interface ColorTokensV2 {
  // Surfaces (presentation-owned)
  base100: string; // page background
  base200: string; // elevated surface / card
  base300: string; // subtle / muted surface
  baseContent: string; // primary text on surfaces (set directly, not derived)
  // Brand identity (brand-owned)
  primary: string;
  secondary: string;
  accent: string;
  // UI fill (presentation-owned)
  neutral: string;
  // Status (presentation-owned, themeable with defaults)
  info: string;
  success: string;
  warning: string;
  danger: string;
  // Line (presentation-owned)
  border: string;
  // Optional explicit `-content` overrides (else derived from the base above)
  primaryContent?: string;
  secondaryContent?: string;
  accentContent?: string;
  neutralContent?: string;
  infoContent?: string;
  successContent?: string;
  warningContent?: string;
  dangerContent?: string;
}

// ── Shared tokens (mode-independent) ───────────────────────────────────────

/** Tokens that don't change between light and dark: type, shape, rhythm,
 *  effect, container. A preset defines all of them. */
export interface SharedTokensV2 {
  // Type (brand-owned)
  fontHeading: string;
  fontBody: string;
  // Shape (brand-owned)
  radiusSelector: string; // pills, chips, toggles, swatches, badges
  radiusField: string; // inputs, buttons, selects, small controls
  radiusBox: string; // cards, panels, drawers, media
  borderWidth: string; // site-wide line weight
  // Rhythm (brand-owned)
  spaceBase: string; // the rhythm unit; --sf-space-* scale derives from it
  sizeField: string; // control height for inputs/buttons
  sizeSelector: string; // control height for pills/toggles
  // Effect (brand-owned)
  depth: number; // shadow-intensity multiplier (0 flat → 1 default → >1 lifted)
  // Layout (presentation-owned default; overridable via presentation overlay)
  containerWidth: string; // named width key (narrow/medium/wide/full) or length
}

/** A preset's complete v2 defaults. */
export interface ThemePresetV2 {
  shared: SharedTokensV2;
  light: ColorTokensV2;
  dark: ColorTokensV2;
}

// ── Brand token document (TenantBrand.tokens JSONB) ────────────────────────

export interface BrandTokenDoc {
  v: 2;
  color?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
    primaryContent?: string | null;
    secondaryContent?: string | null;
    accentContent?: string | null;
  };
  type?: {
    heading?: string | null;
    body?: string | null;
  };
  shape?: {
    radiusSelector?: string | null;
    radiusField?: string | null;
    radiusBox?: string | null;
    borderWidth?: string | null;
  };
  rhythm?: {
    spaceBase?: string | null;
    sizeField?: string | null;
    sizeSelector?: string | null;
  };
  effect?: {
    depth?: number | null;
  };
}

// ── Presentation overlay (Site Builder theme config JSONB) ─────────────────

/** Per-mode presentation overrides; every field nullable → inherit preset. */
export interface PresentationColorOverlay {
  base100?: string | null;
  base200?: string | null;
  base300?: string | null;
  baseContent?: string | null;
  neutral?: string | null;
  neutralContent?: string | null;
  info?: string | null;
  success?: string | null;
  warning?: string | null;
  danger?: string | null;
  infoContent?: string | null;
  successContent?: string | null;
  warningContent?: string | null;
  dangerContent?: string | null;
  border?: string | null;
}

export interface PresentationOverlayV2 {
  v?: 2;
  containerWidth?: string | null; // shared across modes
  light?: PresentationColorOverlay;
  dark?: PresentationColorOverlay;
}

// ── Compiled output ────────────────────────────────────────────────────────

/** A fully-resolved color set for one mode — every base + every `-content`
 *  concrete (derived where not explicit). */
export interface CompiledColorTokensV2 {
  base100: string;
  base200: string;
  base300: string;
  baseContent: string;
  primary: string;
  primaryContent: string;
  secondary: string;
  secondaryContent: string;
  accent: string;
  accentContent: string;
  neutral: string;
  neutralContent: string;
  info: string;
  infoContent: string;
  success: string;
  successContent: string;
  warning: string;
  warningContent: string;
  danger: string;
  dangerContent: string;
  border: string;
}

export interface CompiledThemeV2 {
  shared: SharedTokensV2;
  light: CompiledColorTokensV2;
  dark: CompiledColorTokensV2;
}
