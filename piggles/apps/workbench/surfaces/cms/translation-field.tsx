'use client';

// One field, the shop's own words beside the translation.
//
// Split from `translation-detail.tsx` under RULE #0.5. An editor that opened with
// only empty boxes would give you nothing to translate against, so the source is
// always on the left — read-only, because a product's own copy is not a
// translation and is edited on the product itself.

import { Field, FieldControl, FieldDescription, FieldLabel, Text } from '@wizeworks/silicaui-react';

export function TranslatedField({
  label,
  source,
  sourceEmpty,
  description,
  children,
}: {
  label: string;
  source: string | null;
  sourceEmpty: string;
  description: string;
  /** The editable control for the translation — an <Input> or <Textarea>. A
   *  single element, because it is handed straight to FieldControl's `render`. */
  children: React.ReactElement<Record<string, unknown>>;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid gap-2 @2xl:grid-cols-2 @2xl:gap-4">
        <div className="bg-base-200 flex flex-col gap-1 rounded-md p-3">
          <Text as="span" className="text-sm font-medium">
            Your words
          </Text>
          <Text className="text-base whitespace-pre-line">
            {source && source.trim() !== '' ? source : sourceEmpty}
          </Text>
        </div>
        <FieldControl render={children} />
      </div>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}
