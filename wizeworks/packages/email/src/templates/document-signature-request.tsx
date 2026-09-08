import * as React from 'react';
import { EmailLayout } from './_layout';
import {
  EmailActionButton,
  EmailAmountHero,
  EmailDisplayHeading,
  EmailFinePrint,
  EmailParagraph,
} from '../components';

export interface DocumentSignatureRequestEmailProps {
  /** The signer's name (falls back to "there"). */
  signerName?: string;
  /** THE BUSINESS ASKING FOR THE SIGNATURE. This email named no sender at all --
   *  it said "your estimate is ready" under OUR wordmark, to somebody who has
   *  never heard of us, with a link asking them to sign something. Nullable
   *  defensively; the copy falls back to naming no one rather than guessing. */
  fromName?: string | null;
  /** Human label for the document, e.g. "Estimate", "Quote", "Work Order". */
  documentLabel: string;
  /** The document's number/reference, e.g. "EST-1042". */
  documentNumber: string;
  /** The document total, in major units (already divided), e.g. 1499.0. */
  documentTotal: number;
  /** ISO currency code, e.g. "USD". */
  currency: string;
  /** ISO-8601 expiry — the signing link stops working after this. */
  expiresAt: string;
  /** The signing URL (may be an absolute URL OR a bare path). */
  signingUrl: string;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatExpiry(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(t));
}

// A tenant → their-customer signing request (a quote/estimate/work-order awaiting a
// signature). Published today from `signature-mail.ts` but had NO template — so the
// send silently dropped in the worker. This restores it. (It renders in sparx chrome
// for now; the per-tenant brand pass will re-skin the tenant-facing templates.)
export function DocumentSignatureRequestEmail({
  signerName,
  documentLabel,
  documentNumber,
  documentTotal,
  currency,
  expiresAt,
  signingUrl,
  fromName,
}: DocumentSignatureRequestEmailProps) {
  const label = documentLabel || 'document';
  const from = (fromName ?? '').trim() || null;
  const expiryLabel = formatExpiry(expiresAt);
  return (
    // A TENANT send. This was on the platform chassis, so a customer asked to
    // sign a stranger's estimate got our wordmark over it and our operating
    // company in the fine print -- the exact reading the invoice template
    // removed its own masthead to avoid, on the one email that also asks the
    // reader to click a link and put their name to something.
    <EmailLayout
      audience="visitor"
      preview={
        from
          ? `${from} sent you ${label.toLowerCase()} ${documentNumber} to sign`
          : `${label} ${documentNumber} is ready for your signature`
      }
      footerNote={
        from
          ? `${from} asked you to sign ${label.toLowerCase()} ${documentNumber}.`
          : `You're receiving this because a ${label.toLowerCase()} was sent to you for signature.`
      }
    >
      <EmailDisplayHeading>
        {from ? `${label} from ${from}` : 'Please review and sign'}
      </EmailDisplayHeading>
      <EmailParagraph>
        Hi {signerName ?? 'there'}, {from ? `${from} has sent you ` : 'your '}
        <strong>
          {label} {documentNumber}
        </strong>{' '}
        to sign. Take a moment to review it and add your signature — it only takes a minute.
      </EmailParagraph>

      <EmailAmountHero
        amount={formatMoney(documentTotal, currency)}
        caption={`${label} ${documentNumber}`}
        status={{ label: 'Awaiting signature', tone: 'info' }}
      />

      <EmailActionButton href={signingUrl}>Review &amp; sign</EmailActionButton>

      <EmailFinePrint>
        {expiryLabel
          ? `This signing link is valid until ${expiryLabel}.`
          : 'This signing link will expire, so please sign soon.'}
      </EmailFinePrint>
    </EmailLayout>
  );
}

export function documentSignatureRequestSubject(
  documentLabel: string,
  documentNumber: string,
  fromName?: string | null
): string {
  const label = documentLabel || 'Document';
  // The business first when we know it: a subject line naming nobody, asking a
  // stranger to sign something, is what a phishing attempt looks like.
  const from = (fromName ?? '').trim();
  return from
    ? `${label} ${documentNumber} from ${from} — ready for your signature`
    : `${label} ${documentNumber} — ready for your signature`;
}
