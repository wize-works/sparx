import * as React from 'react';
import { cn } from '../../utils/cn';
import { SparxMark } from './sparx-mark';

// The Sparx wordmark. Single source of truth so the marketing site, the
// dashboard auth header, OG images, and any embedded badge all render the
// same letterforms.
//
// Brand rules (docs/sparx-brand-guide.md §2):
//   - The "x" is ALWAYS Sparx Indigo (#6366F1) — never a solid one-color
//     wordmark.
//   - Set in Inter bold (700), tracking -0.03em, to match the weight and
//     proportions of the monogram mark.
//   - Lowercase, no period, no caps.
//
// Font: rendered with `--font-wordmark` (Inter, loaded per-app via next/font),
// falling back to the Inter family / system stack. Apps that show the wordmark
// must register the var on a wrapping element (see each app's root layout).
//
// Sizing: `size` is the font-size in px. Default 22 matches the marketing
// header. The component uses inline `fontSize` (not Tailwind text-size
// utilities) so callers can pick exact pixel values without pulling in
// arbitrary text classes.
//
// Color: the "x" uses `--sparx-primary` from packages/ui/src/tokens.css.
// In emails — where mail clients strip <style> blocks — use
// @sparx/email's <EmailWordmark> instead; it inlines the same hex.

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Font size in px. Default 22 (matches marketing header + email header). */
  size?: number;
  /** Render the Sparx monogram mark before the wordmark (icon + wordmark lockup). */
  icon?: boolean;
}

export function Wordmark({ size = 22, icon = false, className, style, ...rest }: WordmarkProps) {
  return (
    <span
      className={cn('font-bold tracking-tight', icon && 'inline-flex items-center', className)}
      style={{
        fontSize: size,
        fontFamily: "var(--font-wordmark, 'Inter', system-ui, sans-serif)",
        fontWeight: 700,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        color: 'var(--color-text-primary)',
        ...(icon ? { gap: Math.round(size * 0.28) } : {}),
        ...style,
      }}
      {...rest}
    >
      {icon ? (
        <SparxMark size={Math.round(size * 1.18)} />
      ) : (
        <span>
          Spar<span style={{ color: 'var(--sparx-primary)' }}>x</span>
        </span>
      )}
    </span>
  );
}
