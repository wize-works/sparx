'use client';

// Trade pricing — what businesses pay for this product, as opposed to what the
// public pays.
//
// Registered under `b2b`, so `color="module"` resolves to the B2B hue rather
// than commerce orange. See the note in product-detail.tsx: `module` is the
// active-module bridge and is the ONLY correct spelling on a facet pane
// registered outside commerce.
//
// ── Why one pane and not four ────────────────────────────────────────────
//
// Four separate things decide what a trade customer is charged, and the server
// resolves them as a waterfall: a price set for ONE business beats an agreement
// signed with that business, which beats a price set for a whole customer group
// on this product, which beats that group's blanket discount, which beats list.
// Read on their own, any one of them is a half-answer — a group discount of 15%
// means nothing if the account you are thinking of has a fixed price that
// overrides it. So the pane shows all four, in waterfall order, with every rule
// converted to CASH so they can actually be compared.
//
// ── Why the conversion matters more than it looks ────────────────────────
//
// The stored rules are a mix: some carry a fixed price in cents, some carry a
// percentage. A list of "15% off" beside "$42.00" beside "8% off" cannot be
// compared by eye, and comparing them is the entire reason anyone opens this.
// `tradeRulePriceCents` does the arithmetic once, in the data layer, against the
// variant's real list price.
//
// ── One create, no modal ─────────────────────────────────────────────────
//
// Adding a group price is three fields and it commits to the server, so it is an
// inline form in the pane rather than a dialog: a dialog here would be invisible
// to the dirty-tracking every other editor in the app participates in, for no
// gain. Editing an existing rule is deliberately NOT offered — a price is
// removed and re-added, because the two are the same number of actions and
// "edit" on a rule with a fixed-price/percentage XOR is a form that has to
// re-derive which half it is in.

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
  Input,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Building2, Plus, ServerCrash, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { FollowingNotice, ProductScopeFallback, useProductScope } from './product-scope';
import {
  formatCents,
  productErrorMessage,
  tradeRulePriceCents,
  useAddTierOverride,
  useRemoveAccountOverride,
  useRemoveContractPrice,
  useRemoveTierOverride,
  useTradePricing,
  type Product,
  type TradePricing,
  type TradePricingVariant,
} from './products-data';

const LABEL = 'Trade pricing';

const MODE_ITEMS = {
  percent: 'A percentage off the normal price',
  fixed: 'A fixed price',
};

/** How much cheaper a rule is than list, as a phrase. Returned separately from
 *  the cash figure because "$42.00" alone does not say whether that is a good
 *  deal on a $45 product or a catastrophe on a $400 one. */
function savingLabel(ruleCents: number, listCents: number): string | null {
  if (listCents <= 0) return null;
  const off = Math.round(((listCents - ruleCents) / listCents) * 100);
  if (off === 0) return 'same as list price';
  if (off < 0) return `${String(Math.abs(off))}% ABOVE list price`;
  return `${String(off)}% below list price`;
}

/** One rule, rendered the same way wherever it came from. A row, not a table
 *  row: these lists are short, and a table here would invent columns (a "Type"
 *  column reading "Tier" beside a tier's own name) to justify its own width. */
