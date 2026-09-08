'use client';

// Where it sells — every place this product is offered, and whether each one is
// actually live.
//
// ── Three different kinds of "place", and why they are not one list ──────
//
//   Your own sites        — the product's `propertyIds`. Owned by the product
//                           record and edited on the product's own Overview tab,
//                           so this pane REPORTS it and does not offer to change
//                           it. A field owned by two screens is a field that
//                           gets saved twice with different values.
//   The sparx marketplace — one opt-in flag plus a category, on the product
//                           record. Editable here, because nothing else surfaces
//                           it and it is a decision about where the product
//                           sells, which is what this pane is for.
//   Outside shops         — real listings on someone else's marketplace, mapped
//                           variant by variant. Read-mostly: the sync worker
//                           creates them because it is the side that knows the
//                           external ids.
//
// ── The one thing this pane must never imply ─────────────────────────────
//
// "Unlink" forgets our record of an outside listing. It does NOT take that
// listing down — the other marketplace has its own copy and its own seller
// tools. A button that reads as "remove" while leaving a live listing selling
// stock we have stopped decrementing is the worst outcome on this screen, so the
// confirm says so in the first sentence.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Select,
  Switch,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { MARKET_CATEGORIES } from '@wizeworks/commerce-schemas';
import { Globe2, Link2Off, ServerCrash, Store } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useSites } from '../sites/data';
import { FollowingNotice, ProductScopeFallback, useProductScope } from './product-scope';
import {
  productErrorMessage,
  useChannelListings,
  useSetListingSync,
  useSetMarketListing,
  useUnlinkListing,
  type ChannelListing,
  type Product,
} from './products-data';

const LABEL = 'Where it sells';

/** Slug → the name a shopper browsing the marketplace would see. */
const CATEGORY_ITEMS = Object.fromEntries(
  MARKET_CATEGORIES.map((category) => [category.slug, category.name])
);

/** How healthy an outside listing is, in one badge. The connection's state and
 *  the listing's own last error are two different facts, and a listing on a
 *  broken connection is not "live" no matter what the row says. */
function listingState(listing: ChannelListing): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
} {
  if (listing.connectionStatus === 'disconnected') {
    return { label: 'Shop disconnected', tone: 'neutral' };
  }
  if (listing.syncError) return { label: 'Last update failed', tone: 'danger' };
  if (listing.connectionStatus === 'error') return { label: 'Shop has a problem', tone: 'danger' };
  if (!listing.syncEnabled) return { label: 'Updates paused', tone: 'warning' };
  if (listing.connectionStatus === 'paused') return { label: 'Shop paused', tone: 'warning' };
  return { label: 'Live', tone: 'success' };
}

