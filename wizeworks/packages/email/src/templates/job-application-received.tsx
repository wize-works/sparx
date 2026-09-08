import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import {
  EmailButton,
  EmailCallout,
  EmailFieldPanel,
  EmailHeading,
  EmailLink,
  EmailMuted,
  EmailParagraph,
  type EmailFieldRow,
} from '../components';

// Internal notification to the sparx team when someone applies on /careers.
// Not a customer-facing email — it carries the applicant's details and a signed
// link to their résumé so a reviewer can act straight from the inbox.
export interface JobApplicationReceivedEmailProps {
  roleTitle: string;
  applicantName: string;
  applicantEmail: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  roleInterest?: string;
  coverLetter?: string;
  /** Short-lived signed URL to the résumé PDF (private bucket). */
  resumeUrl?: string;
  resumeFilename?: string;
}

export function JobApplicationReceivedEmail({
  roleTitle,
  applicantName,
  applicantEmail,
  phone,
  location,
  linkedinUrl,
  portfolioUrl,
  roleInterest,
  coverLetter,
  resumeUrl,
  resumeFilename,
}: JobApplicationReceivedEmailProps) {
  // The applicant's details as one scannable record, contact first so a reply or a
  // call is a glance away. Optional facts self-omit rather than leaving blank lines.
  const rows: EmailFieldRow[] = [
    { label: 'Applicant', value: applicantName },
    { label: 'Email', value: applicantEmail },
  ];
  if (phone?.trim()) rows.push({ label: 'Phone', value: phone });
  if (location?.trim()) rows.push({ label: 'Location', value: location });
  if (linkedinUrl?.trim()) rows.push({ label: 'LinkedIn', value: linkedinUrl });
  if (portfolioUrl?.trim()) rows.push({ label: 'Portfolio', value: portfolioUrl });
  if (roleInterest?.trim()) rows.push({ label: 'What they want to own', value: roleInterest });
  return (
    <EmailLayout
      // Our own hiring inbox.
      audience="platform"
      preview={`${applicantName} applied — ${roleTitle}`}
    >
      <Section>
        <EmailHeading>New application — {roleTitle}</EmailHeading>
        <EmailParagraph>
          {applicantName} just applied. Reply to this email to reach them at{' '}
          <EmailLink href={`mailto:${applicantEmail}`}>{applicantEmail}</EmailLink>.
        </EmailParagraph>

        <EmailFieldPanel rows={rows} />

        {coverLetter ? (
          <>
            <EmailMuted>Cover note</EmailMuted>
            <EmailCallout tone="info">{coverLetter}</EmailCallout>
          </>
        ) : null}

        {resumeUrl ? (
          <EmailButton href={resumeUrl}>
            View résumé{resumeFilename ? ` (${resumeFilename})` : ''}
          </EmailButton>
        ) : (
          <EmailMuted>No résumé attached.</EmailMuted>
        )}

        <EmailMuted>This is stored in the careers pipeline for the admin app.</EmailMuted>
      </Section>
    </EmailLayout>
  );
}

export function jobApplicationReceivedSubject(roleTitle: string): string {
  return `New application — ${roleTitle}`;
}
