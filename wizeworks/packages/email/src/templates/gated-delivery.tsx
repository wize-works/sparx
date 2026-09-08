import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import { EmailButton, EmailHeading, EmailMuted, EmailParagraph } from '../components';

// The file somebody asked for, delivered (docs/151 §7, docs/152 C4).
//
// This email IS the gate. The asset sits in the private bucket and the only way
// to it is the signed link below, which is why "give us your email and we will
// send you the guide" is a real exchange rather than a formality in front of a
// public URL.
//
// The expiry is stated in the body on purpose. A link that silently stops
// working reads as a broken site; one that said "seven days" up front reads as a
// link that did what it told you it would, and the remedy — ask again on the
// site — is obvious rather than something to email support about.
export interface GatedDeliveryEmailProps {
  /** The customer-facing site name (Property.name). Nullable — falls back to a
   *  neutral sign-off, matching the other visitor-facing templates. */
  siteName?: string | null;
  name?: string | null;
  /** Owner-authored line above the button. */
  message?: string | null;
  /** What they are getting, for the button and the preview line. */
  filename: string;
  /** The signed, expiring download link. */
  url: string;
  /** How long it lasts, in days, said plainly in the body. */
  expiresInDays: number;
}

export function GatedDeliveryEmail({
  siteName,
  name,
  message,
  filename,
  url,
  expiresInDays,
}: GatedDeliveryEmailProps) {
  const site = siteName ?? '';
  const body =
    message ?? 'Thanks for asking — here is the file you wanted, ready whenever you are.';
  const days = expiresInDays === 1 ? '1 day' : `${String(expiresInDays)} days`;
  return (
    <EmailLayout
      // The visitor swapped their email address for a file on the TENANT's site.
      audience="visitor"
      preview={`Your download: ${filename}`}
    >
      <Section>
        <EmailHeading>Here it is{name ? `, ${name}` : ''}</EmailHeading>
        <EmailParagraph>{body}</EmailParagraph>
        <EmailButton href={url}>Download {filename}</EmailButton>
        <EmailMuted>
          This link works for the next {days}. If it runs out, just ask for it again on the site and
          we will send a fresh one.
        </EmailMuted>
        <EmailParagraph>{site ? `— The ${site} team` : '— Thanks again'}</EmailParagraph>
      </Section>
    </EmailLayout>
  );
}

export function gatedDeliverySubject(subject?: string | null): string {
  return subject ?? 'Here is your download';
}
