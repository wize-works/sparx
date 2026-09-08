'use client';

// What the editor needs to say before the form starts: what a discount is (on
// a new one), a save that failed, and the warning that this offer is a kind the
// screen cannot fully edit.

import { Alert, AlertContent, AlertDescription, AlertTitle, Text } from '@wizeworks/silicaui-react';
import { CREATABLE_TYPES, TYPE_LABELS } from './discount-draft';
import type { DiscountType } from './discounts-data';
import { SaveFailure } from '@/components/save-failure';

export function DiscountNotices({
  isNew,
  failure,
  type,
}: {
  isNew: boolean;
  failure: string | null;
  type: DiscountType;
}) {
  const canCreateType = CREATABLE_TYPES.includes(type);

  return (
    <>
      {isNew ? (
        <Text>
          A discount lowers what a shopper pays. Give it a code they type at checkout, or make it
          automatic so it applies on its own to every order that qualifies.
        </Text>
      ) : null}

      <SaveFailure title="Could not save this discount" message={failure} />

      {canCreateType ? null : (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>This is a {TYPE_LABELS[type].toLowerCase()}</AlertTitle>
            <AlertDescription>
              That kind of offer is set up with product choices this screen does not show. You can
              still edit its name, code, schedule and limits here — the offer itself is kept exactly
              as it is.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}
    </>
  );
}
