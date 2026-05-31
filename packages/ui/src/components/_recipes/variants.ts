// Shared variant vocabulary for color-bearing components (docs/35 §4).
//
// The `color` axis is a thin mapping to the `.sx-c-{color}` role-var classes
// defined in tokens.css. The `variant` (treatment) classes are authored ONCE
// here, against the generic role vars (--c-bg / --c-fg / --c-ink / --c-hover /
// --c-tint), so color × variant composes automatically — no cartesian product,
// no codegen. A runtime custom color works as long as a matching `.sx-c-<name>`
// rule exists; each role-var read carries a neutral fallback so an unmapped
// color degrades gracefully instead of rendering unstyled.

/** The known semantic color slots. Components type `color` as
 *  `ColorKey | (string & {})` so a runtime custom-color name is still accepted
 *  (it maps to `sx-c-${color}`) while keeping autocomplete for the known set. */
export const COLOR_KEYS = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'module',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

/** `color` → role-var class. Object form so CVA can use it as a variant map for
 *  the known slots; unknown runtime colors are handled by the component via
 *  `sx-c-${color}` directly (see `colorClass`). */
export const colorVariants: Record<ColorKey, string> = {
  primary: 'sx-c-primary',
  secondary: 'sx-c-secondary',
  accent: 'sx-c-accent',
  neutral: 'sx-c-neutral',
  info: 'sx-c-info',
  success: 'sx-c-success',
  warning: 'sx-c-warning',
  danger: 'sx-c-danger',
  module: 'sx-c-module',
};

/** Resolve any color (known or runtime-custom) to its role-var class. */
export function colorClass(color: string | null | undefined): string {
  if (!color) return '';
  return `sx-c-${color}`;
}

// ── Treatment (the `variant` axis) ─────────────────────────────────────────
// Static strings (Tailwind-visible). Each role-var read has a neutral fallback.

/** Full treatment set — for Button-like components. */
export const treatmentVariants = {
  solid:
    'bg-[var(--c-bg,var(--color-neutral))] text-[var(--c-fg,var(--color-neutral-content))] hover:bg-[var(--c-hover,var(--color-neutral))]',
  soft: 'bg-[var(--c-tint,var(--color-bg-subtle))] text-[var(--c-ink,var(--color-text-primary))] hover:brightness-95',
  outline:
    'border border-[var(--c-bg,var(--color-border-strong))] bg-transparent text-[var(--c-ink,var(--color-text-primary))] hover:bg-[var(--c-tint,var(--color-bg-subtle))]',
  dashed:
    'border border-dashed border-[var(--c-bg,var(--color-border-strong))] bg-transparent text-[var(--c-ink,var(--color-text-primary))] hover:bg-[var(--c-tint,var(--color-bg-subtle))]',
  ghost:
    'bg-transparent text-[var(--c-ink,var(--color-text-primary))] hover:bg-[var(--c-tint,var(--color-bg-subtle))]',
  link: 'h-auto bg-transparent p-0 text-[var(--c-ink,var(--color-text-primary))] underline-offset-4 hover:underline',
} as const;

export type TreatmentKey = keyof typeof treatmentVariants;

/** Reduced treatment set for chips / banners (no link, no dashed-as-action). */
export const chipTreatmentVariants = {
  solid: treatmentVariants.solid,
  soft: treatmentVariants.soft,
  outline: treatmentVariants.outline,
  dashed: treatmentVariants.dashed,
} as const;
