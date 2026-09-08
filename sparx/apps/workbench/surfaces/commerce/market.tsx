'use client';

// sparx.market — the shared marketplace where your products can sell alongside
// every other sparx business.
//
// product-channels.tsx toggles ONE product onto the marketplace. This is the
// whole-business view: whether you take part at all, everything you have listed,
// and what the marketplace has earned and paid out to you.
//
// ── Enrollment gating is real and must be shown honestly ─────────────────
//
// Listing a product requires the business to PARTICIPATE (the server refuses to
// list otherwise). So the surface has two genuinely different states: not taking
// part yet — where the one thing to do is decide to — and taking part, where the
// listed products and the money live. Rendering an empty product table behind a
// dead toggle for a business that hasn't enrolled would be a lie about why it's
// empty.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Heading,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { MARKET_CATEGORIES } from '@wizeworks/commerce-schemas';
import { ServerCrash, ShoppingBag } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, productErrorMessage } from './products-data';
import {
  useBulkSetListing,
  useMarketProducts,
  useMarketProfile,
  useMarketSettlement,
  useSetMarketParticipation,
  useSetProductListing,
  type MarketProfile,
  type OptedInProduct,
} from './market-data';

const LABEL = 'sparx.market';

/** Slug → the section name a shopper browsing the marketplace sees. */
const CATEGORY_ITEMS = Object.fromEntries(
  MARKET_CATEGORIES.map((category) => [category.slug, category.name])
);

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A headline figure with the sentence that stops it being misread. */
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

