import * as React from 'react';
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';

// Shared email frame. Hand-rolled HTML/CSS — React Email's components emit
// table-based markup that survives every popular mail client. Brand colors are
// inlined hex (NOT CSS variables) because email clients strip <style> blocks.

const sparxIndigo = '#6366F1';
const textPrimary = '#0F172A';
const textMuted = '#64748B';
const borderColor = '#E2E8F0';
const bgPage = '#F8FAFC';

interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  /** Brief tagline rendered under the wordmark — e.g. "Sparx Commerce OS". */
  footerNote?: string;
}

export function EmailLayout({ preview, children, footerNote }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: bgPage,
          margin: 0,
          padding: '32px 0',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <Container
          style={{
            backgroundColor: '#FFFFFF',
            border: `1px solid ${borderColor}`,
            borderRadius: 8,
            margin: '0 auto',
            maxWidth: 560,
            padding: '32px',
          }}
        >
          <Section>
            <Text
              style={{
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: '-0.03em',
                margin: 0,
                color: textPrimary,
              }}
            >
              Spar<span style={{ color: sparxIndigo }}>x</span>
            </Text>
          </Section>

          <Hr style={{ borderColor, margin: '24px 0' }} />

          {children}

          <Hr style={{ borderColor, margin: '32px 0 16px' }} />

          <Text style={{ color: textMuted, fontSize: 12, lineHeight: '18px', margin: 0 }}>
            {footerNote ?? 'Sparx is the merchant operating system from WizeWorks.'}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export { sparxIndigo, textMuted, textPrimary };
