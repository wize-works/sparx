import * as React from 'react';
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Row,
  Section,
} from '@react-email/components';
import type { EmailPalette } from '@wizeworks/brand-core';
import {
  EmailDivider,
  EmailMuted,
  EmailWordmark,
  PlatformWordmark,
  useBrand,
  usePalette,
  usePlatform,
} from '../components';
import { colors, signal, spacing } from '../components/tokens';

// Shared email frame — the platform (bucket-B) twin of the silica redesign's frame
// (docs/impl transactional-email §4 P5). Every coded template inherits the same
// chrome: a thin brand-color top bar, the wordmark header, and a tiered footer, so
// a person's password-reset reads like their order-confirmation. Callers compose
// only body content as children.
//
// Hand-rolled HTML/CSS via @react-email/components: the rendered output is
// table-based markup that survives every popular mail client. Brand colors +
// fonts come from the BrandContext (per-tenant); spacing is fixed.

/** `https://meetpiggles.com/` → `meetpiggles.com`. The footer's legal line reads
 *  as a name, not as a link, so the scheme is noise. */
function displayHost(url: string | null): string | null {
  return url ? url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
}

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  /** Brief tagline rendered on the first footer line. */
  footerNote?: string;
  /**
   * WHOSE CUSTOMER IS READING THIS.
   *
   * `platform` — we are writing to somebody who has an account with us: a
   * password reset, a chat notification, a form landing in the owner's inbox.
   * They know who WizeWorks is, so the masthead carries the product's wordmark
   * and the fine print names the operator.
   *
   * `visitor` — the TENANT is writing to their own customer, and we are simply
   * the post. An invoice from a clothes shop, a download somebody swapped their
   * address for, a thanks-for-getting-in-touch. **That reader has never heard of
   * us**, so a software product's wordmark over their invoice reads like a
   * billing service nobody hired, and an operating company's name in the fine
   * print reads like a party to a transaction they never agreed to. They get the
   * shop's name and, at the very bottom, "Sent with <product>" — the same quiet
   * credit the Builder email frame has always given (`silica/frame.ts`
   * `attributionHtml`).
   *
   * ONE prop rather than two, on purpose. The masthead and the sign-off are the
   * same decision, and they were separate: `header={false}` existed and exactly
   * ONE template ever passed it, so the other visitor-facing sends carried our
   * wordmark to a stranger while the invoice did not.
   */
  audience: 'platform' | 'visitor';
}

