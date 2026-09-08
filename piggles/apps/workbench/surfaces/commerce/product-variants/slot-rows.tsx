'use client';

// A combination with nothing on sale in it. Two different situations, and they
// need two different offers: one has never had a version, the other has one
// waiting to be brought back.

import { useState } from 'react';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { faRotateLeft } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';

import { MoneyInput } from '../../../components/money-input';
import { cents } from './draft';
import { slotLabel, suggestSlotSku, type Slot } from './slots';
import {
  formatCents,
  productErrorMessage,
  type Variant,
  type useCreateVariant,
} from '../products-data';

const ROW = 'border-base-300 flex flex-wrap items-center gap-2 border-b pb-2 last:border-b-0';

/**
 * This combination is not empty — its versions were retired and still hold their
 * codes and prices. So the offer is to bring one back, never to make a new one
 * on top of them.
 *
 * One row EACH when a square holds more than one, with the code shown so they can
 * be told apart. Two stopped versions on one square is what repairing a damaged
 * shop produces, and offering only the first picked by array order which price,
 * code and stock she was handed (issue 306).
 */
export function RetiredSlotRows({
  slot,
  busy,
  onRestore,
}: {
  slot: Slot;
  busy: boolean;
  onRestore: (variant: Variant) => void;
}) {
  const several = slot.retired.length > 1;
  return (
    <>
      {slot.retired.map((variant) => (
        <div className={ROW} key={variant.id}>
          <Text className="min-w-0 flex-1">
            {slotLabel(slot)}
            {several ? ` · ${variant.sku}` : null}
          </Text>
          <Text as="span" className="tabular-nums">
            {formatCents(variant.priceCents, variant.currency)}
          </Text>
          <Badge color="neutral" variant="soft" size="sm">
            Not sold
          </Badge>
          <Button
            size="sm"
            variant="outline"
            color="module"
            loading={busy}
            onClick={() => {
              onRestore(variant);
            }}
          >
            <Icon glyph={faRotateLeft} className="size-4" aria-hidden />
            Sell it again
          </Button>
        </div>
      ))}
    </>
  );
}

/** A combination nobody can buy yet, and nobody ever could. */
export function EmptySlotRow({
  slot,
  stem,
  taken,
  create,
}: {
  slot: Slot;
  /** The code this product already carries — see `skuStem`. */
  stem: string;
  /** Every code this product already holds, live or retired. Offering one that
   *  is taken pre-fills the field with a code the server will refuse. */
  taken: Set<string>;
  create: ReturnType<typeof useCreateVariant>;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState(0);

  if (!adding) {
    return (
      <div className={ROW}>
        <Text className="min-w-0 flex-1">{slotLabel(slot)}</Text>
        <Badge color="warning" variant="soft" size="sm">
          No price
        </Badge>
        <Button
          size="sm"
          variant="outline"
          color="module"
          onClick={() => {
            setSku(suggestSlotSku(stem, slot, taken));
            setAdding(true);
          }}
        >
          Set a price
        </Button>
      </div>
    );
  }

  const problem = sku.trim() === '' ? 'Give this version a code.' : null;

  return (
    <div className="border-base-300 flex flex-col gap-3 border-b pb-3 last:border-b-0">
      <Heading level={3} className="text-base font-semibold">
        {slotLabel(slot)}
      </Heading>
      <div className="flex flex-col gap-3 @md:flex-row">
        <Field className="min-w-0 flex-1">
          <FieldLabel>Price</FieldLabel>
          <FieldControl
            render={
              <MoneyInput
                color="module"
                value={price}
                aria-label={`Price for ${slotLabel(slot)}`}
                onValueChange={setPrice}
              />
            }
          />
        </Field>
        <Field className="min-w-0 flex-1">
          <FieldLabel>Product code</FieldLabel>
          <FieldControl
            render={
              <Input
                color={problem ? 'error' : 'module'}
                size="sm"
                value={sku}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => {
                  setSku(event.target.value);
                }}
              />
            }
          />
          {problem ? <FieldStatus status="error">{problem}</FieldStatus> : null}
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          onClick={() => {
            setAdding(false);
          }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          color="module"
          disabled={problem !== null}
          loading={create.isPending}
          onClick={() => {
            create.mutate(
              {
                sku: sku.trim(),
                priceCents: cents(price),
                optionValueIds: slot.coordinate.map((point) => point.valueId),
              },
              {
                onSuccess: () => {
                  setAdding(false);
                  toast.add({ title: `${slotLabel(slot)} can be bought now`, type: 'success' });
                },
                onError: (error) => {
                  toast.add({
                    title: 'Could not add that version',
                    description: productErrorMessage(error, 'Nothing was created.'),
                    type: 'error',
                  });
                },
              }
            );
          }}
        >
          Add it
        </Button>
      </div>
    </div>
  );
}
