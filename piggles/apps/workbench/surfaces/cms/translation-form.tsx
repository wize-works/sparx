'use client';

// One language's four fields, and the way to remove it.
//
// Split from `translation-editor.tsx` under RULE #0.5. Presentational: every
// value and every handler is passed in, so the draft bookkeeping stays in one
// place rather than being split across two components that both own a field.

import { Badge, Button, Input, Text, Textarea } from '@wizeworks/silicaui-react';
import { faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { FormSection } from '../../components/form-section';
import { TranslatedField } from './translation-field';
import { localeName, type ProductSource } from './translations-data';

/** The four fields a language carries. Empty means "cleared". */
export interface Draft {
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
}

export function LanguageForm({
  locale,
  isNew,
  product,
  draft,
  onChange,
  removing,
  onRemove,
}: {
  locale: string;
  /** Added in this pane and not saved yet — the badge and the remove button both
   *  change, because discarding a draft loses nothing a reader can see. */
  isNew: boolean;
  product: ProductSource;
  draft: Draft;
  onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <FormSection
      title={localeName(locale)}
      description={`Shown to anyone reading your site in ${localeName(locale)}. Anything you leave empty falls back to your own words.`}
      action={
        <Badge color={isNew ? 'warning' : 'success'} variant="soft">
          {isNew ? 'Not saved yet' : locale}
        </Badge>
      }
    >
      <TranslatedField
        label="Name"
        source={product.title}
        sourceEmpty="This product has no name."
        description="Required — a language with no name for the product cannot be saved."
      >
        <Input
          color="module"
          value={draft.title}
          placeholder={product.title}
          onChange={(event) => {
            onChange('title', event.target.value);
          }}
        />
      </TranslatedField>

      <TranslatedField
        label="Description"
        source={product.description}
        sourceEmpty="This product has no description yet."
        description="Leave it empty and readers see your own description instead."
      >
        <Textarea
          color="module"
          rows={6}
          value={draft.description}
          placeholder={product.description ?? ''}
          onChange={(event) => {
            onChange('description', event.target.value);
          }}
        />
      </TranslatedField>

      <TranslatedField
        label="Title for search engines"
        source={product.seoTitle}
        sourceEmpty="Falls back to the name above."
        description="The heading someone sees on a results page, in this language."
      >
        <Input
          color="module"
          value={draft.seoTitle}
          placeholder={product.seoTitle ?? ''}
          onChange={(event) => {
            onChange('seoTitle', event.target.value);
          }}
        />
      </TranslatedField>

      <TranslatedField
        label="Summary for search engines"
        source={product.seoDescription}
        sourceEmpty="Falls back to your description."
        description="The couple of lines under the heading on a results page. Around 155 characters."
      >
        <Textarea
          color="module"
          rows={3}
          value={draft.seoDescription}
          placeholder={product.seoDescription ?? ''}
          onChange={(event) => {
            onChange('seoDescription', event.target.value);
          }}
        />
      </TranslatedField>

      {/* Removing a language is rare and permanent, so it sits after
            the work under a divider rather than as a card of its own. */}
      <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Text className="text-sm">
          {isNew
            ? 'This language has not been saved yet. Discarding it loses only what you have typed here.'
            : `Removing ${localeName(locale)} deletes its wording. Readers fall back to your own language.`}
        </Text>
        <Button size="sm" variant="outline" color="danger" loading={removing} onClick={onRemove}>
          <Icon glyph={faTrashCan} className="size-4" aria-hidden />
          {isNew ? 'Discard it' : `Remove ${localeName(locale)}`}
        </Button>
      </div>
    </FormSection>
  );
}
