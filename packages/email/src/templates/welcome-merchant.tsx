import * as React from 'react';
import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout, sparxIndigo, textPrimary } from './_layout';

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
        <Heading style={{ color: textPrimary, fontSize: 20, fontWeight: 500, margin: '0 0 12px' }}>
          Welcome to Sparx
        </Heading>
        <Text style={{ color: textPrimary, fontSize: 14, lineHeight: '22px', margin: '0 0 16px' }}>
          Hi {name ?? 'there'},
        </Text>
        <Text style={{ color: textPrimary, fontSize: 14, lineHeight: '22px', margin: '0 0 16px' }}>
          {storeName} is live on Sparx. A short checklist is waiting in your dashboard — confirm
          your store details, add your first page, and pick a theme when the Sitebuilder module
          ships. You can finish it now or come back anytime.
        </Text>
        <Button
          href={dashboardUrl}
          style={{
            backgroundColor: sparxIndigo,
            borderRadius: 6,
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 500,
            padding: '10px 18px',
            textDecoration: 'none',
            display: 'inline-block',
            margin: '8px 0',
          }}
        >
          Open dashboard
        </Button>
      </Section>
    </EmailLayout>
  );
}

export const welcomeMerchantSubject = 'Welcome to Sparx';

export function welcomeMerchantText(props: WelcomeMerchantEmailProps): string {
  return [
    `Hi ${props.name ?? 'there'},`,
    '',
    `${props.storeName} is live on Sparx. A short checklist is waiting in your dashboard —`,
    'confirm your store details, add your first page, and pick a theme when the Sitebuilder',
    'module ships.',
    '',
    `Open the dashboard: ${props.dashboardUrl}`,
  ].join('\n');
}
