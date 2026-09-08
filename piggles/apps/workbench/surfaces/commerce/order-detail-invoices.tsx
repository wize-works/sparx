'use client';

// Asking the customer for the money.
//
// A shop with no payment provider takes none at checkout — its last screen says
// so, in as many words: "Placing this order does not take any money now. We'll
// be in touch about paying for it." The goods then go out and the shop has to be
// in touch. This is where it is.
//
// Before this existed the owner could raise an invoice, but only by opening the
// order, reading the items, going to the Invoices screen, finding the customer
// again and retyping every line by hand — and when the customer paid it, this
// order still read "Not paid", because nothing joined the two.

import { Badge, Button } from '@wizeworks/silicaui-react';
import { useToast } from '@wizeworks/silicaui-react';

import { SubSection } from './order-detail-blocks';
import {
  formatDate,
  formatMoney,
  orderErrorMessage,
  useCreateInvoiceForOrder,
  useOrderInvoices,
  type Order,
  type OrderInvoice,
} from './data';
import type { SurfaceContext } from '../../lib/surfaces/registry';

/** An invoice's AR state in the words a shop uses, with the colour that carries
 *  the same meaning everywhere else on this pane. */
function invoiceState(invoice: OrderInvoice): { label: string; tone: string } {
  if (invoice.status === 'paid') return { label: 'Paid', tone: 'success' };
  if (invoice.status === 'void') return { label: 'Cancelled', tone: 'warning' };
  if (invoice.status === 'overdue') return { label: 'Late', tone: 'danger' };
  if (invoice.status === 'partial') return { label: 'Part paid', tone: 'info' };
  return { label: 'Waiting to be paid', tone: 'warning' };
}

function InvoiceRow({ invoice, ctx }: { invoice: OrderInvoice; ctx: SurfaceContext }) {
  const state = invoiceState(invoice);
  return (
    <li className="border-base-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Button
          variant="link"
          size="sm"
          className="self-start px-0 font-mono text-base"
          onClick={() => {
            ctx.open('invoicing.invoice.edit', { id: invoice.id });
          }}
        >
          {invoice.number ?? 'Not numbered yet'}
        </Button>
        <span className="text-sm">
          {formatMoney(invoice.total, invoice.currency)} asked for
          {invoice.amountPaid > 0
            ? ` · ${formatMoney(invoice.amountPaid, invoice.currency)} in`
            : ''}
        </span>
        {/* Whether the customer actually has it. Raising an invoice and emailing
            it are two acts, and this line used to print "Sent" off the date the
            document was CREATED — telling the owner her customer had a bill that
            had never left the building. */}
        {/* `break-words` because the address is one unbreakable token: at 360px a
            long one paints 30px past this box with nothing for the browser to
            wrap at. Ordinary words still break at spaces. Same shape as 379. */}
        <span className="text-sm break-words">
          {invoice.sentAt
            ? `Sent ${formatDate(invoice.sentAt)}${invoice.sentTo ? ` to ${invoice.sentTo}` : ''}`
            : 'Not sent yet · open it to email it'}
        </span>
        {/* The due date is the whole reason an invoice counts as late, so it says
            when there is one and says there is none when there is not — rather
            than leaving a blank an owner has to interpret. */}
        <span className="text-sm">
          {invoice.dueAt ? `Due ${formatDate(invoice.dueAt)}` : 'No deadline set'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {invoice.balance > 0 ? (
          <span className="font-medium tabular-nums">
            {formatMoney(invoice.balance, invoice.currency)} still owed
          </span>
        ) : null}
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </div>
    </li>
  );
}

/** Why there is nothing to ask for, when there is nothing to ask for — the same
 *  three refusals the server makes, said here so the button is simply absent
 *  rather than present and guaranteed to fail. A control whose only job is to
 *  return an error is worse than no control. */
function reasonNotToAsk(order: Order): string | null {
  if (order.status === 'cancelled') {
    return 'This order was cancelled, so there is nothing to ask for.';
  }
  if (order.status === 'refunded') {
    return 'This order was refunded, so there is nothing to ask for.';
  }
  if (order.total - order.amountPaid <= 0) return 'This order is paid in full.';
  return null;
}

export function InvoicesSection({ order, ctx }: { order: Order; ctx: SurfaceContext }) {
  const invoices = useOrderInvoices(order.id);
  const create = useCreateInvoiceForOrder(order.id);
  const toast = useToast();

  const rows = invoices.data ?? [];
  const blocked = reasonNotToAsk(order);
  const alreadyAsked = rows.some((i) => i.status !== 'void');

  return (
    <SubSection
      title="Asking for payment"
      description="The invoices you have raised for this order, whether they went out, and what has come back."
      isPending={invoices.isPending}
      isError={invoices.isError}
      errorText="We could not load the invoices just now. Anything already sent is unaffected — try reopening this order in a moment."
      emptyText={blocked ?? 'You have not asked for the money on this order yet.'}
      count={rows.length}
      footer={
        blocked || alreadyAsked ? null : (
          <div className="border-base-300 mt-4 border-t pt-4">
            <Button
              color="primary"
              size="sm"
              disabled={create.isPending}
              onClick={() => {
                create.mutate(
                  {},
                  {
                    onSuccess: (result) => {
                      toast.add({
                        title: result.document.number
                          ? `Invoice ${result.document.number} raised`
                          : 'Invoice raised',
                        description:
                          'Every line came across from this order. Open it to set a deadline and send it.',
                        type: 'success',
                      });
                      ctx.open('invoicing.invoice.edit', { id: result.document.id });
                    },
                    onError: (error) => {
                      toast.add({
                        title: 'Could not raise the invoice',
                        description: orderErrorMessage(
                          error,
                          'Nothing changed on this order. Try again in a moment.'
                        ),
                        type: 'error',
                      });
                    },
                  }
                );
              }}
            >
              Make an invoice
            </Button>
            <p className="mt-2 text-sm">
              Copies every line, the delivery charge and the tax from this order, so nothing has to
              be typed twice. Money already in comes across too.
            </p>
          </div>
        )
      }
    >
      <ul className="flex flex-col">
        {rows.map((invoice) => (
          <InvoiceRow key={invoice.id} invoice={invoice} ctx={ctx} />
        ))}
      </ul>
    </SubSection>
  );
}
