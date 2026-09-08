'use client';

// One product in the translations worklist.
//
// Its own file because the list owns searching, filtering and paging, and this
// owns how ONE product reads — which is where the judgement is. Two of those
// judgements were wrong and are written down where they were made: what a green
// badge is allowed to mean (issue 420), and how wide the identity cell may get
// before the table scrolls sideways on a phone (issue 421).

import { Badge, Text } from '@wizeworks/silicaui-react';
import {
  coverageSummary,
  formatDate,
  lastTranslatedAt,
  productStatusState,
  unfinishedLanguages,
  unfinishedNote,
  type ProductTranslation,
  type TranslatableProduct,
} from './translations-data';

/**
 * How wide an identity cell may get.
 *
 * A FIXED cap is the wrong shape here: 288px is wider than this whole pane on a
 * phone, so the mono web address held the Product column open and the table grew
 * its own sideways scrollbar. This widens with the container instead — 160px on a
 * phone, back to 288px at full width.
 */
const IDENTITY_CELL = 'max-w-40 @sm:max-w-56 @md:max-w-64 @2xl:max-w-72';

export function TranslationRow({
  product,
  languages,
  coverageLoading,
  onOpen,
}: {
  product: TranslatableProduct;
  /** Undefined while this row's coverage is still resolving. */
  languages: ProductTranslation[] | undefined;
  coverageLoading: boolean;
  onOpen: (product: TranslatableProduct, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = productStatusState(product.status);
  const translated = languages !== undefined && languages.length > 0;
  const unfinished = languages ? unfinishedLanguages(languages) : [];
  const note = unfinishedNote(unfinished);
  const translatedAt = languages ? lastTranslatedAt(languages) : null;

  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={(event) => {
        onOpen(product, event);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(product, event);
      }}
    >
      {/* IDENTITY_CELL, not a fixed `max-w-72`. 288px is wider than the whole
          pane on a phone, so the mono address held the column open and the table
          grew its own sideways scrollbar (346px of table in a 323px box,
          measured) — the same failure as issue 390, on a list that never adopted
          the constant written to end it.

          Status and the date are hidden at this width, so they ride under the
          name instead of vanishing: on a phone the two facts a worklist is read
          for must still be on the row. */}
      <td>
        <span className={`block truncate font-medium ${IDENTITY_CELL}`}>{product.title}</span>
        {product.handle ? (
          <span className={`block truncate font-mono text-sm ${IDENTITY_CELL}`}>
            /{product.handle}
          </span>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2 @2xl:hidden">
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
          {translatedAt === null ? null : (
            <Text className="text-sm">Translated {formatDate(translatedAt)}</Text>
          )}
        </div>
      </td>

      <td className="hidden @2xl:table-cell">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>

      {/* When the TRANSLATION was last written, not the product. This column read
          `product.updatedAt` and was headed "Changed", which on a translations
          screen says one thing and means another: a Spanish translation saved
          today sat beside a date from a week earlier. */}
      <td className="hidden text-sm whitespace-nowrap @4xl:table-cell">
        {translatedAt === null ? '—' : formatDate(translatedAt)}
      </td>

      <td>
        {languages === undefined ? (
          // Still resolving — never flash "Not translated" under a product whose
          // coverage simply hasn't arrived yet.
          <Text className="text-sm" role="status">
            {coverageLoading ? 'Checking…' : '—'}
          </Text>
        ) : translated ? (
          // A colored badge marks the products that ARE translated; the
          // untranslated baseline stays plain text rather than a wall of neutral
          // pills down the default state of a fresh catalogue.
          //
          // Two colors, because there are two states worth telling apart. A NAME
          // is the only field a translation cannot be saved without, so "Spanish"
          // used to be green whether the description was written or still in
          // English — and a shopper reading the site in Spanish meets that
          // difference on the first paragraph. Green means a reader gets this
          // product in their language; amber means they get its name and then
          // your own words.
          <>
            <Badge color={unfinished.length > 0 ? 'warning' : 'success'} variant="soft" size="sm">
              {coverageSummary(languages)}
            </Badge>
            {note ? <Text className="mt-1 text-sm">{note}</Text> : null}
          </>
        ) : (
          <Text className="text-sm">Not translated</Text>
        )}
      </td>
    </tr>
  );
}
