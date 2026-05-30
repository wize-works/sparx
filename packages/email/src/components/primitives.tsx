import * as React from 'react';
import {
  Button as ReButton,
  Heading as ReHeading,
  Hr as ReHr,
  Link as ReLink,
  Section as ReSection,
  Text as ReText,
} from '@react-email/components';
import { colors, radius, spacing, typography } from './tokens';
import { useBrand } from './brand';

// Atomic email components. Wrappers around @react-email/components that bake in
// the active brand styling so callers never inline raw style props. Brand-
// driven colors + fonts come from the BrandContext (per-tenant); typography
// scale, spacing, radius, and the muted/callout chrome stay fixed.
//
// Why no Tailwind: @react-email's Tailwind support exists but adds a build
// step and a wrapper component the renderer has to traverse. Inline style
// objects keep render simple, predictable, and easy to debug — the rendered
// HTML matches the JSX 1:1.

// ────────────────────────────────────────────────────────────────────────
// Typography
// ────────────────────────────────────────────────────────────────────────

export interface EmailHeadingProps {
  children: React.ReactNode;
  /** h1 (display) vs h2 (section). Default h1. */
  level?: 1 | 2;
}

export function EmailHeading({ children, level = 1 }: EmailHeadingProps) {
  const brand = useBrand();
  const style = level === 1 ? typography.heading : typography.subheading;
  return (
    <ReHeading
      as={level === 1 ? 'h1' : 'h2'}
      style={{
        ...style,
        color: brand.foreground,
        margin: `0 0 ${spacing.sm}px`,
        fontFamily: brand.fontHeading,
      }}
    >
      {children}
    </ReHeading>
  );
}

export interface EmailParagraphProps {
  children: React.ReactNode;
  /** Drops bottom margin — use when this paragraph is the last child of a
   *  section so the next-section spacer doesn't double up. */
  flush?: boolean;
}

export function EmailParagraph({ children, flush = false }: EmailParagraphProps) {
  const brand = useBrand();
  return (
    <ReText
      style={{
        ...typography.body,
        color: brand.foreground,
        fontFamily: brand.fontBody,
        margin: `0 0 ${flush ? 0 : spacing.md}px`,
      }}
    >
      {children}
    </ReText>
  );
}

export interface EmailMutedProps {
  children: React.ReactNode;
}

export function EmailMuted({ children }: EmailMutedProps) {
  const brand = useBrand();
  return (
    <ReText
      style={{
        ...typography.muted,
        color: colors.textMuted,
        fontFamily: brand.fontBody,
        margin: `${spacing.md}px 0 0`,
      }}
    >
      {children}
    </ReText>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Links
// ────────────────────────────────────────────────────────────────────────

export interface EmailLinkProps {
  href: string;
  children: React.ReactNode;
}

export function EmailLink({ href, children }: EmailLinkProps) {
  const brand = useBrand();
  return (
    <ReLink
      href={href}
      style={{
        color: brand.primary,
        textDecoration: 'underline',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </ReLink>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Buttons
// ────────────────────────────────────────────────────────────────────────

export interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
  /** primary: filled brand (default). secondary: outlined. */
  variant?: 'primary' | 'secondary';
}

export function EmailButton({ href, children, variant = 'primary' }: EmailButtonProps) {
  const brand = useBrand();
  const variantStyle =
    variant === 'primary'
      ? { backgroundColor: brand.primary, color: brand.primaryForeground, border: 'none' }
      : {
          backgroundColor: brand.background,
          color: brand.primary,
          border: `1px solid ${brand.primary}`,
        };
  return (
    <ReButton
      href={href}
      style={{
        ...variantStyle,
        borderRadius: radius.button,
        fontSize: typography.body.fontSize,
        fontWeight: 500,
        padding: '10px 18px',
        textDecoration: 'none',
        display: 'inline-block',
        fontFamily: brand.fontBody,
      }}
    >
      {children}
    </ReButton>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Callout — bordered tinted block for "important" notices.
// ────────────────────────────────────────────────────────────────────────

export interface EmailCalloutProps {
  children: React.ReactNode;
  /** info: indigo tint. warn: amber. success: green. Default info. */
  tone?: 'info' | 'warn' | 'success';
}

export function EmailCallout({ children, tone = 'info' }: EmailCalloutProps) {
  const brand = useBrand();
  const bg =
    tone === 'warn'
      ? colors.calloutWarnBg
      : tone === 'success'
        ? colors.calloutSuccessBg
        : colors.calloutInfoBg;
  return (
    <ReSection
      style={{
        backgroundColor: bg,
        borderRadius: radius.callout,
        padding: spacing.md,
        margin: `${spacing.md}px 0`,
      }}
    >
      <ReText
        style={{
          ...typography.body,
          color: brand.foreground,
          fontFamily: brand.fontBody,
          margin: 0,
        }}
      >
        {children}
      </ReText>
    </ReSection>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Spacer + Divider — explicit vertical rhythm controls.
// ────────────────────────────────────────────────────────────────────────

export interface EmailSpacerProps {
  /** Vertical space in px. Default 16. */
  size?: number;
}

export function EmailSpacer({ size = spacing.md }: EmailSpacerProps) {
  return <div style={{ height: size, lineHeight: `${size}px` }}>&nbsp;</div>;
}

export function EmailDivider() {
  const brand = useBrand();
  return <ReHr style={{ borderColor: brand.border, margin: `${spacing.lg}px 0` }} />;
}
