import * as React from 'react';
import { cn } from '../../utils/cn';

// The Sparx wordmark. Single source of truth so the marketing site, the
// dashboard auth header, OG images, and any embedded badge all render the
// same letterforms.
//
// Brand rules (docs/sparx-brand-guide.md §2):
//   - The "x" is ALWAYS Sparx Indigo (#6366F1) — never a solid one-color
//     wordmark.
//   - Geist 500 weight, tracking -0.03em.
//   - Lowercase, no period, no caps.
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
}

export function Wordmark({ size = 22, className, style, ...rest }: WordmarkProps) {
  return (
    <span
      className={cn('font-medium tracking-tight', className)}
      style={{
        fontSize: size,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        color: 'var(--color-text-primary)',
        ...style,
      }}
      {...rest}
    >
      Spar<span style={{ color: 'var(--sparx-primary)' }}>x</span>
    </span>
  );
}
