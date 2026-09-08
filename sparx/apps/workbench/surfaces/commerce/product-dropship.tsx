'use client';

// Dropshipping — who actually ships this product to your customer, what they
// charge you, and what you make on it.
//
// ── The common case is "nobody", and it must not read as broken ──────────
//
// Most products are shipped by the business that sells them. On one of those,
// this pane is not an error and not an empty table — it is a short, complete
// answer: you pack and ship this yourself. Everything else on the pane is
// conditional on there being a supplier.
//
// ── Two facts that can disagree, and why both are shown ──────────────────
//
// A dropshipped product carries a supplier stamp in its metadata (written by
// the importer) AND a link row (the live join to the supplier's catalog). They
// can disagree: remove the link by hand and the stamp stays behind. A panel that
// trusted only the stamp would name a supplier that ships nothing; one that
// trusted only the link would lose the history. So the endpoint reports both and
// this pane says so plainly when they diverge.
//
// ── The margin arithmetic is the point ───────────────────────────────────
//
// A supplier's cost sits on the DropshipProduct and the selling price sits on
// our variant, and nothing in the platform has ever put the two on one screen.
// The whole reason to open this pane is "am I still making money on this after
// they put their price up", so the margin is computed per variant and the
// answer is colored — a variant selling below cost is not a neutral fact.

import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { PackageCheck, RefreshCcw, ServerCrash, Truck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { FollowingNotice, ProductScopeFallback, useProductScope } from './product-scope';
import {
  formatCents,
  productErrorMessage,
  useProductDropship,
  useReimportFromSupplier,
  type DropshipLink,
  type Product,
  type ProductDropship,
  type ProductDropshipVariant,
} from './products-data';

const LABEL = 'Dropshipping';

/** What a supplier connection is doing, in words a person can act on. */
function supplierState(link: DropshipLink): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
} {
  if (link.supplier.disconnected) return { label: 'No longer connected', tone: 'danger' };
  if (link.status === 'discontinued') {
    return { label: 'They stopped making it', tone: 'danger' };
  }
  switch (link.supplier.status) {
    case 'active':
      return { label: 'Connected', tone: 'success' };
    case 'error':
      return { label: 'Connection has a problem', tone: 'danger' };
    case 'connecting':
      return { label: 'Still connecting', tone: 'info' };
    default:
      return { label: 'Disconnected', tone: 'neutral' };
  }
}

/** Profit on one variant against the supplier's cost, as cash and as a share of
 *  the selling price. Null when we have no cost to compare against — showing
 *  "100% margin" because a cost is missing would be a lie with a number on it. */
function margin(
  variant: ProductDropshipVariant,
  fallbackCostCents: number | null
): { cents: number; percent: number; costCents: number } | null {
  const cost = variant.costCents ?? fallbackCostCents;
  if (cost === null || variant.priceCents <= 0) return null;
  const cents = variant.priceCents - cost;
  return { cents, percent: Math.round((cents / variant.priceCents) * 100), costCents: cost };
}

