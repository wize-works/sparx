'use client';

// Wishlists — what people saved for later, as a read-only signal.
//
// ── Why this pane invents no Save ────────────────────────────────────────
//
// A wishlist belongs to the customer who made it. Staff never edit one — there
// is nothing here to moderate or publish. What this pane is FOR is the signal:
// which of your products people keep saving but haven't bought yet, which is
// exactly the list worth putting on offer or making sure is in stock. So it
// reports, honestly, and stops there.
//
// The numbers come from one combined endpoint (wishlists/analytics): the
// headline counts and the most-saved products in a single read.

import { Badge, Button, EmptyState, Heading, Text } from '@wizeworks/silicaui-react';
import { Heart, ServerCrash } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { productErrorMessage } from './products-data';
import { useWishlistAnalytics, type WishlistTopVariant } from './moderation-data';

const LABEL = 'Wishlists';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A headline number with the sentence that keeps it from being misread. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Text as="span" className="text-2xl font-semibold">
        {value}
      </Text>
      <Text className="text-sm">{label}</Text>
    </div>
  );
}

function TopRow({ item, ctx }: { item: WishlistTopVariant; ctx: SurfaceContext }) {
  // A variant title only adds information when it differs from the product name
  // (a size, a color); otherwise it just repeats it.
  const variantNote =
    item.variantTitle && item.variantTitle !== item.productTitle ? item.variantTitle : item.sku;

  return (
    <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <button
          type="button"
          className="link link-hover min-w-0 truncate text-left font-medium"
          onClick={(event) => {
            ctx.open(
              'commerce.product.detail',
              { id: item.productId },
              { target: targetFor(event) }
            );
          }}
        >
          {item.productTitle}
        </button>
        {variantNote ? <Text className="text-sm">{variantNote}</Text> : null}
      </div>
      <Badge color="module" variant="soft" size="sm">
        {item.saveCount === 1 ? 'saved once' : `saved ${String(item.saveCount)} times`}
      </Badge>
    </div>
  );
}

export function WishlistsSurface({ ctx }: { ctx: SurfaceContext }) {
  const analytics = useWishlistAnalytics();
  const data = analytics.data;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Wishlists controls"
        controls={
          <>
            <Heart className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {LABEL}
            </Heading>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={analytics.isFetching}
            updatedAt={data ? analytics.dataUpdatedAt : undefined}
            onRefresh={() => {
              void analytics.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {analytics.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load wishlists"
              description={productErrorMessage(
                analytics.error,
                'This is a problem reaching the server. Nobody’s saved list has changed.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void analytics.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : data === undefined ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : data.itemCount === 0 ? (
            <EmptyState
              icon={<Heart className="size-6" aria-hidden />}
              title="Nobody has saved anything yet"
              description="When a shopper saves a product for later, it shows up here. Once a few have, this becomes a good list of what to keep in stock or put on offer — the things people want but haven't bought."
            />
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Heading level={1} className="text-2xl font-semibold">
                  What people saved for later
                </Heading>
                <Text className="text-sm">
                  Products shoppers added to a wishlist but may not have bought. A product saved by
                  lots of people is worth keeping in stock, and a good candidate for an offer.
                </Text>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <Figure
                  value={String(data.itemCount)}
                  label={
                    data.itemCount === 1 ? 'product saved in total' : 'products saved in total'
                  }
                />
                <Figure
                  value={String(data.wishlistCount)}
                  label={
                    data.wishlistCount === 1
                      ? 'wishlist across your customers'
                      : 'wishlists across your customers'
                  }
                />
              </div>

              <div className="border-base-300 bg-base-100 flex flex-col gap-3 rounded-lg border p-4">
                <Heading level={2} className="text-base font-semibold">
                  Most saved
                </Heading>
                {data.topVariants.length === 0 ? (
                  <Text className="text-sm">
                    Saved products will appear here once the details behind them are available.
                  </Text>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.topVariants.map((item) => (
                      <TopRow key={item.variantId} item={item} ctx={ctx} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