function ListingRow({ listing, productId }: { listing: ChannelListing; productId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const setSync = useSetListingSync(productId);
  const unlink = useUnlinkListing(productId);

  const state = listingState(listing);
  const where = listing.shopName
    ? `${listing.channelName} · ${listing.shopName}`
    : listing.channelName;

  return (
    <div className="border-base-300 flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text as="span" className="font-medium">
            {listing.variantTitle ?? listing.variantSku}
          </Text>
          <Text className="text-sm">
            {where}
            {listing.externalSku ? ` · listed there as ${listing.externalSku}` : ''}
          </Text>
          <Text className="text-sm">
            {listing.lastSyncedAt ? (
              <>
                Last updated <Timestamp value={listing.lastSyncedAt} format="relative" />
              </>
            ) : (
              'Never updated since it was linked.'
            )}
          </Text>
        </div>
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </div>

      {/* The server's own sentence, not a generic "something went wrong" —
          the specific message is the only thing here that can be acted on. */}
      {listing.syncError ? <Text className="text-sm">{listing.syncError}</Text> : null}

      <div className="flex flex-wrap items-center gap-3">
        {/* Not a <label>: silica's Switch is a button, not a checkbox input, so
            wrapping it in a label associates nothing. The accessible name rides
            on the control itself and the text beside it is the visible echo. */}
        <div className="flex items-center gap-2">
          <Switch
            color="module"
            checked={listing.syncEnabled}
            disabled={setSync.isPending}
            aria-label={`Keep ${where} up to date`}
            onCheckedChange={(next: boolean) => {
              setSync.mutate(
                { id: listing.id, syncEnabled: next },
                {
                  onSuccess: () => {
                    toast.add({
                      title: next ? 'Updates turned back on' : 'Updates paused',
                      type: 'success',
                    });
                  },
                  onError: (error) => {
                    toast.add({
                      title: 'Could not change that',
                      description: productErrorMessage(error, 'Nothing was changed.'),
                      type: 'error',
                    });
                  },
                }
              );
            }}
          />
          <Text as="span" className="text-sm">
            Send price and stock changes to this shop
          </Text>
        </div>

        <Button
          size="sm"
          variant="ghost"
          color="danger"
          className="ml-auto"
          loading={unlink.isPending}
          onClick={() => {
            void (async () => {
              const ok = await confirm({
                title: `Forget the ${listing.channelName} listing?`,
                description: `This does NOT take the listing down — it stays on ${listing.channelName} and people can still buy it there. What stops is us keeping it up to date and matching orders from it back to ${listing.variantSku}, so stock will drift. To actually remove it, delist it in ${listing.channelName}'s own seller tools first.`,
                confirmLabel: 'Forget it anyway',
                cancelLabel: 'Keep it linked',
                color: 'danger',
              });
              if (!ok) return;
              unlink.mutate(listing.id, {
                onSuccess: () => {
                  toast.add({ title: 'Listing unlinked', type: 'success' });
                },
                onError: (error) => {
                  toast.add({
                    title: 'Could not unlink that listing',
                    description: productErrorMessage(error, 'Nothing was changed.'),
                    type: 'error',
                  });
                },
              });
            })();
          }}
        >
          <Link2Off className="size-4" aria-hidden />
          Unlink
        </Button>
      </div>
    </div>
  );
}

function MarketplaceCard({ product, productId }: { product: Product; productId: string }) {
  const toast = useToast();
  const setMarket = useSetMarketListing(productId);
  // Held locally only while a change is in flight, so the switch does not snap
  // back before the refetch lands.
  const [pending, setPending] = useState<boolean | null>(null);
  const listed = pending ?? product.marketListed;

  const write = (next: boolean, category?: string) => {
    setPending(next);
    setMarket.mutate(
      { listed: next, ...(category ? { category } : {}) },
      {
        onSuccess: () => {
          setPending(null);
          toast.add({
            title: next ? 'Listed on the sparx marketplace' : 'Taken off the sparx marketplace',
            type: 'success',
          });
        },
        onError: (error) => {
          setPending(null);
          toast.add({
            title: 'Could not change that',
            description: productErrorMessage(
              error,
              'Nothing was changed. You may need to finish setting up your marketplace profile first.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <FormSection
      title="The sparx marketplace"
      description="A shared marketplace of products from every business on sparx. Listing here puts this product in front of people who have never heard of you."
    >
      <Field>
        <FieldLabel>Offer it on the sparx marketplace</FieldLabel>
        <FieldControl
          render={
            <Switch
              color="module"
              checked={listed}
              disabled={setMarket.isPending}
              onCheckedChange={(next: boolean) => {
                write(next);
              }}
            />
          }
        />
        <FieldDescription>
          {product.status !== 'active'
            ? 'It will not appear until the product is on sale on your own site.'
            : 'It appears once sparx has approved it, which is usually immediate.'}
        </FieldDescription>
      </Field>

      {listed ? (
        <Field>
          <FieldLabel>Which section it is filed under</FieldLabel>
          <FieldControl
            render={
              <Select
                color="module"
                value={product.marketCategory ?? 'general'}
                // Silica takes the trigger's label from `items`, not children.
                items={CATEGORY_ITEMS}
                aria-label="Which section it is filed under"
                onValueChange={(next) => {
                  write(true, String(next));
                }}
              />
            }
          />
          <FieldDescription>Where shoppers browsing the marketplace will find it.</FieldDescription>
        </Field>
      ) : null}
    </FormSection>
  );
}

export function ProductChannelsSurface({ ctx }: { ctx: SurfaceContext }) {
  const scope = useProductScope(ctx, { label: LABEL });
  const productId = scope.productId ?? 'new';
  const listings = useChannelListings(productId);
  const { data: sites } = useSites();

  const grouped = useMemo(() => {
    const byChannel = new Map<string, ChannelListing[]>();
    for (const listing of listings.data ?? []) {
      const bucket = byChannel.get(listing.channelName);
      if (bucket) bucket.push(listing);
      else byChannel.set(listing.channelName, [listing]);
    }
    return [...byChannel.entries()];
  }, [listings.data]);

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} />;
  }

  const product = scope.product;
  const allSites = sites ?? [];
  // Empty genuinely MEANS every site in the stored model, so it cannot be
  // rendered as "no sites".
  const ownSites =
    product.propertyIds.length === 0
      ? allSites
      : allSites.filter((site) => product.propertyIds.includes(site.id));

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${LABEL} actions`}
        controls={
          <>
            <Globe2 className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {product.title}
            </Heading>
            {scope.isFollowing ? (
              <Badge color="info" variant="soft" size="sm">
                Following
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={listings.isFetching}
            updatedAt={listings.dataUpdatedAt}
            onRefresh={() => {
              void listings.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <FollowingNotice scope={scope} />

          {listings.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load where this sells"
              description={productErrorMessage(
                listings.error,
                'This is a problem reaching the server. Nothing about your listings has changed.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void listings.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Heading level={1} className="text-2xl font-semibold">
                  {product.title}
                </Heading>
                <Text className="text-sm">
                  Every place this product is offered, and whether each one is live.
                </Text>
              </div>

              <FormSection
                title="Your own websites"
                description="Changed on the product itself, under which of your sites show it."
              >
                {ownSites.length === 0 ? (
                  <Text className="text-sm">
                    You have no websites set up yet, so this product has nowhere of your own to
                    appear.
                  </Text>
                ) : (
                  <div className="flex flex-col gap-3">
                    {ownSites.map((site) => (
                      <div
                        key={site.id}
                        className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
                      >
                        <Text as="span" className="font-medium">
                          {site.name}
                        </Text>
                        <Badge
                          color={product.status === 'active' ? 'success' : 'info'}
                          variant="soft"
                          size="sm"
                        >
                          {product.status === 'active' ? 'On sale' : 'Not on sale yet'}
                        </Badge>
                      </div>
                    ))}
                    {product.propertyIds.length === 0 && allSites.length > 1 ? (
                      <Text className="text-sm">
                        It is set to appear on every website you run, including any you add later.
                      </Text>
                    ) : null}
                  </div>
                )}
              </FormSection>

              <MarketplaceCard product={product} productId={scope.productId} />

              <FormSection
                title="Other shops you sell through"
                description="Marketplaces you have connected, like Etsy or TikTok Shop. Listings are created when a shop is synced, not typed in here."
              >
                {grouped.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={<Store className="size-6" aria-hidden />}
                    title="Not listed on any outside shop"
                    description={`${product.title} has no listing on a marketplace you have connected. Connect a shop under your settings, and its listings appear here once the first sync runs.`}
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    {grouped.map(([channelName, rows]) => (
                      <div key={channelName} className="flex flex-col gap-3">
                        <Heading level={3} className="text-base font-semibold">
                          {channelName}
                        </Heading>
                        {rows.map((listing) => (
                          <ListingRow
                            key={listing.id}
                            listing={listing}
                            productId={scope.productId}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </FormSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
