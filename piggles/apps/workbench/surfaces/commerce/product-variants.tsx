'use client';

// The Variants tab — the versions you actually sell, and what each one costs.
//
// A variant is one sellable thing: a price, a code, a barcode, a weight. On a
// product with no choices there is exactly one of them and that is the whole
// story. On a product WITH choices the set is DERIVED from the lattice on the
// Options tab — every combination of choices is a slot, and a slot either has a
// version in it, has a retired one waiting to come back, or is genuinely empty.
//
// ── Why there is no "add a version" button ───────────────────────────────
//
// On a product with choices, a loose variant with no coordinate is corrupt: the
// storefront cannot offer it, because there is no combination of choices that
// selects it. The server enforces this — `POST /variants` rejects a variant that
// does not span every option exactly once.
//
// So this tab never offers "add a version". It shows the grid, and an empty slot
// carries its own "set a price" affordance in place. Extending the grid means
// adding a value on Options, and that reads as an obvious consequence of where
// things live rather than as a greyed-out button with a paragraph of apology
// next to it.
//
// ── One Save, and it lives in the pane toolbar ───────────────────────────
//
// Every edit lands in a draft held in `useVariantsTab`, keyed by variant id, and
// one save commits every version that changed. Repricing a size run is one job,
// and a Save button per row turns it into eleven. That save is handed UP through
// `useTabSave` — see product-tab-save.tsx. Retiring a version, bringing one back
// and choosing which is shown first are NOT saves: they commit immediately.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Text,
} from '@wizeworks/silicaui-react';
import { faPlus } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';

import { FormSection } from '../../components/form-section';
import { InlineWaiting } from '../../components/inline-waiting';
import { FindAPlace } from './product-variants/find-a-place';
import { GroupedGrid } from './product-variants/grouped-grid';
import { NoPriceYet } from './product-variants/no-price-yet';
import { RestingSection } from './product-variants/resting-section';
import { VariantRow } from './product-variants/variant-row';
import { useVariantsTab } from './product-variants/use-variants-tab';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import type { Product } from './products-data';
import { SaveFailure } from '@/components/save-failure';

export function ProductVariantsTab({ product }: { ctx: SurfaceContext; product: Product }) {
  const tab = useVariantsTab(product);
  const { options, variants, live, retired, homeless, axes, slots, stem, taken, stranded, empty } =
    tab;

  if (options.isError || variants.isError) {
    // A failed load REPLACES the grid. An empty table beside a dead Save invites
    // someone to type a price into nothing.
    return (
      <Alert color="error">
        <AlertContent>
          <AlertTitle>Could not load this product&apos;s prices</AlertTitle>
          <AlertDescription>
            This is a problem reaching the server. Nothing about the product has changed — its
            versions just could not be read just now.
          </AlertDescription>
        </AlertContent>
        <Button
          size="sm"
          color="error"
          variant="soft"
          onClick={() => {
            void options.refetch();
            void variants.refetch();
          }}
        >
          Try again
        </Button>
      </Alert>
    );
  }

  if (options.isPending || variants.isPending) {
    return <InlineWaiting center />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* No Save here — the pane toolbar owns it, and the tab strip's dot says
          which tab the unsaved work is on. See product-tab-save.tsx. */}
      {tab.pending.length > 0 ? (
        <Text>
          {tab.pending.length === 1
            ? '1 version has unsaved changes.'
            : `${String(tab.pending.length)} versions have unsaved changes.`}
        </Text>
      ) : null}

      {/* ONE message, the most specific one — the server's own sentence names the
          exact code that clashed, which no generic banner could. */}
      <SaveFailure title="That version was not saved" message={tab.saveError} />

      {live.length === 0 && retired.length === 0 ? (
        <NoPriceYet axes={axes} slots={slots} stem={stem} onCreated={tab.create} />
      ) : null}

      {axes.length === 0 ? (
        live.length === 0 ? null : (
          <FormSection
            title="How this product is sold"
            description="There is one version of this product. Shoppers do not choose anything — they just buy it."
          >
            {live.map((variant) => (
              <VariantRow
                key={variant.id}
                variant={variant}
                label={variant.sku}
                {...tab.rowProps}
              />
            ))}
          </FormSection>
        )
      ) : (
        <GroupedGrid
          slots={slots}
          axes={axes}
          rowProps={tab.rowProps}
          stem={stem}
          taken={taken}
          create={tab.create}
          restoring={tab.restoring}
          onRestore={tab.onRestore}
        />
      )}

      <FindAPlace
        stranded={stranded}
        homeless={homeless}
        free={tab.free}
        placingId={tab.placingId}
        onPlace={tab.onPlace}
      />

      {axes.length > 0 && empty.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text>
            {empty.length === 1
              ? '1 combination has no price, so nobody can buy it.'
              : `${String(empty.length)} combinations have no price, so nobody can buy them.`}
          </Text>
          <Button
            size="sm"
            variant="outline"
            color="module"
            loading={tab.create.isPending}
            onClick={() => {
              void tab.fillTheRest(empty);
            }}
          >
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Give them all the same price
          </Button>
        </div>
      ) : null}

      <RestingSection resting={tab.resting} />

      {axes.length > 0 ? (
        // The one place the constraint is spelled out, for whoever goes looking
        // for an "add a version" button that is deliberately not here.
        <Text>
          Every version above comes from the choices on the Options tab. To sell another one, add
          what a shopper can pick there and it appears here ready to price.
        </Text>
      ) : (
        <Text>
          Selling this in more than one size, color or length? Set those choices up on the Options
          tab and each combination gets its own price here.
        </Text>
      )}
    </div>
  );
}