function RuleRow({
  who,
  detail,
  variant,
  ruleCents,
  tone,
  badge,
  onRemove,
  removing,
}: {
  who: string;
  detail: string | null;
  variant: TradePricingVariant | undefined;
  ruleCents: number | null;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  badge: string;
  onRemove: () => void;
  removing: boolean;
}) {
  const listCents = variant?.priceCents ?? 0;
  const saving = ruleCents !== null ? savingLabel(ruleCents, listCents) : null;

  return (
    <div className="border-base-300 flex flex-wrap items-start gap-x-3 gap-y-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" className="font-medium">
            {who}
          </Text>
          <Badge color={tone} variant="soft" size="sm">
            {badge}
          </Badge>
        </div>
        {variant ? (
          <Text className="text-sm">
            {variant.title ?? variant.sku} · normally {formatCents(listCents, variant.currency)}
          </Text>
        ) : (
          <Text className="text-sm">This rule points at a version that no longer exists.</Text>
        )}
        {detail ? <Text className="text-sm">{detail}</Text> : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <Text as="span" className="text-lg font-semibold">
            {ruleCents === null ? '—' : formatCents(ruleCents, variant?.currency ?? 'USD')}
          </Text>
          {saving ? <Text className="text-sm">{saving}</Text> : null}
        </div>
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          shape="square"
          aria-label={`Remove the price for ${who}`}
          loading={removing}
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** Add a price for one customer group on one version of this product. */
function AddGroupPrice({
  product,
  data,
  productId,
}: {
  product: Product;
  data: TradePricing;
  productId: string;
}) {
  const toast = useToast();
  const add = useAddTierOverride(productId);

  const liveTiers = data.tiers;
  const firstTier = liveTiers[0]?.id ?? '';
  const firstVariant = data.variants[0]?.id ?? '';

  const tierItems = useMemo(
    () =>
      Object.fromEntries(
        liveTiers.map((tier) => [
          tier.id,
          `${tier.name}${
            tier.accountCount > 0
              ? ` · ${String(tier.accountCount)} ${tier.accountCount === 1 ? 'business' : 'businesses'}`
              : ' · nobody in it yet'
          }`,
        ])
      ),
    [liveTiers]
  );
  const variantItems = useMemo(
    () =>
      Object.fromEntries(
        data.variants.map((variant) => [
          variant.id,
          `${variant.title ?? variant.sku} · ${formatCents(variant.priceCents, variant.currency)}`,
        ])
      ),
    [data.variants]
  );

  const [tierId, setTierId] = useState(firstTier);
  const [variantId, setVariantId] = useState(firstVariant);
  const [mode, setMode] = useState<'fixed' | 'percent'>('percent');
  const [amount, setAmount] = useState('');

  const chosenVariant = data.variants.find((v) => v.id === variantId);
  const numeric = Number(amount);
  const valid =
    tierId !== '' &&
    variantId !== '' &&
    amount.trim() !== '' &&
    Number.isFinite(numeric) &&
    numeric > 0 &&
    (mode === 'fixed' || numeric <= 100);

  const preview =
    valid && chosenVariant
      ? mode === 'fixed'
        ? Math.round(numeric * 100)
        : Math.round(chosenVariant.priceCents * (1 - numeric / 100))
      : null;

  const submit = () => {
    if (!valid) return;
    add.mutate(
      {
        tierId,
        variantId,
        ...(mode === 'fixed'
          ? { priceCents: Math.round(numeric * 100) }
          : { discountPercentage: numeric }),
      },
      {
        onSuccess: () => {
          setAmount('');
          toast.add({ title: 'Price set', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not set that price',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  if (liveTiers.length === 0) {
    return (
      <FormSection title="Set a price for a customer group">
        <Text className="text-sm">
          You have not created any customer groups yet. A group is a set of businesses you charge
          the same way — &ldquo;Wholesale&rdquo;, &ldquo;Trade&rdquo;, &ldquo;Fleet&rdquo;. Create
          one under your trade customers, then come back and set what this product costs them.
        </Text>
      </FormSection>
    );
  }
  if (data.variants.length === 0) {
    return (
      <FormSection title="Set a price for a customer group">
        <Text className="text-sm">
          {product.title} has no versions to price yet. Add one on the product itself first — a
          trade price is set against a specific version, not the product as a whole.
        </Text>
      </FormSection>
    );
  }

  return (
    <FormSection
      title="Set a price for a customer group"
      description="Everyone in that group pays this instead of the normal price."
    >
      <Field>
        <FieldLabel>Which group</FieldLabel>
        <FieldControl
          render={
            <Select
              color="module"
              value={tierId}
              // `items` is not a convenience here: silica renders the TRIGGER's
              // selected label from this map, so a Select given only children
              // shows the raw stored value — a bare UUID sitting where a group
              // name belongs.
              items={tierItems}
              onValueChange={(next) => {
                setTierId(String(next));
              }}
              aria-label="Which group"
            />
          }
        />
      </Field>

      {/* A one-version product has nothing to choose, and a control with one
          option is a question nobody asked. */}
      {data.variants.length > 1 ? (
        <Field>
          <FieldLabel>Which version</FieldLabel>
          <FieldControl
            render={
              <Select
                color="module"
                value={variantId}
                items={variantItems}
                onValueChange={(next) => {
                  setVariantId(String(next));
                }}
                aria-label="Which version"
              />
            }
          />
        </Field>
      ) : null}

      <Field>
        <FieldLabel>How the price is worked out</FieldLabel>
        <FieldControl
          render={
            <Select
              color="module"
              value={mode}
              items={MODE_ITEMS}
              onValueChange={(next) => {
                setMode(next === 'fixed' ? 'fixed' : 'percent');
              }}
              aria-label="How the price is worked out"
            />
          }
        />
      </Field>

      <Field>
        <FieldLabel>{mode === 'fixed' ? 'They pay' : 'Percentage off'}</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              type="number"
              inputMode="decimal"
              min={0}
              max={mode === 'percent' ? 100 : undefined}
              step={mode === 'fixed' ? 0.01 : 0.5}
              value={amount}
              placeholder={mode === 'fixed' ? '39.99' : '15'}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          {preview !== null && chosenVariant
            ? `They would pay ${formatCents(preview, chosenVariant.currency)} instead of ${formatCents(chosenVariant.priceCents, chosenVariant.currency)}.`
            : mode === 'fixed'
              ? 'The whole price they pay, not the amount taken off.'
              : 'Between 0 and 100.'}
        </FieldDescription>
      </Field>

      <div className="flex justify-end">
        <Button color="module" size="sm" disabled={!valid} loading={add.isPending} onClick={submit}>
          <Plus className="size-4" aria-hidden />
          Set this price
        </Button>
      </div>
    </FormSection>
  );
}

function TradePricingBody({
  product,
  data,
  productId,
}: {
  product: Product;
  data: TradePricing;
  productId: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const removeTier = useRemoveTierOverride(productId);
  const removeAccount = useRemoveAccountOverride(productId);
  const removeContract = useRemoveContractPrice(productId);

  const variantById = useMemo(
    () => new Map(data.variants.map((variant) => [variant.id, variant])),
    [data.variants]
  );

  // A tier scoped to `all` discounts this product without anybody having listed
  // it here, which is the difference between "nothing is set up" and "trade
  // customers already pay 15% less". Those tiers get their own card because
  // there is nothing on them to remove from this pane.
  const blanketTiers = data.tiers.filter(
    (tier) => tier.productScope === 'all' && tier.discountValue > 0
  );

  const confirmRemove = async (what: string, consequence: string): Promise<boolean> =>
    confirm({
      title: `Remove the price for ${what}?`,
      description: consequence,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });

  const failed = (error: unknown) => {
    toast.add({
      title: 'Could not remove that price',
      description: productErrorMessage(error, 'Nothing was changed.'),
      type: 'error',
    });
  };

  const nothingSpecific =
    data.tierOverrides.length === 0 &&
    data.accountOverrides.length === 0 &&
    data.contractPrices.length === 0;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Heading level={1} className="text-2xl font-semibold">
          {product.title}
        </Heading>
        <Text className="text-sm">
          What businesses you sell to pay for this, and how that compares with the price everyone
          else sees.
        </Text>
      </div>

      {blanketTiers.length > 0 ? (
        <FormSection
          title="Groups that already get a discount on everything"
          description="These apply to this product automatically. Nothing here was set up for this product in particular."
        >
          <div className="flex flex-col gap-3">
            {blanketTiers.map((tier) => (
              <div
                key={tier.id}
                className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Text as="span" className="font-medium">
                    {tier.name}
                  </Text>
                  <Text className="text-sm">
                    {tier.accountCount === 1
                      ? '1 business is in this group'
                      : `${String(tier.accountCount)} businesses are in this group`}
                    {tier.minOrderCents > 0
                      ? ` · only on orders over ${formatCents(tier.minOrderCents)}`
                      : ''}
                  </Text>
                </div>
                <Badge color="info" variant="soft">
                  {tier.discountType === 'percentage'
                    ? `${String(tier.discountValue)}% off everything`
                    : `${formatCents(Math.round(tier.discountValue * 100))} off everything`}
                </Badge>
              </div>
            ))}
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="Prices set for this product"
        description="Listed strongest first: a price agreed with one business wins over a signed agreement, which wins over a whole group's price."
      >
        {nothingSpecific ? (
          <Text className="text-sm">
            Nothing has been set for {product.title} in particular.{' '}
            {blanketTiers.length > 0
              ? 'The group discounts above still apply to it.'
              : 'Every business pays the normal price for it.'}
          </Text>
        ) : (
          <div className="flex flex-col gap-3">
            {data.accountOverrides.map((rule) => {
              const variant = variantById.get(rule.variantId ?? '');
              const limits = [
                rule.minOrderQty !== null ? `must buy at least ${String(rule.minOrderQty)}` : null,
                rule.maxOrderQty !== null ? `no more than ${String(rule.maxOrderQty)}` : null,
                rule.notes,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <RuleRow
                  key={rule.id}
                  who={rule.accountName}
                  detail={limits === '' ? null : limits}
                  variant={variant}
                  ruleCents={tradeRulePriceCents(rule, variant?.priceCents ?? 0)}
                  tone={rule.accountStatus === 'active' ? 'success' : 'warning'}
                  badge={
                    rule.accountStatus === 'active'
                      ? 'Just this business'
                      : `Just this business · account ${rule.accountStatus}`
                  }
                  removing={removeAccount.isPending}
                  onRemove={() => {
                    void (async () => {
                      const ok = await confirmRemove(
                        rule.accountName,
                        `${rule.accountName} goes back to whatever their group pays for ${product.title}, which may be the normal price. Orders they have already placed keep the price they were charged.`
                      );
                      if (!ok) return;
                      removeAccount.mutate(
                        { accountId: rule.accountId, overrideId: rule.id },
                        {
                          onSuccess: () => {
                            toast.add({ title: 'Price removed', type: 'success' });
                          },
                          onError: failed,
                        }
                      );
                    })();
                  }}
                />
              );
            })}

            {data.contractPrices.map((rule) => {
              const variant = variantById.get(rule.variantId);
              const period = rule.validTo
                ? `Agreed until ${new Date(rule.validTo).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                : 'Agreed with no end date';
              return (
                <RuleRow
                  key={rule.id}
                  who={rule.accountName}
                  detail={[period, rule.notes].filter(Boolean).join(' · ')}
                  variant={variant}
                  ruleCents={rule.priceCents}
                  tone={rule.active ? 'success' : 'neutral'}
                  badge={rule.active ? 'Signed agreement' : 'Agreement expired'}
                  removing={removeContract.isPending}
                  onRemove={() => {
                    void (async () => {
                      const ok = await confirmRemove(
                        `${rule.accountName} (signed agreement)`,
                        `The agreed price of ${formatCents(rule.priceCents)} stops applying and ${rule.accountName} falls back to their group's price. This does not cancel anything you signed on paper — it only stops the system charging it.`
                      );
                      if (!ok) return;
                      removeContract.mutate(rule.id, {
                        onSuccess: () => {
                          toast.add({ title: 'Agreed price removed', type: 'success' });
                        },
                        onError: failed,
                      });
                    })();
                  }}
                />
              );
            })}

            {data.tierOverrides.map((rule) => {
              const variant = variantById.get(rule.variantId ?? '');
              return (
                <RuleRow
                  key={rule.id}
                  who={rule.tierName}
                  detail={
                    rule.tierDeleted
                      ? 'This group has been deleted, so this price no longer applies to anyone.'
                      : rule.notes
                  }
                  variant={variant}
                  ruleCents={tradeRulePriceCents(rule, variant?.priceCents ?? 0)}
                  tone={rule.tierDeleted ? 'neutral' : 'info'}
                  badge={rule.tierDeleted ? 'Group deleted' : 'Everyone in this group'}
                  removing={removeTier.isPending}
                  onRemove={() => {
                    void (async () => {
                      const ok = await confirmRemove(
                        `everyone in ${rule.tierName}`,
                        `Every business in ${rule.tierName} goes back to paying that group's usual discount on ${product.title} — or the normal price if the group has none.`
                      );
                      if (!ok) return;
                      removeTier.mutate(
                        { tierId: rule.tierId, overrideId: rule.id },
                        {
                          onSuccess: () => {
                            toast.add({ title: 'Price removed', type: 'success' });
                          },
                          onError: failed,
                        }
                      );
                    })();
                  }}
                />
              );
            })}
          </div>
        )}
      </FormSection>

      <AddGroupPrice product={product} data={data} productId={productId} />
    </>
  );
}

export function ProductTradePricingSurface({ ctx }: { ctx: SurfaceContext }) {
  const scope = useProductScope(ctx, { label: LABEL });
  const productId = scope.productId ?? 'new';
  const pricing = useTradePricing(productId);

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} />;
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${LABEL} actions`}
        controls={
          <>
            <Building2 className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {scope.product.title}
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
            isFetching={pricing.isFetching}
            updatedAt={pricing.dataUpdatedAt}
            onRefresh={() => {
              void pricing.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <FollowingNotice scope={scope} />

          {/* A failed load REPLACES the body. Rendering the add form beside a
              list that could not be read would let someone set a second price
              on top of one they cannot see. */}
          {pricing.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load trade pricing"
              description={productErrorMessage(
                pricing.error,
                'This is a problem reaching the server. Nothing about your prices has changed.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void pricing.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : pricing.data ? (
            <TradePricingBody
              product={scope.product}
              data={pricing.data}
              productId={scope.productId}
            />
          ) : (
            <p className="text-sm" role="status">
              Loading…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
