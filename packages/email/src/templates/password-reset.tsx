import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import { EmailButton, EmailHeading, EmailLink, EmailMuted, EmailParagraph } from '../components';

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
  return (
    <EmailLayout preview="Reset your Sparx password">
      <Section>
        <EmailHeading>Reset your password</EmailHeading>
        <EmailParagraph>{name ? `Hi ${name},` : 'Hi there,'}</EmailParagraph>
        <EmailParagraph>
          We received a request to reset the password on your Sparx account. Click the button below
          to choose a new one. The link expires in {expiresInMinutes} minutes.
        </EmailParagraph>
        <EmailButton href={resetUrl}>Reset password</EmailButton>
        <EmailMuted>If the button doesn&apos;t work, paste this URL into your browser:</EmailMuted>
        <EmailParagraph flush>
          <EmailLink href={resetUrl}>{resetUrl}</EmailLink>
        </EmailParagraph>
        <EmailMuted>
          If you didn&apos;t request this, you can safely ignore this email — no changes will be
          made.
        </EmailMuted>
      </Section>
    </EmailLayout>
  );
}

export const passwordResetSubject = 'Reset your Sparx password';