function ProductRow({
  product,
  ctx,
  selected,
  onToggleSelect,
}: {
  product: OptedInProduct;
  ctx: SurfaceContext;
  selected: boolean;
  onToggleSelect: (id: string, next: boolean) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const setListing = useSetProductListing();

  const failed = (title: string) => (error: unknown) => {
    toast.add({
      title,
      description: productErrorMessage(error, 'Nothing was changed.'),
      type: 'error',
    });
  };

  const onUnlist = () => {
    void (async () => {
      const ok = await confirm({
        title: `Take ${product.title} off sparx.market?`,
        description:
          'It stops appearing on the marketplace. Your own website is unaffected, and you can list it again at any time.',
        confirmLabel: 'Take it off',
        cancelLabel: 'Leave it listed',
      });
      if (!ok) return;
      setListing.mutate(
        { productId: product.productId, listed: false },
        {
          onSuccess: () => {
            toast.add({ title: `${product.title} taken off sparx.market`, type: 'success' });
          },
          onError: failed('Could not take that product off'),
        }
      );
    })();
  };

  return (
    <div className="border-base-300 flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex min-w-0 flex-1 items-start gap-2">
          <Checkbox
            color="module"
            className="mt-1"
            checked={selected}
            aria-label={`Select ${product.title}`}
            onChange={(event) => {
              onToggleSelect(product.productId, event.target.checked);
            }}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <button
              type="button"
              className="link link-hover min-w-0 truncate text-left font-medium"
              onClick={(event) => {
                ctx.open(
                  'commerce.product.detail',
                  { id: product.productId },
                  { target: targetFor(event) }
                );
              }}
            >
              {product.title}
            </button>
            <Text className="text-sm">
              {product.priceMinCents !== null
                ? `from ${formatCents(product.priceMinCents)}`
                : 'No price set'}
            </Text>
          </span>
        </label>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge color={product.approved ? 'success' : 'warning'} variant="soft" size="sm">
            {product.approved ? 'Live on the marketplace' : 'Awaiting approval'}
          </Badge>
          {product.featured ? (
            <Badge color="module" variant="soft" size="sm">
              Featured by sparx
            </Badge>
          ) : null}
          {!product.inStock ? (
            <Badge color="neutral" variant="soft" size="sm">
              Out of stock
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          color="module"
          className="w-52 shrink-0"
          value={product.category ?? 'general'}
          items={CATEGORY_ITEMS}
          aria-label={`Which section ${product.title} is filed under`}
          disabled={setListing.isPending}
          onValueChange={(next) => {
            setListing.mutate(
              { productId: product.productId, listed: true, category: String(next) },
              {
                onSuccess: () => {
                  toast.add({ title: 'Section updated', type: 'success' });
                },
                onError: failed('Could not change the section'),
              }
            );
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          className="ml-auto"
          loading={setListing.isPending}
          onClick={onUnlist}
        >
          Take off
        </Button>
      </div>
    </div>
  );
}

function EnrolledBody({ profile, ctx }: { profile: MarketProfile; ctx: SurfaceContext }) {
  const products = useMarketProducts();
  const settlement = useMarketSettlement();
  const toast = useToast();
  const confirm = useConfirm();
  const bulk = useBulkSetListing();
  const setParticipation = useSetMarketParticipation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => products.data?.rows ?? [], [products.data]);
  const selectedIds = useMemo(
    () => rows.filter((r) => selected.has(r.productId)).map((r) => r.productId),
    [rows, selected]
  );

  const toggleSelect = (id: string, next: boolean) => {
    setSelected((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const onBulkUnlist = () => {
    void (async () => {
      const count = selectedIds.length;
      const ok = await confirm({
        title: count === 1 ? 'Take this product off?' : `Take these ${String(count)} products off?`,
        description:
          'They stop appearing on sparx.market. Your own website is unaffected, and you can list them again later.',
        confirmLabel: 'Take them off',
        cancelLabel: 'Leave them',
      });
      if (!ok) return;
      bulk.mutate(
        { productIds: selectedIds, listed: false },
        {
          onSuccess: (result) => {
            setSelected(new Set());
            toast.add({
              title: `Took ${String(result.updated)} off sparx.market`,
              type: 'success',
            });
          },
          onError: (error) => {
            toast.add({
              title: 'Could not update those products',
              description: productErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          },
        }
      );
    })();
  };

  const onLeave = () => {
    void (async () => {
      const ok = await confirm({
        title: 'Leave sparx.market?',
        description:
          'Every product you have listed is taken off the marketplace at once and stops selling there. Your own website and your listings on other shops are unaffected. You can re-join later, but you would need to list your products again.',
        confirmLabel: 'Leave the marketplace',
        cancelLabel: 'Stay',
        color: 'danger',
      });
      if (!ok) return;
      setParticipation.mutate(
        { enabled: false, profile },
        {
          onSuccess: () => {
            toast.add({ title: 'Left sparx.market', type: 'success' });
          },
          onError: (error) => {
            toast.add({
              title: 'Could not leave the marketplace',
              description: productErrorMessage(
                error,
                'Nothing was changed. You may need to be an owner to change this.'
              ),
              type: 'error',
            });
          },
        }
      );
    })();
  };

  const summary = settlement.data;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Heading level={1} className="text-2xl font-semibold">
          Your products on sparx.market
        </Heading>
        <Text className="text-sm">
          You’re taking part in the shared marketplace. Products you list here appear in front of
          shoppers who’ve never heard of you; sparx takes the payment and pays you the rest.
        </Text>
      </div>

      {summary ? (
        <FormSection
          title="What the marketplace has made you"
          description="Across every sale on sparx.market. sparx takes its share from each sale and pays you the rest, weekly."
        >
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Figure value={formatCents(summary.netCents)} label="yours after sparx's share" />
            <Figure value={formatCents(summary.pendingCents)} label="due to be paid to you next" />
            <Figure value={formatCents(summary.paidCents)} label="already paid to you" />
            <Figure
              value={String(summary.orderCount)}
              label={
                summary.orderCount === 1 ? 'sale on the marketplace' : 'sales on the marketplace'
              }
            />
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="Listed products"
        description="To add a product, open it and use its Listings panel — listing is a per-product decision, made where you can see its price and stock."
      >
        {products.isError ? (
          <EmptyState
            size="sm"
            icon={<ServerCrash className="size-6" aria-hidden />}
            title="Could not load your listed products"
            description={productErrorMessage(
              products.error,
              'This is a problem reaching the server.'
            )}
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void products.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : products.isLoading ? (
          <p className="text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<ShoppingBag className="size-6" aria-hidden />}
            title="Nothing listed yet"
            description="You're taking part in the marketplace but haven't listed any products on it. Open a product and use its Listings panel to offer it here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {selectedIds.length > 0 ? (
              <div className="border-base-300 bg-base-100 flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <Text as="span" className="font-medium">
                  {selectedIds.length === 1
                    ? '1 selected'
                    : `${String(selectedIds.length)} selected`}
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  loading={bulk.isPending}
                  onClick={onBulkUnlist}
                >
                  Take off the marketplace
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  className="ml-auto"
                  onClick={() => {
                    setSelected(new Set());
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : null}
            {rows.map((product) => (
              <ProductRow
                key={product.productId}
                product={product}
                ctx={ctx}
                selected={selected.has(product.productId)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </FormSection>

      <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text as="span" className="font-medium">
            Leave sparx.market
          </Text>
          <Text className="text-sm">Takes every listed product off the marketplace at once.</Text>
        </div>
        <Button
          size="sm"
          variant="outline"
          color="danger"
          loading={setParticipation.isPending}
          onClick={onLeave}
        >
          Leave
        </Button>
      </div>
    </>
  );
}

function NotEnrolled({ profile }: { profile: MarketProfile }) {
  const toast = useToast();
  const setParticipation = useSetMarketParticipation();

  return (
    <>
      <div className="flex flex-col gap-1">
        <Heading level={1} className="text-2xl font-semibold">
          Sell on sparx.market
        </Heading>
        <Text className="text-sm">
          sparx.market is a shared marketplace of products from every business on sparx. Taking part
          puts your products in front of shoppers who’ve never heard of you. sparx takes the payment
          and pays you the rest, weekly, keeping a small share of each sale.
        </Text>
      </div>

      <FormSection title="Join the marketplace">
        <div className="flex items-center gap-3">
          <Switch
            color="module"
            checked={false}
            disabled={setParticipation.isPending}
            aria-label="Take part in sparx.market"
            onCheckedChange={(next: boolean) => {
              if (!next) return;
              setParticipation.mutate(
                { enabled: true, profile },
                {
                  onSuccess: () => {
                    toast.add({ title: 'You are now on sparx.market', type: 'success' });
                  },
                  onError: (error) => {
                    toast.add({
                      title: 'Could not join the marketplace',
                      description: productErrorMessage(
                        error,
                        'Nothing was changed. You may need to be an owner to turn this on.'
                      ),
                      type: 'error',
                    });
                  },
                }
              );
            }}
          />
          <Text as="span">Take part in sparx.market</Text>
        </div>
        <Text className="text-sm">
          Once you’re taking part, you list products one at a time from each product’s Listings
          panel, and they appear here to manage together.
        </Text>
      </FormSection>
    </>
  );
}

export function MarketSurface({ ctx }: { ctx: SurfaceContext }) {
  const profileQuery = useMarketProfile();
  const profile = profileQuery.data;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="sparx.market controls"
        controls={
          <>
            <ShoppingBag className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {LABEL}
            </Heading>
            {profile?.enabled ? (
              <Badge color="success" variant="soft" size="sm">
                Taking part
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={profileQuery.isFetching}
            updatedAt={profile ? profileQuery.dataUpdatedAt : undefined}
            onRefresh={() => {
              void profileQuery.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {profileQuery.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load sparx.market"
              description={productErrorMessage(
                profileQuery.error,
                'This is a problem reaching the server. Nothing about your marketplace has changed.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void profileQuery.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : profile === undefined ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : profile.enabled ? (
            <EnrolledBody profile={profile} ctx={ctx} />
          ) : (
            <NotEnrolled profile={profile} />
          )}
        </div>
      </div>
    </div>
  );
}
