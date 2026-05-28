import * as React from 'react';
import { colors, fontFamily } from './tokens';

// EmailWordmark — email-safe twin of @sparx/ui's <Wordmark>. Mail clients
// strip <style> blocks and don't honour CSS variables, so this can't share
// the same component as the web one — but it produces the same visual
// output (Geist-equivalent fallback, indigo "x", tight tracking) by
// inlining hex values from the brand token module.
//
// If the brand color ever moves, change colors.brand in
// packages/email/src/components/tokens.ts AND --sparx-primary in
// packages/ui/src/tokens.css together — they intentionally mirror.

export interface EmailWordmarkProps {
  /** Font size in px. Default 22 matches the dashboard auth header + the
   *  marketing nav, so the recipient's mental model is consistent. */
  size?: number;
}

export function EmailWordmark({ size = 22 }: EmailWordmarkProps) {
  return (
    <span
      style={{
        fontFamily,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        color: colors.textPrimary,
      }}
    >
      Spar<span style={{ color: colors.brand }}>x</span>
    </span>
  );
}
