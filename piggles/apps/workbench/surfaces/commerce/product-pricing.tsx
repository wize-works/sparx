'use client';

// The Pricing tab — what each version costs you, what it sells for, and the
// prices that are worked out rather than typed.
//
// ── The line this tab draws with Variants ────────────────────────────────
//
// Variants and Pricing both touch `priceCents`, `compareAtPriceCents` and
// `costCents`, and there is exactly ONE write behind both: `useUpdateVariant` in
// products-data.ts. This tab does not declare a second one. Two mutations
// against one column is how a price saved on Variants comes back as the old one
// on Pricing while both panes sit open beside each other.
//
// What separates them is the QUESTION each answers. Variants is the register of
// what exists — codes, barcodes, weights, sizes, what happens when one runs out
// — and price is one column in that table. This tab is about the money on its
// own: what you paid, what you charge, what you make, and the machinery that
// decides those for you (a markup rule, a quantity break). A shopkeeper working
// out margins is not doing the same job as one entering a new SKU.
//
// ── Rule-bound prices are READ-ONLY, and that is the point ───────────────
//
// A variant bound to a markup rule has a DERIVED price: the server recomputes it
// from cost whenever the cost moves. Leaving the field editable would let
// someone type a price that a background worker silently overwrites an hour
// later — the worst kind of bug, because nothing appears to go wrong. So the
// field is replaced by what the rule is doing, plus one button to take the
// variant off the rule and price it by hand.
//
// ── A card per version, not a table ──────────────────────────────────────
//
// A table would be the obvious shape and it is wrong here at both ends. On a
// product with one version it is a header row above a single row of numbers; on
// a docked 320px pane it is five columns of money in 300px. A card per version,
// with the fields reflowing from one column to three, reads at both sizes and
// leaves room for the sentence a rule-bound or supplier-sourced version needs.

