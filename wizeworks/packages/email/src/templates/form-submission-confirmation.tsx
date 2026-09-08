import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import { EmailHeading, EmailParagraph } from '../components';

// Submitter-facing autoresponder (docs/115) — the confirmation reply a visitor
// gets after submitting a contact form, when the site owner enables it. The body
// is the owner-authored `message`; the subject is the owner-authored `subject`.
export interface FormSubmissionConfirmationEmailProps {
  /** The customer-facing site name (Property.name). Nullable defensively (see the
   *  notification template) — falls back to a neutral sign-off. */
  siteName?: string | null;
  name?: string | null;
  /** Owner-authored subject line (passed through to the send subject). Nullable — if the
   *  autoresponder was enabled without a custom subject, a default is used. */
  subject?: string | null;
  /** Owner-authored confirmation body. Nullable — falls back to a neutral acknowledgement. */
  message?: string | null;
}

export function FormSubmissionConfirmationEmail({
  siteName,
  name,
  message,
}: FormSubmissionConfirmationEmailProps) {
  const site = siteName ?? '';
  const body =
    message ??
    'Thanks for getting in touch — we’ve received your message and will be in touch soon.';
  return (
    <EmailLayout
      // The visitor filled in a form on the TENANT's site.
      audience="visitor"
      preview={site ? `Thanks for contacting ${site}` : 'Thanks for getting in touch'}
    >
      <Section>
        <EmailHeading>Thanks{name ? `, ${name}` : ''}</EmailHeading>
        <EmailParagraph>{body}</EmailParagraph>
        <EmailParagraph>{site ? `— The ${site} team` : '— Thanks again'}</EmailParagraph>
      </Section>
    </EmailLayout>
  );
}

export function formSubmissionConfirmationSubject(subject?: string | null): string {
  return subject ?? 'Thanks for reaching out';
}
