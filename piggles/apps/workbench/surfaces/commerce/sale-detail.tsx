'use client';

// TAKE A SALE — money over the counter, with nothing bought online.
//
// Who it was for, what they had, what they handed over. It writes a real order
// so the sale lands in Orders, in Payments, in what she is owed and in her
// takings, exactly like one placed on the website.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  useToast,
} from '@wizeworks/silicaui-react';
import { faCashRegister } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';

import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { afterPaneChange } from '../../lib/defer';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { CustomerPicker, type CustomerSummary } from '../invoicing/customer-picker';
import { orderErrorMessage } from './data';
import { SaleLines, salesTotal } from './sale-lines';
import { SalePayment } from './sale-payment';
import { useActivePropertyId } from '../../lib/api/shell-data';
import { useSellables, useTakeSale, type SaleLine, type Sellable } from './sale-data';
import { depositDue, dueDayLabel } from './sale-made-to-order';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function lineFrom(sellable: Sellable | null): SaleLine {
  const id = `l_${crypto.randomUUID().slice(0, 8)}`;
  if (!sellable) {
    return {
      id,
      name: '',
      quantity: 1,
      price: '0.00',
      sku: 'ITEM',
      productId: null,
      variantId: null,
      orderAheadDays: null,
    };
  }
  return {
    id,
    name: sellable.name,
    quantity: 1,
    price: (sellable.priceCents / 100).toFixed(2),
    sku: sellable.sku,
    productId: sellable.productId ?? null,
    variantId: sellable.variantId ?? null,
    orderAheadDays: sellable.orderAheadDays ?? null,
    ...(sellable.deposit ? { deposit: sellable.deposit } : {}),
  };
}

export function SaleDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const take = useTakeSale();
  const sellables = useSellables();
  const propertyId = useActivePropertyId();

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [paid, setPaid] = useState('');
  const [paidWith, setPaidWith] = useState('manual');
  const [paidNote, setPaidNote] = useState('');
  // Whether she has touched the amount. Until she does it tracks the total, so
  // adding a second thing to the sale does not leave the till short.
  const [amountTouched, setAmountTouched] = useState(false);

  const currency = 'USD';
  const total = useMemo(() => salesTotal(lines), [lines]);
  const dueDay = useMemo(() => dueDayLabel(lines), [lines]);
  // What the till offers to take. A deposit product asks for its deposit, not
  // the whole price — typing over a pre-filled total is how the wrong number
  // gets taken at a counter (issue 026).
  const asking = useMemo(() => depositDue(lines) ?? total, [lines, total]);

  useEffect(() => {
    ctx.setTitle('Take a sale');
  }, [ctx]);

  useEffect(() => {
    if (!amountTouched) setPaid(asking > 0 ? asking.toFixed(2) : '');
  }, [asking, amountTouched]);

  const started = customer !== null || lines.length > 0;
  useDirtySource(
    started && !take.isSuccess,
    'This sale has not been written down yet. Close anyway?'
  );

  const priced = lines.every((line) => Number.isFinite(Number(line.price)));
  const named = lines.every((line) => line.name.trim() !== '');
  const canSave =
    customer !== null && lines.length > 0 && priced && named && !take.isPending && !take.isSuccess;

  const addLine = (sellable: Sellable | null) => {
    setLines((current) => [...current, lineFrom(sellable)]);
  };

  const submit = () => {
    if (!canSave || !customer) return;
    take.mutate(
      {
        customerId: customer.id,
        currency,
        lines,
        paid: Number(paid) || 0,
        paidWith,
        paidNote,
        propertyId,
      },
      {
        onSuccess: (order) => {
          ctx.open('commerce.order.detail', { id: order.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: 'Sale written down', type: 'success' });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Sale actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={take.isPending}
            onClick={submit}
          >
            <Icon glyph={faCashRegister} className="size-4" aria-hidden />
            Write it down
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {take.isError ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>The sale was not written down</AlertTitle>
                <AlertDescription>
                  {orderErrorMessage(take.error, 'Nothing was recorded. Try again in a moment.')}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection
            title="Who it was for"
            description="The sale goes onto their record, so what they have spent with you stays true. Everyone who buys from you needs a record — add them in Customers if this is their first time."
          >
            <CustomerPicker
              value={customer?.id ?? null}
              onSelect={setCustomer}
              onClear={() => {
                setCustomer(null);
              }}
            />
          </FormSection>

          <SaleLines
            lines={lines}
            currency={currency}
            sellables={sellables.items}
            onAdd={addLine}
            onChange={(id, next) => {
              setLines((current) => current.map((line) => (line.id === id ? next : line)));
            }}
            onRemove={(id) => {
              setLines((current) => current.filter((line) => line.id !== id));
            }}
          />

          {/* Between the lines and the money, because it changes both: this
              sale is not handed over today, and a deposit is a part payment
              rather than a shortfall (issue 026). */}
          {dueDay ? (
            <Alert color="module" variant="soft">
              <AlertContent>
                <AlertTitle>Due {dueDay}</AlertTitle>
                <AlertDescription>
                  Something on this sale has to be made first, so it stays on your list until you
                  hand it over. Take a deposit now and the rest when they collect.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <SalePayment
            total={total}
            currency={currency}
            paid={paid}
            setPaid={(value) => {
              setAmountTouched(true);
              setPaid(value);
            }}
            paidWith={paidWith}
            setPaidWith={setPaidWith}
            paidNote={paidNote}
            setPaidNote={setPaidNote}
          />
        </div>
      </div>
    </div>
  );
}

export default SaleDetailSurface;
