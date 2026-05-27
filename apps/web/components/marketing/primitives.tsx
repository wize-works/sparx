/**
 * Marketing-only primitives.
 *
 * These wrap @sparx/ui tokens for the editorial register the marketing site
 * needs (massive display headlines, eyebrow labels, the colored "x" wordmark).
 * Bespoke chrome that doesn't belong in @sparx/ui — feature dashboards never
 * need an "x"-tinted wordmark or a 104px display font.
 *
 * No raw Tailwind composition per docs/23 §1; inline styles reference CSS
 * variables from packages/ui/src/tokens.css.
 */
import * as React from 'react';
const MODULE_COLORS = {
  storefront: { color: 'var(--module-storefront)', tint: '#EEF2FF', text: '#4338CA' },
  commerce: { color: 'var(--module-commerce)', tint: '#FFF7ED', text: '#C2410C' },
  cms: { color: 'var(--module-cms)', tint: '#F0FDFA', text: '#0F766E' },
  crm: { color: 'var(--module-crm)', tint: '#ECFEFF', text: '#0E7490' },
  email: { color: 'var(--module-email)', tint: '#F0F9FF', text: '#0369A1' },
  b2b: { color: 'var(--module-b2b)', tint: '#F1F5F9', text: '#334155' },
  ai: { color: 'var(--module-ai)', tint: '#FDF2F8', text: '#9D174D' },
  dropship: { color: 'var(--module-dropship)', tint: '#ECFDF5', text: '#065F46' },
} as const;

export type MarketingModule = keyof typeof MODULE_COLORS;

export function getModuleColor(module: MarketingModule) {
  return MODULE_COLORS[module];
}

/**
 * The Sparx wordmark. The "x" is always indigo. Brand guide §2.
 */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize: `${size}px`,
        letterSpacing: '-0.03em',
        color: 'var(--color-text-primary)',
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
      }}
    >
      Spar<span style={{ color: 'var(--sparx-primary)' }}>x</span>
    </span>
  );
}

/**
 * Editorial eyebrow label — small uppercase tag above section headings.
 * Brand guide §4 typography: Geist 500, 11px, 0.08em tracking.
 */
export function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize: '11px',
        letterSpacing: '0.08em',
        color: color ?? 'var(--color-text-secondary)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}

/**
 * Marketing display heading — sizes well past @sparx/ui's Heading variants.
 * Brand guide §4: Geist 500, -0.025em to -0.035em tracking.
 *
 * `size` and `lineHeight` are the **desktop max**. Display clamps internally
 * so the same headline reads correctly on a 320px phone and a 2560px monitor.
 * The min is roughly 0.4× the desktop max (with a floor of 28px) and the
 * preferred is a viewport-relative midpoint. See docs/23 §13.
 */