export function EmailLayout({ preview, children, footerNote, audience }: EmailLayoutProps) {
  const brand = useBrand();
  const platform = usePlatform();
  const platformHost = displayHost(platform.url);
  // `siteName` is the TENANT's shop name — but `defaultBrand` seeds it with the
  // platform's own, so an unbranded send would otherwise sign itself with
  // whichever brand that default was written for. The flag is the only way to
  // tell "no name" from "a shop that happens to be called this", and it is the
  // same distinction the wordmark makes.
  const senderName =
    brand.siteNameIsPlatformDefault || !brand.siteName ? platform.name : brand.siteName;
  // The wordmark is OURS, so it belongs only on mail to somebody who deals with us.
  const header = audience === 'platform';
  // The last line. To our own account holder it is the operator, which is the one
  // identity that does not vary between the two products. To a tenant's customer
  // it is a quiet credit and nothing more -- and if the send could not resolve
  // which product it is from, it says NOTHING, because crediting a guess in front
  // of somebody else's customer is worse than crediting no one. Same rule, same
  // wording, as `silica/frame.ts`'s `attributionHtml`.
  const signOff =
    audience === 'platform'
      ? platformHost
        ? `WizeWorks · ${platformHost}`
        : 'WizeWorks'
      : platform.name
        ? `Sent with ${platform.name}`
        : null;
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: brand.muted,
          margin: 0,
          padding: `${spacing.xl}px 0`,
          fontFamily: brand.fontBody,
        }}
      >
        <Container
          style={{
            backgroundColor: brand.background,
            border: `1px solid ${brand.border}`,
            borderRadius: 8,
            margin: '0 auto',
            maxWidth: 560,
            // Padding lives on the inner section so the brand bar can sit flush to
            // the top edge; `overflow:hidden` keeps it inside the rounded corners.
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {/* The thin brand-color top bar — the same signal the silica frame opens
              with, tying the platform emails to the tenant-facing ones. */}
          <Section
            style={{
              backgroundColor: brand.primary,
              height: 4,
              lineHeight: '4px',
              fontSize: 0,
            }}
          >
            &nbsp;
          </Section>

          <Section style={{ padding: `${spacing.xl}px` }}>
            {header ? (
              <>
                <Section>
                  <EmailWordmark />
                </Section>

                <EmailDivider />
              </>
            ) : null}

            {children}

            <EmailDivider />

            {/* Tiered footer: a tagline line over the sign-off, both muted. On a
                visitor send the tagline is the SHOP alone -- the product credit
                moves to the line below it rather than appearing twice. */}
            <EmailMuted style={{ margin: 0 }}>
              {footerNote ??
                (audience === 'platform'
                  ? `${senderName} · Sent with ${platform.name}`
                  : senderName)}
            </EmailMuted>
            {signOff ? (
              <EmailMuted style={{ margin: `${spacing.xs}px 0 0`, color: colors.textMuted }}>
                {signOff}
              </EmailMuted>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ── PlatformEmailLayout — the "Signal" chassis for sparx PLATFORM emails ──────
//
// The redesign frame the 20-minus-5 coded sparx→owner templates run through
// (billing, auth, domains, team, partner, …). Deliberately SEPARATE from
// `EmailLayout` above (which stays the tenant/broadcast/builder frame, redesigned
// in a later pass) so this change is scoped to platform email with zero regression
// risk to tenant sends.
//
// Chrome: a solid INK masthead carrying the sending product's wordmark — a real
// brand moment, not a 4px hairline bar — then the body, then a footer well with
// optional quick links + the legal line. Every value inlined; table-based; 600px
// single column.
//
// The masthead used to be the literal JSX `spar<span>x</span>`, which made every
// platform email sparx's regardless of who it was going to — a Piggles owner's
// password reset arrived under another company's mark. The NAME and the URL come
// from `brand.platform`; the PALETTE now comes from `usePalette()`, resolved from
// the same tenant `platform_brand` (B5.1, closed). Neither this file nor the
// blocks hold a hex.

export interface PlatformFooterLink {
  label: string;
  href: string;
}

export interface PlatformEmailLayoutProps {
  /** Inbox preview text (the line after the subject). */
  preview: string;
  children: React.ReactNode;
  /** Optional right-aligned meta on the masthead (e.g. a receipt number). */
  mastheadRight?: string;
  /** Quick links shown as a row above the legal line. */
  footerLinks?: PlatformFooterLink[];
  /** The "you're receiving this because…" line — always state the reason. */
  footerReason?: string;
}

/** A function of the palette rather than a module constant — the whole point of
 *  B5.1 is that nothing about a platform email's color survives module load,
 *  because one process renders for every brand. */
function footerLinkStyle(p: EmailPalette): React.CSSProperties {
  return {
    color: p.ink,
    fontFamily: signal.font,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    borderBottom: `1px solid ${p.lineStrong}`,
    paddingBottom: 1,
  };
}

export function PlatformEmailLayout({
  preview,
  children,
  mastheadRight,
  footerLinks,
  footerReason,
}: PlatformEmailLayoutProps) {
  const platform = usePlatform();
  const p = usePalette();
  const platformHost = displayHost(platform.url);
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: p.canvas,
          margin: 0,
          padding: `${signal.space.xl}px 0`,
          fontFamily: signal.font,
        }}
      >
        <Container
          style={{
            backgroundColor: p.paper,
            border: `1px solid ${p.line}`,
            borderRadius: signal.radius.card,
            margin: '0 auto',
            maxWidth: 600,
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {/* Ink masthead — the wordmark, not a hairline bar. */}
          <Section style={{ backgroundColor: p.ink, padding: '20px 32px' }}>
            <Row>
              <Column style={{ verticalAlign: 'middle' }}>
                <PlatformWordmark
                  inkColor={p.inkContent}
                  accentColor={p.accent}
                  style={{
                    fontFamily: signal.font,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                  }}
                />
              </Column>
              {mastheadRight ? (
                <Column style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                  <span
                    style={{
                      fontFamily: signal.mono,
                      fontSize: 12,
                      letterSpacing: '0.02em',
                      color: p.inkMeta,
                    }}
                  >
                    {mastheadRight}
                  </span>
                </Column>
              ) : null}
            </Row>
          </Section>

          {/* Body */}
          <Section style={{ padding: '34px 32px' }}>{children}</Section>

          {/* Footer well */}
          <Section
            style={{
              backgroundColor: p.well,
              borderTop: `1px solid ${p.line}`,
              padding: '22px 32px 26px',
            }}
          >
            {footerLinks && footerLinks.length > 0 ? (
              <Section style={{ marginBottom: 12 }}>
                {footerLinks.map((l, i) => (
                  <Link key={i} href={l.href} style={{ ...footerLinkStyle(p), marginRight: 18 }}>
                    {l.label}
                  </Link>
                ))}
              </Section>
            ) : null}
            {footerReason ? (
              <EmailMuted style={{ margin: 0, color: p.meta }}>{footerReason}</EmailMuted>
            ) : null}
            <EmailMuted
              style={{ margin: `${footerReason ? signal.space.xs : 0}px 0 0`, color: p.meta }}
            >
              {platformHost ? `WizeWorks, Inc. · ${platformHost}` : 'WizeWorks, Inc.'}
            </EmailMuted>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
