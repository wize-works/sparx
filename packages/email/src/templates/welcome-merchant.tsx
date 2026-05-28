import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import { EmailButton, EmailHeading, EmailParagraph } from '../components';

export interface WelcomeMerchantEmailProps {
  /** Owner's first name (falls back to "there"). */
  name?: string;
  /** Merchant's store name — the tenant they just created. */
  storeName: string;
  /** Where to send them to finish onboarding. */
  dashboardUrl: string;
}

export function WelcomeMerchantEmail({ name, storeName, dashboardUrl }: WelcomeMerchantEmailProps) {
  return (
    <EmailLayout preview={`Welcome to Sparx, ${storeName}`}>
      <Section>
        <EmailHeading>Welcome to Sparx</EmailHeading>
        <EmailParagraph>Hi {name ?? 'there'},</EmailParagraph>
        <EmailParagraph>
          {storeName} is live on Sparx. A short checklist is waiting in your dashboard — confirm
          your store details, add your first page, and pick a theme when the Sitebuilder module
          ships. You can finish it now or come back anytime.
        </EmailParagraph>
        <EmailButton href={dashboardUrl}>Open dashboard</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export const welcomeMerchantSubject = 'Welcome to Sparx';
