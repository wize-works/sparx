import * as React from 'react';
import { Body, Container, Head, Html, Preview, Section } from '@react-email/components';
import { EmailDivider, EmailMuted, EmailWordmark } from '../components';
import { colors, fontFamily, spacing } from '../components/tokens';

// Shared email frame. The header (wordmark + divider) and footer (divider
// + muted note) are baked in here so every template inherits brand chrome
// — callers just compose body content as children.
//
// Hand-rolled HTML/CSS via @react-email/components: the rendered output is
// table-based markup that survives every popular mail client. All colors
// + spacing pull from components/tokens.ts — never inline a hex string in
// this file directly.

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  /** Brief tagline rendered in the footer. Defaults to the WizeWorks line. */
  footerNote?: string;
}

export function EmailLayout({ preview, children, footerNote }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.surfaceMuted,
          margin: 0,
          padding: `${spacing.xl}px 0`,
          fontFamily,
        }}
      >
        <Container
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            margin: '0 auto',
            maxWidth: 560,
            padding: `${spacing.xl}px`,
          }}
        >
          <Section>
            <EmailWordmark />
          </Section>

          <EmailDivider />

          {children}

          <EmailDivider />

          <EmailMuted>
            {footerNote ?? 'Sparx is the merchant operating system from WizeWorks.'}
          </EmailMuted>
        </Container>
      </Body>
    </Html>
  );
}
