'use client';

// A product that cannot be bought at all.

import { useState } from 'react';
import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  useToast,
} from '@wizeworks/silicaui-react';

import { FormSection } from '../../../components/form-section';
import { MoneyInput } from '../../../components/money-input';
import { cents } from './draft';
import { suggestSlotSku, type Slot } from './slots';
import { productErrorMessage, type ProductOption, type useCreateVariant } from '../products-data';

export function NoPriceYet({
  axes,
  slots,
  stem,
  onCreated,
}: {
  axes: ProductOption[];
  slots: Slot[];
  /** The code this product already carries. On a product with no version at all
   *  — which is the only way this section is reached — `skuStem` falls back to
   *  the product's web address, so the offer is the same one it always was. */
  stem: string;
  onCreated: ReturnType<typeof useCreateVariant>;
}) {
  const toast = useToast();
  const [sku, setSku] = useState(() =>
    axes.length > 0 && slots[0] ? suggestSlotSku(stem, slots[0], new Set()) : stem
  );
  const [price, setPrice] = useState(0);

  const slot = slots[0] ?? null;
  const problem = sku.trim() === '' ? 'Give this version a code.' : null;

  return (
    <FormSection
      title="This product has no price"
      description="Nobody can buy it until it has one. This normally means something went wrong while it was being added."
    >
      <Field>
        <FieldLabel>Price</FieldLabel>
        <FieldControl
          render={
            <MoneyInput color="module" value={price} aria-label="Price" onValueChange={setPrice} />
          }
        />
        <FieldDescription>What a shopper pays. You can change it any time.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Product code</FieldLabel>
        <FieldControl
          render={
            <Input
              color={problem ? 'error' : 'module'}
              value={sku}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setSku(event.target.value);
              }}
            />
          }
        />
        {problem ? (
          <FieldStatus status="error">{problem}</FieldStatus>
        ) : (
          <FieldDescription>
            Your own reference for this version — on labels, on invoices, in your records.
          </FieldDescription>
        )}
      </Field>
      <div className="flex justify-end">
        <Button
          size="sm"
          color="module"
          disabled={problem !== null}
          loading={onCreated.isPending}
          onClick={() => {
            onCreated.mutate(
              {
                sku: sku.trim(),
                priceCents: cents(price),
                isDefault: true,
                ...(slot ? { optionValueIds: slot.coordinate.map((point) => point.valueId) } : {}),
              },
              {
                onSuccess: () => {
                  toast.add({ title: 'This product can be bought now', type: 'success' });
                },
                onError: (error) => {
                  toast.add({
                    title: 'Could not set a price',
                    description: productErrorMessage(error, 'Nothing was created.'),
                    type: 'error',
                  });
                },
              }
            );
          }}
        >
          Set this price
        </Button>
      </div>
    </FormSection>
  );
}