import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import {
  Badge,
  Button,
  Card,
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
import { faPlus, faTags, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { FormSection } from '../../components/form-section';
import { MoneyInput } from '../../components/money-input';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useTabSave } from './product-tab-save';
import {
  formatCents,
  productErrorMessage,
  useBindVariantMarkup,
  useCreateBulkTier,
  useDeleteBulkTier,
  useDropshipSuppliers,
  useMarkupRules,
  useProductBulkTiers,
  useProductOptions,
  useProductPriceListEntries,
  useProductVariants,
  useUnbindVariantMarkup,
  useUpdateVariant,
  type BulkPriceTier,
  type DropshipSupplier,
  type MarkupRule,
  type Product,
  type ProductOption,
  type ProductPriceListEntry,
  type Variant,
} from './products-data';
import { PaneEmpty } from '../../components/pane-empty';
import { PaneLoadError } from '../../components/pane-load-error';
import { SaveFailure } from '@/components/save-failure';

/** Registry module for this tab, so the brand draws Sell's own picture rather
 *  than the generic one. */
const MODULE = 'commerce';

/* ── Drafts ─────────────────────────────────────────────────────────────── */

/** Money is held in whole units while it is being typed — `MoneyInput` works in
 *  dollars, the API in cents — and converted back on save. Nullable fields are
 *  `null` when empty so "cleared" survives the round trip as something other
 *  than zero: a cost of $0.00 and no cost recorded are different facts. */
interface PriceDraft {
  price: number;
  compareAt: number | null;
  cost: number | null;
}

function toPriceDraft(variant: Variant): PriceDraft {
  return {
    price: variant.priceCents / 100,
    compareAt: variant.compareAtPriceCents == null ? null : variant.compareAtPriceCents / 100,
    cost: variant.costCents == null ? null : variant.costCents / 100,
  };
}

type PriceDrafts = Record<string, PriceDraft>;

function toDrafts(variants: Variant[]): PriceDrafts {
  return Object.fromEntries(variants.map((variant) => [variant.id, toPriceDraft(variant)]));
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function samePrices(a: PriceDraft, b: PriceDraft): boolean {
  return (
    cents(a.price) === cents(b.price) &&
    (a.compareAt == null ? null : cents(a.compareAt)) ===
      (b.compareAt == null ? null : cents(b.compareAt)) &&
    (a.cost == null ? null : cents(a.cost)) === (b.cost == null ? null : cents(b.cost))
  );
}

/* ── Saying what the numbers mean ───────────────────────────────────────── */

/**
 * What to CALL a version, in the words its owner would use.
 *
 * A stored title wins. Failing that, the option values it sits on ("White",
 * "Large · Cobalt") — because that is what the merchant chose it by and what a
 * shopper sees. The product code is the last resort, and when it IS the name
 * the card must not then repeat it underneath as "Product code WW-MUG-01": a
 * heading and a subtitle saying the same string is the surest sign a screen was
 * assembled from fields rather than written.
 */
function variantLabel(variant: Variant, options: ProductOption[]): string {
  if (variant.title?.trim()) return variant.title;
  const values = options
    .flatMap((option) => option.values.filter((value) => variant.optionValueIds.includes(value.id)))
    .map((value) => value.value);
  return values.length > 0 ? values.join(' · ') : variant.sku;
}

/**
 * What you keep on a sale, as money and as a share of the price.
 *
 * Returned as a sentence rather than a number because "42%" alone is ambiguous
 * — margin on the price and markup on the cost are different figures and people
 * mean both by "42%". Null when there is no cost to work from; an invented zero
 * cost would report a 100% margin on everything.
 */
function marginLine(
  draft: PriceDraft
): { text: string; tone: 'success' | 'warning' | 'error' } | null {
  if (draft.cost == null) return null;
  const price = cents(draft.price);
  const cost = cents(draft.cost);
  if (price <= 0) return null;
  const profit = price - cost;
  const share = Math.round((profit / price) * 100);
  return {
    text: `You keep ${formatCents(profit)} on each one — ${String(share)}% of the price.`,
    tone: profit < 0 ? 'error' : share < 15 ? 'warning' : 'success',
  };
}

/** What a rule DOES, in one phrase, so nobody has to open the rules surface to
 *  find out why a price is what it is. */
function ruleSummary(rule: MarkupRule): string {
  const basis =
    rule.costBasis === 'supplier_cost'
      ? 'what your supplier charges'
      : rule.costBasis === 'avg_cost'
        ? 'your average cost'
        : 'what you last paid';
  if (rule.method === 'percent' && rule.value != null) {
    return `Adds ${String(rule.value)}% to ${basis}.`;
  }
  if (rule.method === 'multiplier' && rule.value != null) {
    return `Multiplies ${basis} by ${String(rule.value)}.`;
  }
  if (rule.method === 'fixed' && rule.value != null) {
    return `Adds ${formatCents(rule.value)} to ${basis}.`;
  }
  return `Works the price out from ${basis}.`;
}

/* ── The tab ────────────────────────────────────────────────────────────── */

export function ProductPricingTab({ product }: { ctx: SurfaceContext; product: Product }) {
  const toast = useToast();
  const confirm = useConfirm();

  const variantsQuery = useProductVariants(product.id);
  const optionsQuery = useProductOptions(product.id);
  const tiersQuery = useProductBulkTiers(product.id);
  const rulesQuery = useMarkupRules();
  const suppliersQuery = useDropshipSuppliers();

  const variants = useMemo(() => variantsQuery.data ?? [], [variantsQuery.data]);
  const options = useMemo(() => optionsQuery.data ?? [], [optionsQuery.data]);
  const tiers = useMemo(() => tiersQuery.data ?? [], [tiersQuery.data]);
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);

  const suppliersById = useMemo(() => {
    const map = new Map<string, DropshipSupplier>();
    for (const supplier of suppliersQuery.data ?? []) map.set(supplier.id, supplier);
    return map;
  }, [suppliersQuery.data]);
  const rulesById = useMemo(() => {
    const map = new Map<string, MarkupRule>();
    for (const rule of rules) map.set(rule.id, rule);
    return map;
  }, [rules]);

  const update = useUpdateVariant(product.id);
  const bindRule = useBindVariantMarkup(product.id);
  const unbindRule = useUnbindVariantMarkup(product.id);

  const saved = useMemo(() => toDrafts(variants), [variants]);
  const [drafts, setDrafts] = useState<PriceDrafts>(saved);
  const [touched, setTouched] = useState(false);
  // Track the server's copy when it changes under a CLEAN form — a rule bind
  // recomputes prices, and the fields must land on the new ones. A dirty form is
  // never overwritten.
  useEffect(() => {
    if (!touched) setDrafts(saved);
  }, [saved, touched]);

  // Errors from the ACTIONS on this tab — binding a rule, adding or removing a
  // quantity break. NOT from Save: that rejects and the toolbar reports it, so a
  // save failure must never also land here as a second message saying the same
  // thing in weaker words.
  const [failure, setFailure] = useState<string | null>(null);

  const changed = variants.filter((variant) => {
    const before = saved[variant.id];
    const now = drafts[variant.id];
    return before && now && !samePrices(before, now);
  });
  const dirty = changed.length > 0;

  const setDraft = (variantId: string, patch: Partial<PriceDraft>) => {
    setTouched(true);
    setDrafts((current) => {
      const existing = current[variantId];
      if (!existing) return current;
      return { ...current, [variantId]: { ...existing, ...patch } };
    });
  };

  // Save lives in the pane toolbar and acts on the showing tab — see
  // product-tab-save.tsx. The write is `useUpdateVariant`, the SAME mutation the
  // Variants tab uses; this tab deliberately declares no second path to those
  // three columns.
  useTabSave({
    dirty,
    saving: update.isPending,
    save: async () => {
      // Safe when nothing has changed — the toolbar disables its button, but a
      // keyboard shortcut can still reach this.
      if (!dirty) return;
      // One call per CHANGED version, in order. Not a bulk endpoint because there
      // isn't one for arbitrary per-variant values, and not parallel because a
      // mid-flight failure should leave a knowable state: everything before the
      // failure saved, everything after untouched. The rejection travels up to
      // the toolbar rather than being caught here — a swallowed error would let
      // the button report a save that half happened.
      for (const variant of changed) {
        const draft = drafts[variant.id];
        if (!draft) continue;
        await update.mutateAsync({
          id: variant.id,
          patch: {
            priceCents: cents(draft.price),
            compareAtPriceCents: draft.compareAt == null ? null : cents(draft.compareAt),
            costCents: draft.cost == null ? null : cents(draft.cost),
          },
        });
      }
      setTouched(false);
    },
  });

  const onBindRule = async (variant: Variant, ruleId: string) => {
    const rule = rulesById.get(ruleId);
    if (!rule) return;
    const ok = await confirm({
      title: `Let “${rule.name}” set the price of ${variantLabel(variant, options)}?`,
      description: `${ruleSummary(rule)} Its price of ${formatCents(variant.priceCents)} will be replaced right away, and worked out again every time what you paid changes. You can go back to setting it yourself at any time.`,
      confirmLabel: 'Use this rule',
      cancelLabel: 'Leave the price as it is',
      color: 'warning',
    });
    if (!ok) return;
    setFailure(null);
    bindRule.mutate(
      { variantId: variant.id, ruleId },
      {
        onSuccess: () => {
          toast.add({
            title: `${variantLabel(variant, options)} is now priced by a rule`,
            type: 'success',
          });
        },
        onError: (error) => {
          setFailure(productErrorMessage(error, 'The rule could not be applied.'));
        },
      }
    );
  };

  const onUnbindRule = (variant: Variant) => {
    setFailure(null);
    unbindRule.mutate(variant.id, {
      onSuccess: () => {
        toast.add({
          title: `You set the price of ${variantLabel(variant, options)} again`,
          description: 'The price it has now was kept — nothing was reset.',
          type: 'success',
        });
      },
      onError: (error) => {
        setFailure(productErrorMessage(error, 'The rule could not be removed.'));
      },
    });
  };

  // A failed load REPLACES the tab rather than rendering empty money fields
  // beside a Save that would write zeroes over real prices. All three non-ready
  // states are carded like the ready one — a stack of per-version cards — so the
  // tab does not jump as the prices arrive. The empty-state shape rather than an
  // Alert: there is no content behind it for a banner to sit over.
  if (variantsQuery.isError) {
    return (
      <Card>
        <PaneLoadError
          module={MODULE}
          icon={<Icon glyph={faTags} className="size-6" aria-hidden />}
          title="Could not load this product’s prices"
          description="This is a problem reaching the server. Nothing about your prices has changed — they just could not be read just now."
          onRetry={() => {
            void variantsQuery.refetch();
          }}
        />
      </Card>
    );
  }

  if (variantsQuery.isPending) {
    return (
      <Card>
        <PaneWaiting module={MODULE} />
      </Card>
    );
  }

  if (variants.length === 0) {
    return (
      <Card>
        <PaneEmpty
          module={MODULE}
          icon={<Icon glyph={faTags} className="size-6" aria-hidden />}
          title="This product has no versions to price"
          description="Every product is sold as at least one version, and that is what carries a price. Add one on the Variants tab and its price will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SaveFailure title="That did not work" message={failure} />

      {variants.map((variant) => (
        <VariantPricing
          key={variant.id}
          variant={variant}
          options={options}
          draft={drafts[variant.id] ?? toPriceDraft(variant)}
          rule={variant.markupRuleId ? (rulesById.get(variant.markupRuleId) ?? null) : null}
          supplier={
            variant.dropshipSourceId ? (suppliersById.get(variant.dropshipSourceId) ?? null) : null
          }
          availableRules={rules.filter((rule) => rule.isActive)}
          busy={bindRule.isPending || unbindRule.isPending}
          showTitle={variants.length > 1}
          onChange={(patch) => {
            setDraft(variant.id, patch);
          }}
          onBindRule={(ruleId) => {
            void onBindRule(variant, ruleId);
          }}
          onUnbindRule={() => {
            onUnbindRule(variant);
          }}
        />
      ))}

      <BulkTiers
        productId={product.id}
        variants={variants}
        options={options}
        tiers={tiers}
        isPending={tiersQuery.isPending}
        isError={tiersQuery.isError}
        onRetry={() => {
          void tiersQuery.refetch();
        }}
      />

      <TradePriceLists productId={product.id} variants={variants} options={options} />
    </div>
  );
}

/* ── Trade price lists ──────────────────────────────────────────────────── */

/**
 * What this product costs on each of your trade price lists.
 *
 * READ-ONLY, and that is deliberate. A price-list entry is authored on the
 * price list itself — the list decides its currency, who it covers and when it
 * is live, none of which belongs on one product's tab. So this shows the prices
 * and says where they are changed rather than duplicating a list editor here,
 * exactly as the trade-pricing pane keeps the account-override create path on
 * the account side.
 *
 * The read is ONE request for the whole product
 * (`useProductPriceListEntries`), never a loop over price lists — the N+1 the
 * shared data layer exists to prevent.
 */
function tradePriceLine(
  entry: ProductPriceListEntry,
  variant: Variant | undefined
): { price: string; note: string | null } {
  const currency = entry.currency;
  const normal = variant?.priceCents ?? null;

  if (entry.fixedPriceCents != null) {
    return {
      price: formatCents(entry.fixedPriceCents, currency),
      note:
        normal != null && normal !== entry.fixedPriceCents
          ? `usually ${formatCents(normal, currency)}`
          : null,
    };
  }
  if (entry.percentOffList != null) {
    const off = `${String(entry.percentOffList)}% off`;
    if (normal == null) return { price: off, note: null };
    const effective = Math.round(normal * (1 - entry.percentOffList / 100));
    return {
      price: formatCents(effective, currency),
      note: `${off} the usual ${formatCents(normal, currency)}`,
    };
  }
  return { price: '—', note: null };
}

/** The buy-this-many condition on an entry, in words, or null when it applies
 *  to any quantity. */
function quantityCondition(entry: ProductPriceListEntry): string | null {
  if (entry.maxQuantity != null) {
    return `buying ${String(entry.minQuantity)}–${String(entry.maxQuantity)}`;
  }
  if (entry.minQuantity > 1) return `buying ${String(entry.minQuantity)} or more`;
  return null;
}

interface TradePriceList {
  id: string;
  name: string;
  status: string;
  currency: string;
  entries: ProductPriceListEntry[];
}

function TradePriceLists({
  productId,
  variants,
  options,
}: {
  productId: string;
  variants: Variant[];
  options: ProductOption[];
}) {
  const query = useProductPriceListEntries(productId);
  const entries = useMemo(() => query.data ?? [], [query.data]);

  const variantById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants]
  );

  // Group the flat entry list into one card per price list, preserving the
  // server's order (priority desc, then SKU, then quantity).
  const lists = useMemo<TradePriceList[]>(() => {
    const map = new Map<string, TradePriceList>();
    for (const entry of entries) {
      const existing = map.get(entry.priceListId);
      if (existing) {
        existing.entries.push(entry);
      } else {
        map.set(entry.priceListId, {
          id: entry.priceListId,
          name: entry.priceListName,
          status: entry.priceListStatus,
          currency: entry.currency,
          entries: [entry],
        });
      }
    }
    return [...map.values()];
  }, [entries]);

  return (
    <FormSection
      title="Prices for your trade customers"
      description="A price list is a set of prices for particular customers — a wholesale sheet, a distributor's rates. These are set up on the price list itself, and shown here so you can see what this product costs on each. Anything on a list overrides the prices above for the customers it covers."
    >
      {query.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text className="text-sm">
            Your trade price lists could not be read just now. Nothing about them has changed.
          </Text>
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : query.isPending ? (
        <PaneWaiting />
      ) : lists.length === 0 ? (
        <Text className="text-sm">
          This product is not on any trade price list yet. Every customer pays the prices above
          until you add it to one.
        </Text>
      ) : (
        <div className="flex flex-col gap-4">
          {lists.map((list) => (
            <div key={list.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level={3} className="text-base font-semibold">
                  {list.name}
                </Heading>
                <Badge
                  color={list.status === 'active' ? 'success' : 'warning'}
                  variant="soft"
                  size="sm"
                >
                  {list.status === 'active' ? 'Live' : 'Not live yet'}
                </Badge>
              </div>
              <ul className="flex flex-col gap-1">
                {list.entries.map((entry) => {
                  const variant = variantById.get(entry.variantId);
                  const name = variant ? variantLabel(variant, options) : entry.variantSku;
                  const condition = quantityCondition(entry);
                  const line = tradePriceLine(entry, variant);
                  return (
                    <li
                      key={entry.id}
                      className="border-base-300 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-2 last:border-b-0 last:pb-0"
                    >
                      <Text as="span" className="min-w-0 flex-1 text-sm">
                        {name}
                        {condition ? ` · ${condition}` : ''}
                      </Text>
                      <div className="text-right">
                        <Text as="span" className="font-semibold tabular-nums">
                          {line.price}
                        </Text>
                        {line.note ? <Text className="text-sm">{line.note}</Text> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </FormSection>
  );
}

/* ── One version's money ────────────────────────────────────────────────── */

function VariantPricing({
  variant,
  options,
  draft,
  rule,
  supplier,
  availableRules,
  busy,
  showTitle,
  onChange,
  onBindRule,
  onUnbindRule,
}: {
  variant: Variant;
  options: ProductOption[];
  draft: PriceDraft;
  rule: MarkupRule | null;
  supplier: DropshipSupplier | null;
  availableRules: MarkupRule[];
  busy: boolean;
  showTitle: boolean;
  onChange: (patch: Partial<PriceDraft>) => void;
  onBindRule: (ruleId: string) => void;
  onUnbindRule: () => void;
}) {
  const byRule = variant.markupRuleId != null;
  const margin = marginLine(draft);
  const name = variantLabel(variant, options);

  return (
    <FormSection
      title={showTitle ? name : 'What it costs and sells for'}
      // Only when the name is NOT already the code. On a version with no options
      // and no title the heading IS the code, and repeating it here as "Product
      // code WW-MUG-01" says the same string twice.
      description={showTitle && name !== variant.sku ? `Product code ${variant.sku}` : undefined}
      action={
        supplier ? (
          <Badge color="info" variant="soft" size="sm">
            Priced by {supplier.name}
          </Badge>
        ) : byRule ? (
          <Badge color="info" variant="soft" size="sm">
            Priced by a rule
          </Badge>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-4 @md:grid-cols-3">
        <Field>
          <FieldLabel>Price</FieldLabel>
          <FieldControl
            render={
              byRule ? (
                <Input
                  color="neutral"
                  readOnly
                  value={formatCents(variant.priceCents, variant.currency)}
                  aria-label="Price, worked out by a rule"
                  className="text-right tabular-nums"
                />
              ) : (
                <MoneyInput
                  color="module"
                  value={draft.price}
                  aria-label="Price"
                  onValueChange={(next) => {
                    onChange({ price: next });
                  }}
                />
              )
            }
          />
          <FieldDescription>
            {byRule ? 'Worked out for you — see below.' : 'What a shopper pays.'}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Was</FieldLabel>
          <FieldControl
            render={
              <MoneyInput
                color="module"
                value={draft.compareAt ?? 0}
                aria-label="Was price"
                onValueChange={(next) => {
                  onChange({ compareAt: next === 0 ? null : next });
                }}
              />
            }
          />
          <FieldDescription>
            The old price, shown crossed out beside the new one. Leave it at zero if this is not on
            offer.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>What it cost you</FieldLabel>
          <FieldControl
            render={
              <MoneyInput
                color="module"
                value={draft.cost ?? 0}
                aria-label="Cost"
                onValueChange={(next) => {
                  onChange({ cost: next === 0 ? null : next });
                }}
              />
            }
          />
          <FieldDescription>
            Only you see this. It is what your profit — and any pricing rule — is worked out from.
          </FieldDescription>
        </Field>
      </div>

      {margin ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={margin.tone} variant="soft" size="sm">
            {margin.tone === 'error'
              ? 'Selling at a loss'
              : margin.tone === 'warning'
                ? 'Thin margin'
                : 'Healthy margin'}
          </Badge>
          <Text as="span" className="text-sm">
            {margin.text}
          </Text>
        </div>
      ) : null}

      {/* The rule, and the way off it. Sits under the numbers because it EXPLAINS
          them; above, it would read as a filter on the fields. */}
      <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
        {byRule && rule ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Heading level={3} className="text-base font-semibold">
                {rule.name}
              </Heading>
              <Text className="text-sm">
                {ruleSummary(rule)} The price above changes on its own whenever what you paid
                changes.
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={busy}
              onClick={onUnbindRule}
            >
              Set the price myself
            </Button>
          </div>
        ) : byRule ? (
          // Bound to a rule we could not name — the rules list failed or the rule
          // was deleted underneath it. Say the true thing rather than pretending
          // the price is typed.
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text className="text-sm">
              This price is worked out by a rule that could not be loaded just now.
            </Text>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={busy}
              onClick={onUnbindRule}
            >
              Set the price myself
            </Button>
          </div>
        ) : availableRules.length === 0 ? (
          <Text className="text-sm">
            You can have prices worked out for you from what you paid — add a pricing rule and it
            will be offered here.
          </Text>
        ) : (
          <Field>
            <FieldLabel>Have the price worked out for you</FieldLabel>
            <FieldControl
              render={
                <Select
                  color="module"
                  aria-label="Pricing rule"
                  placeholder="Choose a pricing rule"
                  value=""
                  items={Object.fromEntries(
                    availableRules.map((option) => [option.id, option.name])
                  )}
                  onValueChange={(next) => {
                    const id = String(next);
                    if (id) onBindRule(id);
                  }}
                />
              }
            />
            <FieldDescription>
              Instead of typing a price, add a set amount or percentage to what this cost you. You
              will be asked to confirm before anything changes.
            </FieldDescription>
          </Field>
        )}
      </div>
    </FormSection>
  );
}

/* ── Quantity discounts ─────────────────────────────────────────────────── */

/**
 * "Buy ten and each one is cheaper."
 *
 * A card per version with a row per tier — NOT a grouped table. A grouped table
 * repeats its header for every version, and the columns ("Version", "Quantity",
 * "Price") would be inventing structure for two numbers.
 *
 * There is no update endpoint for a tier, only create and delete, so changing
 * one means removing it and adding it again. That is stated rather than hidden
 * behind a fake edit affordance: an "edit" that deletes and recreates has a
 * failure mode (deleted, then the create fails) the operator should be able to
 * see coming.
 */
function BulkTiers({
  productId,
  variants,
  options,
  tiers,
  isPending,
  isError,
  onRetry,
}: {
  productId: string;
  variants: Variant[];
  options: ProductOption[];
  tiers: BulkPriceTier[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateBulkTier(productId);
  const remove = useDeleteBulkTier(productId);

  const [variantId, setVariantId] = useState(() => variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState(10);
  const [unitPrice, setUnitPrice] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  const byVariant = useMemo(() => {
    const map = new Map<string, BulkPriceTier[]>();
    for (const tier of tiers) {
      if (!tier.variantId) continue;
      map.set(tier.variantId, [...(map.get(tier.variantId) ?? []), tier]);
    }
    for (const list of map.values()) list.sort((a, b) => a.minQuantity - b.minQuantity);
    return map;
  }, [tiers]);

  const target = variants.find((variant) => variant.id === variantId) ?? variants[0] ?? null;

  const onAdd = () => {
    if (!target || quantity < 2 || unitPrice <= 0) return;
    setFailure(null);
    create.mutate(
      { variantId: target.id, minQuantity: quantity, unitPriceCents: cents(unitPrice) },
      {
        onSuccess: () => {
          setUnitPrice(0);
          toast.add({ title: 'Quantity discount added', type: 'success' });
        },
        onError: (error) => {
          setFailure(productErrorMessage(error, 'The discount could not be added.'));
        },
      }
    );
  };

  const onDelete = async (tier: BulkPriceTier, variant: Variant) => {
    const ok = await confirm({
      title: `Remove the ${String(tier.minQuantity)}-or-more price on ${variantLabel(variant, options)}?`,
      description: `Shoppers buying ${String(tier.minQuantity)} or more will pay the normal price of ${formatCents(variant.priceCents, variant.currency)} each instead of ${formatCents(tier.unitPriceCents, variant.currency)}. Orders already placed are unaffected.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    setFailure(null);
    remove.mutate(tier.id, {
      onSuccess: () => {
        toast.add({ title: 'Quantity discount removed', type: 'success' });
      },
      onError: (error) => {
        setFailure(productErrorMessage(error, 'The discount could not be removed.'));
      },
    });
  };

  return (
    <FormSection
      title="Cheaper by the dozen"
      description="Set a lower price per item once someone buys enough of them. Leave this alone if you charge the same however many they take."
    >
      <SaveFailure title="That did not work" message={failure} />

      {isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text className="text-sm">
            Your quantity discounts could not be read just now. Nothing about them has changed.
          </Text>
          <Button size="sm" variant="outline" color="neutral" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <PaneWaiting />
      ) : tiers.length === 0 ? (
        <Text className="text-sm">
          No quantity discounts yet. Everyone pays the same price however many they buy.
        </Text>
      ) : (
        <div className="flex flex-col gap-4">
          {variants
            .filter((variant) => (byVariant.get(variant.id) ?? []).length > 0)
            .map((variant) => (
              <div key={variant.id} className="flex flex-col gap-2">
                {variants.length > 1 ? (
                  <Heading level={3} className="text-base font-semibold">
                    {variantLabel(variant, options)}
                  </Heading>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {(byVariant.get(variant.id) ?? []).map((tier) => (
                    <li
                      key={tier.id}
                      className="border-base-300 flex flex-wrap items-center gap-2 border-b pb-2 last:border-b-0"
                    >
                      <Text as="span" className="min-w-0 flex-1 text-sm">
                        Buy {tier.minQuantity} or more —{' '}
                        <span className="font-semibold tabular-nums">
                          {formatCents(tier.unitPriceCents, variant.currency)}
                        </span>{' '}
                        each
                      </Text>
                      <Badge color="success" variant="soft" size="sm">
                        {Math.max(
                          0,
                          Math.round(
                            ((variant.priceCents - tier.unitPriceCents) / variant.priceCents) * 100
                          )
                        )}
                        % off
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        shape="square"
                        aria-label={`Remove the ${String(tier.minQuantity)}-or-more price on ${variantLabel(variant, options)}`}
                        loading={remove.isPending}
                        onClick={() => {
                          void onDelete(tier, variant);
                        }}
                      >
                        <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
          {variants.length > 1 ? (
            <Field>
              <FieldLabel>Which version</FieldLabel>
              <FieldControl
                render={
                  <Select
                    color="module"
                    aria-label="Which version this discount is for"
                    value={target?.id ?? ''}
                    items={Object.fromEntries(
                      variants.map((variant) => [variant.id, variantLabel(variant, options)])
                    )}
                    onValueChange={(next) => {
                      setVariantId(String(next));
                    }}
                  />
                }
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel>From this many</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  type="number"
                  min={2}
                  step={1}
                  inputMode="numeric"
                  className="text-right tabular-nums"
                  aria-label="Quantity this discount starts at"
                  value={String(quantity)}
                  onChange={(event) => {
                    setQuantity(Number(event.target.value) || 0);
                  }}
                />
              }
            />
          </Field>
          <Field>
            <FieldLabel>Each one costs</FieldLabel>
            <FieldControl
              render={
                <MoneyInput
                  color="module"
                  value={unitPrice}
                  aria-label="Price per item at this quantity"
                  onValueChange={setUnitPrice}
                />
              }
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Text className="text-sm">
            {!target
              ? 'Add a version first.'
              : quantity < 2
                ? 'A quantity discount starts at two or more.'
                : unitPrice <= 0
                  ? 'Set what each one costs at that quantity.'
                  : cents(unitPrice) >= target.priceCents
                    ? `That is not cheaper than the normal price of ${formatCents(target.priceCents, target.currency)} — shoppers would be better off buying fewer.`
                    : `Buying ${String(quantity)} or more brings each one down to ${formatCents(cents(unitPrice), target.currency)}.`}
          </Text>
          <Button
            size="sm"
            color="module"
            variant="outline"
            loading={create.isPending}
            disabled={!target || quantity < 2 || unitPrice <= 0}
            onClick={onAdd}
          >
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Add
          </Button>
        </div>
      </div>
    </FormSection>
  );
}
