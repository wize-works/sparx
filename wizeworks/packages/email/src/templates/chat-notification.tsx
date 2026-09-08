import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import { EmailButton, EmailCallout, EmailHeading, EmailMuted, EmailParagraph } from '../components';

// Live Chat — "you have a new chat message" staff notification (docs/69 A-6).
// Published as an `email.send` event by api-rest when an inbound customer
// message needs a human (AI disabled / escalated / outside hours) and no one is
// watching the inbox.

export interface ChatNotificationEmailProps {
  /** Name (or email) of the customer who messaged. */
  customerName: string;
  /** First ~200 chars of the customer's message. */
  messageSnippet: string;
  /** Deep link to the conversation in the dashboard inbox. */
  conversationUrl: string;
  /** Store name for the greeting. */
  siteName?: string;
}

export function ChatNotificationEmail({
  customerName,
  messageSnippet,
  conversationUrl,
  siteName,
}: ChatNotificationEmailProps) {
  return (
    <EmailLayout
      // Staff notification -- the shop OWNER reads this.
      audience="platform"
      preview={`New chat message from ${customerName}`}
    >
      <Section>
        <EmailHeading>New chat message</EmailHeading>
        <EmailParagraph>
          {customerName} started a conversation{siteName ? ` on ${siteName}` : ''} and is waiting
          for a reply.
        </EmailParagraph>
        <EmailCallout tone="info">{messageSnippet}</EmailCallout>
        <EmailButton href={conversationUrl}>Open conversation</EmailButton>
        <EmailMuted>
          You&apos;re receiving this because you&apos;re an admin on a store with Live Chat enabled.
          Manage notifications in your dashboard settings.
        </EmailMuted>
      </Section>
    </EmailLayout>
  );
}

export function chatNotificationSubject(customerName: string): string {
  return `New chat message from ${customerName}`;
}
