import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import { EmailHeading, EmailMuted, EmailParagraph } from '../components';

// Confirmation to the applicant right after they submit on /careers. Honest,
// founder-to-candidate tone: we're small and pre-seed, so we set the right
// expectation (a real human reads it) rather than promising an ATS-grade funnel.
export interface JobApplicationConfirmationEmailProps {
  applicantName?: string;
  roleTitle: string;
}

export function JobApplicationConfirmationEmail({
  applicantName,
  roleTitle,
}: JobApplicationConfirmationEmailProps) {
  return (
    <EmailLayout
      // Somebody applying to work at WizeWorks.
      audience="platform"
      preview={`We got your application — ${roleTitle}`}
    >
      <Section>
        <EmailHeading>Thanks — we&rsquo;ve got it</EmailHeading>
        <EmailParagraph>{applicantName ? `Hi ${applicantName},` : 'Hi there,'}</EmailParagraph>
        <EmailParagraph>
          Your application for <strong>{roleTitle}</strong> landed with us. A real person on the
          team reads every one — not a filter — so give us a few days.
        </EmailParagraph>
        <EmailParagraph>
          We&rsquo;re a small, early team building sparx, so we&rsquo;ll only reach out if
          there&rsquo;s a fit worth both our time. Either way, thank you for wanting to build with
          us.
        </EmailParagraph>
        <EmailParagraph flush>— The sparx team</EmailParagraph>
        <EmailMuted>
          You&rsquo;re getting this because you applied at sparx.works/careers. No list, no
          follow-up spam.
        </EmailMuted>
      </Section>
    </EmailLayout>
  );
}

export function jobApplicationConfirmationSubject(roleTitle: string): string {
  return `We got your application — ${roleTitle}`;
}