export function Display({
  children,
  size = 56,
  lineHeight,
  color,
  as: Tag = 'h2',
}: {
  children: React.ReactNode;
  size?: number;
  lineHeight?: number;
  color?: string;
  as?: 'h1' | 'h2' | 'h3';
}) {
  const lhMax = lineHeight ?? Math.round(size * 0.92);
  const fontSize = `clamp(${Math.max(28, Math.round(size * 0.42))}px, ${(size / 12).toFixed(2)}vw, ${size}px)`;
  const lh = `clamp(${Math.max(30, Math.round(lhMax * 0.5))}px, ${(lhMax / 12).toFixed(2)}vw, ${lhMax}px)`;
  return (
    <Tag
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize,
        letterSpacing: size > 80 ? '-0.035em' : '-0.025em',
        lineHeight: lh,
        color: color ?? 'var(--color-text-primary)',
        margin: 0,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Indigo dot used as a bullet/decorative accent (eyebrow row, hero strip).
 */
export function Dot({ color = 'var(--sparx-primary)', size = 6 }: { color?: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 9999,
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Centered content container. Used inside `<Section>` automatically; exposed
 * for inline `<section>` / `<nav>` / `<footer>` components that own their own
 * outer band (background, border) but still want the standard content cap.
 *
 * Max-width comes from `--container-max` in tokens.css (1280px); padding/
 * gutter is the responsive `--gutter-page` clamp() token.
 */
export function Container({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        maxWidth: 'var(--container-max)',
        marginLeft: 'auto',
        marginRight: 'auto',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Standard marketing section wrapper. Page gutter and vertical rhythm both
 * use clamp()-based responsive tokens — the section breathes from a 320px
 * phone up to a 2560px monitor without per-component breakpoint logic.
 * See docs/23 §13.
 *
 * Pass `bleed` for sections that must span gutter-to-gutter (rare).
 */
export function Section({
  id,
  children,
  surface = 'page',
  padding = 'lg',
  bleed,
  style,
}: {
  id?: string;
  children: React.ReactNode;
  surface?: 'page' | 'surface' | 'dark';
  padding?: 'md' | 'lg' | 'xl';
  bleed?: boolean;
  style?: React.CSSProperties;
}) {
  const surfaceBg =
    surface === 'page'
      ? 'var(--color-bg-page)'
      : surface === 'surface'
        ? 'var(--color-bg-surface)'
        : '#0A0A0A';
  const py =
    padding === 'md'
      ? 'var(--section-py-md)'
      : padding === 'lg'
        ? 'var(--section-py-lg)'
        : 'var(--section-py-xl)';
  return (
    <section
      id={id}
      style={{
        backgroundColor: surfaceBg,
        paddingTop: py,
        paddingBottom: py,
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        borderTop:
          surface === 'surface'
            ? '1px solid var(--color-border-default)'
            : surface === 'dark'
              ? '1px solid #1A1A1A'
              : undefined,
        scrollMarginTop: '80px',
        ...style,
      }}
    >
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}

/**
 * Editorial section header. Vertical stack — eyebrow, display headline, lede.
 *
 * The headline sets a maxWidth so it can wrap onto a second line at our content
 * widths instead of stretching to the gutter. The lede sits narrower than the
 * headline (640px vs 960px) so the eye gets a clean rag from headline to body.
 *
 * `lede` accepts any ReactNode so callers can interpolate spans / Spark accents.
 * For sections that need a colored chip above the headline (MCP, B2B, Final
 * CTA), pass an <EyebrowBadge> as `eyebrow` instead of a plain string.
 */
export function SectionHeader({
  eyebrow,
  eyebrowColor,
  headline,
  lede,
  invert,
  headlineSize,
  headlineLineHeight,
}: {
  eyebrow?: React.ReactNode;
  eyebrowColor?: string;
  headline: React.ReactNode;
  lede?: React.ReactNode;
  invert?: boolean;
  headlineSize?: number;
  headlineLineHeight?: number;
}) {
  const textPrimary = invert ? '#FFFFFF' : 'var(--color-text-primary)';
  const textSecondary = invert ? '#A1A1AA' : 'var(--color-text-secondary)';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        alignItems: 'flex-start',
      }}
    >
      {eyebrow ? (
        typeof eyebrow === 'string' ? (
          <Eyebrow color={eyebrowColor}>{eyebrow}</Eyebrow>
        ) : (
          eyebrow
        )
      ) : null}
      <div style={{ maxWidth: '960px' }}>
        <Display color={textPrimary} size={headlineSize} lineHeight={headlineLineHeight}>
          {headline}
        </Display>
      </div>
      {lede ? (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            lineHeight: '30px',
            color: textSecondary,
            maxWidth: '640px',
            margin: 0,
            paddingTop: '8px',
          }}
        >
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Colored eyebrow chip — dot + uppercase label inside a tinted pill. Used by
 * sections that want their module color (or another accent) to lead the
 * header rather than the default subdued uppercase label.
 */
export function EyebrowBadge({
  children,
  color,
  background,
  text,
}: {
  children: React.ReactNode;
  color: string;
  background: string;
  text: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 12px',
        backgroundColor: background,
        borderRadius: '9999px',
        width: 'fit-content',
      }}
    >
      <Dot color={color} />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '11px',
          letterSpacing: '0.05em',
          color: text,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * Indigo period — the recurring "spark" brand moment from the design.
 * Used at the end of display headlines: "ignited." "live." etc.
 */
export function Spark({ color = 'var(--sparx-primary)' }: { color?: string }) {
  return <span style={{ color }}>.</span>;
}