function SupplierCard({
  link,
  data,
  product,
  productId,
}: {
  link: DropshipLink;
  data: ProductDropship;
  product: Product;
  productId: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const reimport = useReimportFromSupplier(productId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const state = supplierState(link);
  const sourcedVariants = data.variants.filter((v) => v.dropshipSourceId !== null);
  const unsourced = data.variants.filter((v) => v.dropshipSourceId === null);

  const onReimport = () => {
    void (async () => {
      const ok = await confirm({
        title: `Pull ${product.title} from ${link.supplier.name} again?`,
        description: `Their name, description, photos and cost for this product are copied over the top of what is here now. Anything you have rewritten yourself — a better description, your own photos — is replaced. Your selling price is worked out again from their new cost using the rule you set for this supplier.`,
        confirmLabel: 'Pull it again',
        cancelLabel: 'Leave it as it is',
        color: 'warning',
      });
      if (!ok) return;
      setBusyId(link.id);
      reimport.mutate(
        { supplierId: link.supplier.id, sourceId: link.source.id },
        {
          onSuccess: () => {
            setBusyId(null);
            toast.add({ title: `Pulled again from ${link.supplier.name}`, type: 'success' });
          },
          onError: (error) => {
            setBusyId(null);
            toast.add({
              title: 'Could not pull it again',
              description: productErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          },
        }
      );
    })();
  };

  return (
    <FormSection
      title={link.supplier.name}
      description={`They hold the stock and post it to your customer. Their code for this product is ${link.supplierSku}.`}
      action={
        <Badge color={state.tone} variant="soft">
          {state.label}
        </Badge>
      }
    >
      {link.supplier.disconnected ? (
        <Text className="text-sm">
          This supplier has been disconnected, so nothing here updates any more and orders will not
          reach them. {product.title} is still on sale — take it off sale, or connect the supplier
          again, before someone buys something nobody will ship.
        </Text>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="border-base-300 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
          <Text className="text-sm">They charge you</Text>
          <Text as="span" className="text-lg font-semibold">
            {formatCents(link.source.costPriceCents)}
          </Text>
        </div>
        {link.source.msrpCents !== null ? (
          <div className="border-base-300 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
            <Text className="text-sm">The price they suggest you sell at</Text>
            <Text as="span" className="font-medium">
              {formatCents(link.source.msrpCents)}
            </Text>
          </div>
        ) : null}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Text className="text-sm">Their details last changed</Text>
          <Text as="span" className="font-medium">
            <Timestamp value={link.source.updatedAt} format="relative" />
          </Text>
        </div>
      </div>

      <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
        <Heading level={3} className="text-base font-semibold">
          What you make on it
        </Heading>
        {data.variants.length === 0 ? (
          <Text className="text-sm">This product has no versions to price yet.</Text>
        ) : (
          data.variants.map((variant) => {
            const result = margin(variant, link.source.costPriceCents);
            const losing = result !== null && result.cents <= 0;
            return (
              <div
                key={variant.id}
                className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Text as="span" className="font-medium">
                    {variant.title ?? variant.sku}
                  </Text>
                  <Text className="text-sm">
                    You sell it for {formatCents(variant.priceCents, variant.currency)}
                    {result ? ` · they charge you ${formatCents(result.costCents)}` : ''}
                  </Text>
                </div>
                {result ? (
                  <div className="text-right">
                    <Text as="span" className="text-lg font-semibold">
                      {formatCents(result.cents, variant.currency)}
                    </Text>
                    <Badge
                      color={losing ? 'danger' : result.percent < 15 ? 'warning' : 'success'}
                      variant="soft"
                      size="sm"
                      className="ml-2"
                    >
                      {losing
                        ? 'You lose money on this'
                        : `${String(result.percent)}% of the price`}
                    </Badge>
                  </div>
                ) : (
                  <Text className="text-sm">No cost recorded, so this cannot be worked out.</Text>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sourcing is per-version, so a product can be half dropshipped. Saying
          nothing about that would let someone assume the supplier ships all of
          it — and then not pack the ones they actually still hold. */}
      {sourcedVariants.length > 0 && unsourced.length > 0 ? (
        <div className="border-base-300 flex flex-col gap-2 border-t pt-4">
          <Text className="text-sm">
            {unsourced.length === 1
              ? '1 version of this product is not sourced from this supplier, so you ship that one yourself:'
              : `${String(unsourced.length)} versions of this product are not sourced from this supplier, so you ship those yourself:`}
          </Text>
          <div className="flex flex-wrap gap-2">
            {unsourced.map((variant) => (
              <Badge key={variant.id} color="info" variant="soft" size="sm">
                {variant.title ?? variant.sku}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Text className="text-sm">
          Pull their current details and cost over the top of what is here now. Anything you have
          rewritten yourself is replaced.
        </Text>
        <Button
          size="sm"
          variant="outline"
          color="neutral"
          disabled={link.supplier.disconnected}
          loading={busyId === link.id && reimport.isPending}
          onClick={onReimport}
        >
          <RefreshCcw className="size-4" aria-hidden />
          Pull it again
        </Button>
      </div>
    </FormSection>
  );
}

export function ProductDropshipSurface({ ctx }: { ctx: SurfaceContext }) {
  const scope = useProductScope(ctx, { label: LABEL });
  const productId = scope.productId ?? 'new';
  const dropship = useProductDropship(productId);

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} />;
  }

  const product = scope.product;
  const data = dropship.data;
  const orphanedStamp =
    data !== undefined && data.stampedSupplierId !== null && data.links.length === 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${LABEL} actions`}
        controls={
          <>
            <Truck className="size-4 shrink-0" aria-hidden />
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
            isFetching={dropship.isFetching}
            updatedAt={dropship.dataUpdatedAt}
            onRefresh={() => {
              void dropship.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <FollowingNotice scope={scope} />

          {dropship.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load who ships this"
              description={productErrorMessage(
                dropship.error,
                'This is a problem reaching the server. Nothing about your suppliers has changed.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void dropship.refetch();
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
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Heading level={1} className="text-2xl font-semibold">
                  {product.title}
                </Heading>
                <Text className="text-sm">
                  {data.links.length === 0
                    ? 'You hold this stock and ship it yourself.'
                    : data.links.length === 1
                      ? 'A supplier holds this stock and ships it for you.'
                      : `${String(data.links.length)} suppliers can ship this for you.`}
                </Text>
              </div>

              {data.links.length === 0 ? (
                <FormSection title="Who ships this">
                  <EmptyState
                    size="sm"
                    icon={<PackageCheck className="size-6" aria-hidden />}
                    title="You ship this one yourself"
                    description={`${product.title} is not linked to any supplier, so when someone buys it you pick it, pack it and post it. That is how most products work — nothing is missing here.`}
                  />
                  {orphanedStamp ? (
                    <Text className="text-sm">
                      This product was originally brought in from a supplier, but the link to them
                      has since been removed. Nothing updates from them any more, and orders will
                      not reach them.
                    </Text>
                  ) : null}
                  <Text className="text-sm">
                    To have someone else ship it, connect that supplier and bring the product in
                    from their catalog — a product becomes dropshipped by being imported, not by
                    being flagged.
                  </Text>
                </FormSection>
              ) : (
                data.links.map((link) => (
                  <SupplierCard
                    key={link.id}
                    link={link}
                    data={data}
                    product={product}
                    productId={scope.productId}
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
