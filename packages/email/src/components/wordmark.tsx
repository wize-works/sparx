import * as React from 'react';
import { Img } from '@react-email/components';
import { useBrand } from './brand';

// EmailWordmark — the email header brand mark. Resolves from the active brand:
//   • a merchant logo (when brand.logoUrl is set) → renders the image,
//   • a merchant store name → renders it in the brand foreground,
//   • the Sparx default → the "Spar<x>" wordmark with the accent "x".
//
// Mail clients strip <style> blocks and don't honour CSS variables, so every
// value is inlined. Brand colors/fonts come from the BrandContext.

export interface EmailWordmarkProps {
  /** Font size in px (logo height scales from this). Default 22. */
  size?: number;
}

export function EmailWordmark({ size = 22 }: EmailWordmarkProps) {
  const brand = useBrand();

  if (brand.logoUrl) {
    return (
      <Img
        src={brand.logoUrl}
        alt={brand.storeName ?? 'Logo'}
        height={Math.round(size * 1.4)}
        style={{ display: 'block', maxHeight: Math.round(size * 1.6), width: 'auto' }}
      />
    );
  }

  const wordmarkStyle: React.CSSProperties = {
    fontFamily: brand.fontHeading,
    fontSize: size,
    fontWeight: 500,
    letterSpacing: '-0.03em',
    lineHeight: 1,
    color: brand.foreground,
  };

  // Merchant store name (anything other than the Sparx default) renders plain.
  if (brand.storeName && brand.storeName !== 'Sparx') {
    return <span style={wordmarkStyle}>{brand.storeName}</span>;
  }

  return (
    <span style={wordmarkStyle}>
      Spar<span style={{ color: brand.primary }}>x</span>
    </span>
  );
}
