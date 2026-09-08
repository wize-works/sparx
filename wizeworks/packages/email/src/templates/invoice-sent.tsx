import * as React from 'react';
import { EmailLayout } from './_layout';
import {
  EmailAmountHero,
  EmailDisplayHeading,
  EmailFinePrint,
  EmailLineItems,
  EmailParagraph,
  type LineItem,
  type SummaryRow,
} from '../components';

export interface InvoiceSentEmailProps {
  /** Who is being billed, as printed on the document. */
  billToName?: string;
  /** The business doing the billing — the tenant's own name, never ours. */
  fromName: string;
  /** The tenant's word for this document: "Invoice", "Bill", "Statement". */
  documentLabel: string;
  /** e.g. "INV-000001". */
  documentNumber: string;
  /** Major units, already divided. */
  total: number;
  /** What is still owed — differs from `total` once a part payment is in. */
  balance: number;
  currency: string;
  /** ISO-8601. Absent when the business agreed no terms: the email then says
   *  nothing about when it is due rather than inventing a date. */
  dueAt?: string | null;
  /** The lines, as they appear on the document. */
  lines: LineItem[];
  summary: SummaryRow[];
  /** The note the business wrote on the document, if any. */
  note?: string | null;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(t));
}

// A tenant → their-customer invoice.
//
// ── WHY THE INVOICE IS IN THE EMAIL ─────────────────────────────────────────
//
// There is no public invoice page and no attachment on the event path, so a
// mail that only announced an invoice would be an announcement of something the
// recipient cannot see. Everything they need to check it — who it is from, the
// number, the lines, the total, what is still owed and when — is in the body,
// which is also what a café's bookkeeper actually wants: a thing they can read
// on a phone and forward, not a link behind a login.
//
// ── WHY IT NAMES THE BUSINESS AND NOT US ────────────────────────────────────
//
// The customer has never heard of the platform and is not our customer. Every
// sentence names the tenant: `fromName` is the bakery, and the words avoid any
// claim about who processes the money, because on manual payments nobody does.
export function InvoiceSentEmail({
  billToName,
  fromName,
  documentLabel,
  documentNumber,
  total,
  balance,
  currency,
  dueAt,
  lines,
  summary,
  note,
}: InvoiceSentEmailProps) {
  const label = documentLabel || 'Invoice';
  const due = dueAt ? formatDate(dueAt) : null;
  // Once part of it is paid, the number that matters is what is LEFT — showing
  // the full total as the headline would ask for money already handed over.
  const outstanding = balance > 0 && balance < total;
  return (
    // EmailLayout, not PlatformEmailLayout: this is a TENANT send. The platform
    // chassis puts OUR wordmark in the masthead, and the person reading this has
    // never heard of us — an invoice from a bakery headed with a software
    // product's name reads like a billing service nobody hired, or a scam. The
    // tenant frame signs it with the business's own name instead.
    <EmailLayout
      preview={`${label} ${documentNumber} from ${fromName} — ${formatMoney(balance, currency)}`}
      footerNote={`${fromName} sent you ${label.toLowerCase()} ${documentNumber}.`}
      // No masthead, and no operator in the fine print. `EmailWordmark` paints
      // the PLATFORM's wordmark, and the person reading this bought bread from a
      // bakery — a software product's name over their invoice reads like a
      // billing service nobody hired. The business names itself in the heading
      // and the first sentence instead, which is what a paper invoice does.
      //
      // This used to be `header={false}`, a lever only THIS template ever
      // pulled — so the masthead was right here and wrong on every other
      // visitor-facing send, and the footer went on naming the operating company
      // to a stranger regardless. Audience decides both now.
      audience="visitor"
    >
      <EmailDisplayHeading>
        {label} from {fromName}
      </EmailDisplayHeading>
      <EmailParagraph>
        Hi {billToName ?? 'there'}, here is {label.toLowerCase()} <strong>{documentNumber}</strong>{' '}
        from {fromName}.{due ? ` It is due by ${due}.` : ''}
      </EmailParagraph>

      <EmailAmountHero
        amount={formatMoney(balance, currency)}
        caption={
          outstanding
            ? `Still owed of ${formatMoney(total, currency)}`
            : `${label} ${documentNumber}`
        }
        status={{ label: due ? `Due ${due}` : 'Due on receipt', tone: 'info' }}
      />

      <EmailLineItems
        items={lines}
        summary={summary}
        total={{
          label: outstanding ? 'Still owed' : 'Total',
          value: formatMoney(balance, currency),
        }}
      />

      {note ? <EmailParagraph>{note}</EmailParagraph> : null}

      <EmailFinePrint>
        Questions about this {label.toLowerCase()}? Reply to this email and it goes straight to{' '}
        {fromName}.
      </EmailFinePrint>
    </EmailLayout>
  );
}

export function invoiceSentSubject(
  documentLabel: string,
  documentNumber: string,
  fromName: string
): string {
  const label = documentLabel || 'Invoice';
  return `${label} ${documentNumber} from ${fromName}`;
}
