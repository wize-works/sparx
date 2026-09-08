'use client';

// The grid, grouped by the first choice.

import { useMemo } from 'react';

import { FormSection } from '../../../components/form-section';
import { slotLabel, type Slot } from './slots';
import { EmptySlotRow, RetiredSlotRows } from './slot-rows';
import { VariantRow, type RowProps } from './variant-row';
import type { ProductOption, Variant, useCreateVariant } from '../products-data';

/**
 * A card per value of the FIRST choice, a row per combination inside it.
 *
 * Not a table: a grouped table repeats its header row per group, and a one-line
 * thing with a price on it does not need columns invented to justify them. The
 * card heading carries "Red" once and the rows underneath carry the rest of the
 * coordinate — which is also the only shape that survives a pane docked at 320px.
 */
export function GroupedGrid({
  slots,
  axes,
  rowProps,
  stem,
  taken,
  create,
  restoring,
  onRestore,
}: {
  slots: Slot[];
  axes: ProductOption[];
  rowProps: RowProps;
  /** The code this product already carries, and every code it already holds —
   *  both worked out once in `useVariantsTab` (issue 172). */
  stem: string;
  taken: Set<string>;
  create: ReturnType<typeof useCreateVariant>;
  restoring: boolean;
  onRestore: (variant: Variant) => void;
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, { title: string; slots: Slot[] }>();
    for (const slot of slots) {
      const head = slot.coordinate[0];
      const grouping = axes.length > 1 && head !== undefined;
      const key = grouping ? head.valueId : 'all';
      const title = grouping ? `${head.optionName}: ${head.valueText}` : 'Every version';
      const bucket = groups.get(key) ?? { title, slots: [] };
      bucket.slots.push(slot);
      groups.set(key, bucket);
    }
    return [...groups.values()];
  }, [slots, axes]);

  return (
    <>
      {grouped.map((group) => (
        <FormSection key={group.title} title={group.title}>
          {group.slots.map((slot) => {
            if (slot.variant) {
              return (
                <VariantRow
                  key={slot.key}
                  variant={slot.variant}
                  label={slotLabel(slot)}
                  {...rowProps}
                />
              );
            }
            if (slot.retired.length > 0) {
              return (
                <RetiredSlotRows
                  key={slot.key}
                  slot={slot}
                  busy={restoring}
                  onRestore={onRestore}
                />
              );
            }
            return (
              <EmptySlotRow key={slot.key} slot={slot} stem={stem} taken={taken} create={create} />
            );
          })}
        </FormSection>
      ))}
    </>
  );
}
