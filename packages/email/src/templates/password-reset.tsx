import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout, sparxIndigo, textMuted, textPrimary } from './_layout';

export interface PasswordResetEmailProps {
  /** Recipient's name; falls back to "there" if unknown. */
  name?: string;
  resetUrl: string;
  /** How long the link is valid for, surfaced to the recipient. */
  expiresInMinutes?: number;
}

export function PasswordResetEmail({
  name,
  resetUrl,
  expiresInMinutes = 60,
}: PasswordResetEmailProps) {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  return (
    <EmailLayout preview="Reset your Sparx password">
      <Section>
        <Heading style={{ color: textPrimary, fontSize: 20, fontWeight: 500, margin: '0 0 12px' }}>
          Reset your password
        </Heading>
        <Text style={{ color: textPrimary, fontSize: 14, lineHeight: '22px', margin: '0 0 16px' }}>
          {greeting}
        </Text>
        <Text style={{ color: textPrimary, fontSize: 14, lineHeight: '22px', margin: '0 0 24px' }}>
          We received a request to reset the password on your Sparx account. Click the button below
          to choose a new one. The link expires in {expiresInMinutes} minutes.
        </Text>
        <Button
          href={resetUrl}
          style={{
            backgroundColor: sparxIndigo,
            borderRadius: 6,
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 500,
            padding: '10px 18px',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Reset password
        </Button>
        <Text style={{ color: textMuted, fontSize: 12, lineHeight: '18px', margin: '24px 0 0' }}>
          If the button doesn&apos;t work, paste this URL into your browser:
        </Text>
        <Text
          style={{
            color: sparxIndigo,
            fontSize: 12,
            lineHeight: '18px',
            margin: '4px 0 0',
            wordBreak: 'break-all',
          }}
        >
          {resetUrl}
        </Text>
        <Text style={{ color: textMuted, fontSize: 12, lineHeight: '18px', margin: '24px 0 0' }}>
          If you didn&apos;t request this, you can safely ignore this email — no changes will be
          made.
        </Text>
      </Section>
    </EmailLayout>
  );
}

export const passwordResetSubject = 'Reset your Sparx password';

export function passwordResetText(props: PasswordResetEmailProps): string {
  const expires = props.expiresInMinutes ?? 60;
  return [
    `Hi ${props.name ?? 'there'},`,
    '',
    'We received a request to reset the password on your Sparx account.',
    `Open this URL in your browser to choose a new one (expires in ${expires} minutes):`,
    '',
    props.resetUrl,
    '',
    "If you didn't request this, ignore this email — no changes will be made.",
  ].join('\n');
}
