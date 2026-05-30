import * as React from 'react';
import { colors, fontFamily } from './tokens';

// Per-tenant brand for email rendering.
//
// Mail clients strip <style> blocks and don't honour CSS custom properties, so
// brand values must be concrete and inlined on each element. Rather than thread
// a `brand` prop through every template + atom, we put the resolved brand on a
// React context: `renderTemplate` wraps the tree in <BrandProvider brand={…}>
// and every atom reads it via `useBrand()`. With no provider, atoms fall back
// to `defaultBrand` (the Sparx chrome) — so existing render paths are unchanged.
//
// The brand is resolved per tenant by @sparx/email-platform's brand-service
// (storefront theme tokens → settings override → Sparx defaults), light palette
// only (email-client dark mode is unreliable).

export interface BrandTokens {
  /** Filled-button / link / wordmark accent. */
  primary: string;
  /** Text/icon color on top of `primary`. */
  primaryForeground: string;
  /** Secondary accent (used for links when distinct from primary). */
  accent: string;
  /** Card/content surface — the inner container background. */
  background: string;
  /** Body + heading text color. */
  foreground: string;
  /** Page background behind the card + subtle fills. */
  muted: string;
  /** Hairlines + dividers + card border. */
  border: string;
  /** CSS font-family stack for headings (name + web-safe fallback). */
  fontHeading: string;
  /** CSS font-family stack for body copy. */
  fontBody: string;
  /** Absolute logo URL; when present the wordmark renders the image. */
  logoUrl?: string;
  /** Store name — wordmark fallback + footer. */
  storeName?: string;
}

export const defaultBrand: BrandTokens = {
  primary: colors.brand,
  primaryForeground: colors.textInverse,
  accent: colors.brand,
  background: colors.surface,
  foreground: colors.textPrimary,
  muted: colors.surfaceMuted,
  border: colors.border,
  fontHeading: fontFamily,
  fontBody: fontFamily,
  storeName: 'Sparx',
};

const BrandContext = React.createContext<BrandTokens>(defaultBrand);

export function BrandProvider({
  brand,
  children,
}: {
  brand?: Partial<BrandTokens>;
  children: React.ReactNode;
}) {
  // Merge over defaults so a partial brand (e.g. only a primary color) still
  // produces a complete, renderable token set.
  const value = React.useMemo<BrandTokens>(() => ({ ...defaultBrand, ...brand }), [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandTokens {
  return React.useContext(BrandContext);
}
