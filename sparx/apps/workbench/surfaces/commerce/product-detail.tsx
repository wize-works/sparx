'use client';

// One product — add it, then everything about it, across six tabs.
//
// Adding and managing are the same surface because they are the same object at
// two ages, and splitting them means writing the same form twice and keeping
// both in sync forever. The `id === 'new'` branch is genuinely smaller: a
// product is created with a name and a price, then described once it exists.
//
// ── What this file owns, and what it deliberately does not ───────────────
//
// This is a SHELL. It owns: which tabs exist and in what order, the pane
// toolbar's lifecycle actions, the identity header, and announcing the product
// to scoped panes. It owns no field on any tab, and it must not grow to — the
// moment the shell knows what is on the Pricing tab, the six tabs stop being
// independently buildable.
//
//   • Each tab renders its own body and SAVES ITSELF. There is no Save in the
//     pane toolbar; see the rule at the top of product-overview.tsx.
//   • Lifecycle (on sale / off sale) is pane-level because it is about the
//     product as a whole, not any one facet of it.
//
// ── Tab order, and why Options and Variants are separate ─────────────────
//
//   Overview → Options → Variants → Media → Pricing → SEO
//
// The dashboard puts the option editor and the variant table on one tab; we
// deliberately do not. Options are the AXES the product is sold along, and
// editing them is a schema-shaped act with a blast radius — adding a value
// multiplies the grid, removing one destroys the SKUs sitting on it. Variants
// are routine price and code entry. Putting a destructive structural edit on
// the same surface as everyday data entry is how someone rebuilds a lattice
// while meaning to change a price.
//
// The split also makes a real constraint speak for itself: on a product WITH
// options the variant set is DERIVED from the lattice, so you extend it by
// adding a value on Options, not by hand-adding a loose SKU on Variants. That
// reads as an obvious consequence of where things live, rather than as a
// disabled button needing a paragraph of explanation.

import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Switch,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ExternalLink, Share2 } from 'lucide-react';
import { ModuleScope } from '../../components/module-scope';
import { useActiveSiteId } from '../../lib/api/shell-data';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { MoneyInput } from '@/components/money-input';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useDomains } from '../domains/data';
import { useAnnounceProduct } from './product-scope';
import { ProductOverviewTab } from './product-overview';
import { TabValueProvider, useTabSaveRegistry, useVisitedTabs } from './product-tab-save';
import { ProductOptionsTab } from './product-options';
import { ProductVariantsTab } from './product-variants';
import { ProductMediaTab } from './product-media';
import { ProductPricingTab } from './product-pricing';
import { ProductAttributesTab } from './product-attributes';
import { ProductSeoTab } from './product-seo';
import {
  productErrorMessage,
  productState,
  slugifyHandle,
  suggestSku,
  useCreateProduct,
  useProduct,
  usePublishProduct,
  VariantAfterCreateError,
} from './products-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** The one column everything in this pane sits in. Centred and capped, because a
 *  pane torn onto a second monitor is otherwise 2000px of dead grey. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── Adding ─────────────────────────────────────────────────────────────── */

function AddProduct({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateProduct();

  const [title, setTitle] = useState('');
  const [handle, setHandle] = useState('');
  const [touchedHandle, setTouchedHandle] = useState(false);
  const [sku, setSku] = useState('');
  const [touchedSku, setTouchedSku] = useState(false);
  const [price, setPrice] = useState(0);
  const [onSale, setOnSale] = useState(false);

  useEffect(() => {
    ctx.setTitle('New product');
  }, [ctx]);

  // The web address and the code follow the name until someone edits one
  // themselves, at which point it is theirs and typing more of the name must not
  // overwrite it.
  const effectiveHandle = touchedHandle ? handle : slugifyHandle(title);
  const effectiveSku = touchedSku ? sku : suggestSku(title);

  const trimmed = title.trim();
  const dirty = trimmed !== '' || touchedHandle || touchedSku || price > 0;
  useDirtySource(dirty && !create.isSuccess, 'This product has not been added yet. Close anyway?');

  const titleError = trimmed === '' ? 'Give the product a name.' : null;
  const skuError = effectiveSku.trim() === '' ? 'Give the product a code.' : null;

  // A half-created product is a real outcome, not a hypothetical: the product and
  // its price are two writes. If the second fails, the product EXISTS, so the only
  // honest thing to do is say so and land on it — a generic "could not create"
  // would send someone to add it again and end up with two.
  const halfCreated = create.error instanceof VariantAfterCreateError;
  const failure = create.isError
    ? productErrorMessage(create.error, 'Could not add that product. Nothing was created.')
    : null;

  const submit = () => {
    if (titleError || skuError) return;
    create.mutate(
      {
        title: trimmed,
        ...(effectiveHandle ? { handle: effectiveHandle } : {}),
        status: onSale ? 'active' : 'draft',
        sku: effectiveSku.trim(),
        priceCents: Math.round(price * 100),
      },
      {
        onSuccess: (created) => {
          // Becomes the manage view for the product that now exists, rather than
          // leaving a spent form open beside a list that has moved on. The toast
          // follows the swap rather than sharing its commit; see afterPaneChange.
          ctx.open('commerce.product.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${trimmed} added`,
              description: onSale
                ? 'It is on your website now.'
                : 'It is saved but not on sale yet — put it on sale when you are ready.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          if (!(error instanceof VariantAfterCreateError)) return;
          ctx.open('commerce.product.detail', { id: error.productId }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${trimmed} was added without a price`,
              description: 'Set its price here — nobody can buy it until you do.',
              type: 'warning',
            });
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New product actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={create.isPending}
            disabled={Boolean(titleError) || Boolean(skuError)}
            onClick={submit}
          >
            Add product
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Add a product
            </Heading>
            <Text>
              A product is one thing you sell. Give it a name and a price now — the description,
              photos and everything else can follow once it exists.
            </Text>
          </div>

          {/* ONE message, the most specific one. When the product itself was
              created and only its price failed, the pane is already moving to
              that product, so this says what happened rather than claiming
              nothing was created. */}
          {failure ? (
            <Alert color={halfCreated ? 'warning' : 'error'} variant="soft">
              <AlertContent>
                <AlertTitle>
                  {halfCreated
                    ? 'The product was added, but its price was not'
                    : 'Could not add that product'}
                </AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection title="What you are selling">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={title}
                    placeholder="Handmade leather satchel"
                    onChange={(event) => {
                      setTitle(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>What shoppers see. You can change this later.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Web address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={effectiveHandle}
                    placeholder="handmade-leather-satchel"
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => {
                      setTouchedHandle(true);
                      setHandle(slugifyHandle(event.target.value));
                    }}
                  />
                }
              />
              <FieldDescription>
                The end of this product&apos;s page address on your website — yoursite.com/products/
                {effectiveHandle || '…'}
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Price"
            description="Every product needs a price and a code before anyone can buy it, so both are set up here. Once it exists you can add sizes, colors and their own prices on the Options and Variants tabs."
          >
            <Field>
              <FieldLabel>Price</FieldLabel>
              <FieldControl
                render={
                  <MoneyInput
                    color="module"
                    value={price}
                    aria-label="Price"
                    onValueChange={setPrice}
                  />
                }
              />
              <FieldDescription>What a shopper pays. You can change it any time.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Product code</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={skuError ? 'error' : 'module'}
                    value={effectiveSku}
                    placeholder="SATCHEL-1"
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => {
                      setTouchedSku(true);
                      setSku(event.target.value);
                    }}
                  />
                }
              />
              {skuError ? (
                <FieldStatus status="error">{skuError}</FieldStatus>
              ) : (
                <FieldDescription>
                  Your own reference for this product — on labels, on invoices, in your records. It
                  has to be different from every other code you use.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Put it on sale straight away</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={onSale}
                    onCheckedChange={(next: boolean) => {
                      setOnSale(next);
                    }}
                  />
                }
              />
              <FieldDescription>
                Leave this off to save it out of sight and finish it first. Either way you can
                change your mind in one click.
              </FieldDescription>
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/* ── Managing: the tabbed shell ─────────────────────────────────────────── */

/**
 * The six tabs, in order.
 *
 * Declared as data so adding one is a single entry and the ORDER is visible in
 * one place. `plan` is the brief for whoever builds the tab, and doubles as
 * what the operator reads meanwhile — writing it well is not a placeholder
 * chore, it is the specification.
 */
const TABS: { value: string; label: string; what: string; plan: string }[] = [
  { value: 'overview', label: 'Overview', what: '', plan: '' },
  {
    value: 'options',
    label: 'Options',
    what: 'Choosing sizes, colors and other options',
    plan: 'This is where you set up the choices a shopper makes — Size: small, medium, large; Color: red, blue. Each choice can show as a dropdown, a color swatch or a picture. Changing these changes which versions of the product exist, so it is kept apart from everyday price editing.',
  },
  {
    value: 'variants',
    label: 'Variants',
    what: 'Prices and codes for each version',
    plan: 'Every combination of the choices above is a version you can sell, with its own price, product code, barcode, weight and size. This is where you price them and decide what happens when one runs out.',
  },
  {
    value: 'media',
    label: 'Media',
    what: 'Photos',
    plan: 'The pictures shoppers see, in the order they see them. You will be able to choose the main photo and pin a picture to a particular color, so the right image shows when someone picks it.',
  },
  {
    value: 'attributes',
    label: 'Details',
    what: 'The extra details for this kind of product',
    plan: 'Pick what kind of product this is — clothing, food, a gadget — and fill in the extra details that kind carries, like fabric and care, ingredients, or specifications. These show on the product page.',
  },
  {
    value: 'pricing',
    label: 'Pricing',
    what: 'Pricing rules',
    plan: 'Prices that are worked out for you rather than typed — a markup on what you paid, and prices that apply only to certain customers or quantities.',
  },
  {
    value: 'seo',
    label: 'SEO',
    what: 'How it looks in search results',
    plan: 'The title and summary that show on Google when someone finds this product, and the picture used when it is shared on social media.',
  },
];

function ManageProduct({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: product, isPending, isError, error, refetch } = useProduct(id);
  const { data: domains } = useDomains();
  const { data: activeSite } = useActiveSiteId();
  const publish = usePublishProduct(id);
  const [tab, setTab] = useState('overview');

  // Save lives here, in the toolbar, and commits the tab you are standing on.
  // Each tab hands its save up via useTabSave; see product-tab-save.tsx for why
  // the button is not inside the tab body.
  const { provider: tabSaveProvider, state: tabSave } = useTabSaveRegistry(tab);
  const visitedTabs = useVisitedTabs(tab);

  // Pane-level guard covers EVERY tab, not just the visible one — the whole
  // point of the dots is that Pricing can be dirty while you are on Media, and
  // closing the pane would take both with it.
  useDirtySource(tabSave.anyDirty, 'This product has unsaved changes. Close anyway?');

  // Tells every product-scoped pane (Stock, Fitment, …) what to follow. The
  // shell does this, not the tabs — the PANE is what is "about" the product.
  useAnnounceProduct(product?.id ?? null, product?.title ?? null);

  useEffect(() => {
    if (product) ctx.setTitle(product.title);
  }, [ctx, product]);

  if (isError) {
    // A failed load REPLACES the shell. Rendering empty tabs beside a dead Save
    // invites someone to retype a description over the top of nothing.
    return (
      <PaneLoadError
        error={error}
        noun="product"
        title="Could not load this product"
        description="This is a problem reaching the server. The product itself is unaffected — nothing has been lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !product) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const state = productState(product);
  const retired = product.status === 'archived';
  const onSale = product.status === 'active';

  // The address a shopper would reach this product at, on the site being worked
  // in. Every site has at least its sparx.zone address, so this is normally
  // present.
  const propertyId = activeSite?.propertyId ?? null;
  const mine = (domains ?? []).filter(
    (domain) =>
      domain.status !== 'removed' && (propertyId ? domain.propertyId === propertyId : true)
  );
  const host = (mine.find((domain) => domain.isCanonical) ?? mine[0])?.host ?? null;
  const productUrl = host ? `https://${host}/products/${product.handle}` : null;

  const togglePublished = async () => {
    if (onSale) {
      const ok = await confirm({
        title: `Take ${product.title} off sale?`,
        description:
          'It disappears from your website and nobody can buy it. Everything about it is kept, and putting it back on sale is one click.',
        confirmLabel: 'Take it off sale',
        cancelLabel: 'Leave it on sale',
        color: 'warning',
      });
      if (!ok) return;
    }
    publish.mutate(!onSale, {
      onSuccess: () => {
        toast.add({
          title: onSale ? `${product.title} is off sale` : `${product.title} is on sale`,
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
    });
  };

  // The toolbar reports the failure because the toolbar made the claim. A tab's
  // `save` rejects rather than swallowing — see the contract in product-tab-save.
  const saveActiveTab = async () => {
    if (!tabSave.active?.dirty) return;
    try {
      await tabSave.active.save();
      toast.add({ title: 'Saved', type: 'success' });
    } catch (error) {
      toast.add({
        title: 'Could not save',
        description: productErrorMessage(error, 'Your changes are still here — nothing was lost.'),
        type: 'error',
      });
    }
  };

  return tabSaveProvider(
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Product actions"
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {onSale && productUrl ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                className="ml-auto"
                title="Open this product on your website"
                // Empty here, not at runtime — silica's `render` moves this Button's
                // children onto the anchor, which the a11y rule cannot see.
                // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive via `render`
                render={<a href={productUrl} target="_blank" rel="noreferrer" />}
              >
                <span className="hidden @2xl:inline">View</span>
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            ) : null}
            {/* Tell people about it. The moment someone is most likely to want a social
            post is right after putting something on sale — and until this existed the
            composer opened blank and they retyped the title by hand. Wears the SOCIAL
            module's hue via a nested provider, because it surfaces that module's
            functionality on a commerce page. */}
            {onSale ? (
              <ModuleScope module="social">
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  title="Write a social post about this product"
                  onClick={() => {
                    ctx.open(
                      'social.composer',
                      { id: 'new', seedType: 'product', seedId: product.id },
                      { target: 'beside' }
                    );
                  }}
                >
                  <Share2 className="size-4" aria-hidden />
                  <span className="hidden @2xl:inline">Share</span>
                </Button>
              </ModuleScope>
            ) : null}
            {retired ? null : (
              <Button
                size="sm"
                variant="outline"
                color={onSale ? 'neutral' : 'module'}
                className={onSale && productUrl ? undefined : 'ml-auto'}
                loading={publish.isPending}
                onClick={() => {
                  void togglePublished();
                }}
              >
                {onSale ? 'Take off sale' : 'Put on sale'}
              </Button>
            )}
            {/* Save is the surface's primary action, so it sits where a primary
            action belongs — last in the toolbar, filled, next to the lifecycle
            controls. It commits the ACTIVE tab only; the dots on the tab strip
            are what say which other tabs still have work pending. A tab with
            nothing to save never registers, and Save is simply absent there
            rather than present-but-dead, which would be a worse lie. */}
            {tabSave.active ? (
              <Button
                size="sm"
                color="module"
                loading={tabSave.active.saving}
                disabled={!tabSave.active.dirty}
                onClick={() => {
                  void saveActiveTab();
                }}
              >
                Save
              </Button>
            ) : null}
          </>
        }
      />

      {/* ── Why PILLS, and why `module` rather than `module-commerce` ────────
          This app is a tabbed dock, so there are two tab strips within ~40px of
          each other and they mean different things: the dock's strip switches
          DOCUMENTS (closeable, draggable, one per surface), this one switches
          SECTIONS OF ONE RECORD. An underline spans and divides a region, which
          reads as GOVERNING the panel — i.e. as a sibling of the dock strip
          above it. A pill is a closed shape sitting INSIDE a region, which is
          what containment looks like. Pills also keep a legible selected state
          when the pane is docked narrow, where an underline degrades to cramped
          labels and one more hairline competing with every other horizontal
          edge in a dock layout.

          `color="module"`, NOT `color="module-commerce"`. Both compile — both
          are registered in globals.css — but `module` is the ACTIVE-module
          bridge: SurfaceMount wraps every pane in <ModuleScope module={…}> which
          repoints --color-module for that subtree. So `module` resolves to
          whatever module the surface is registered under, automatically.
          Hardcoding `module-commerce` would pin this to commerce orange and
          would be outright wrong on the facet panes registered under other
          modules (Stock is `inventory`, Trade pricing is `b2b`), which are
          supposed to wear their own hue. Every other call site in this app
          spells it `module` for the same reason. */}
      <Tabs
        variant="pills"
        color="module"
        value={tab}
        onValueChange={(next) => {
          setTab(next as string);
        }}
        className="flex min-h-0 flex-1 flex-col gap-2 @lg:gap-3"
      >
        {/* `bg-base-300`, deliberately NOT base-100. The toolbar directly above
            is base-100, so a base-100 strip made the two read as one continuous
            slab with no edge between them. We separate surfaces with edges and
            base-tone shifts rather than shadows, and this is that shift: the
            strip reads as recessed FROM the toolbar rather than part of it.

            `rounded-full` so the strip reads as a TRACK the pills sit inside,
            matching their geometry instead of framing round pills in a square.
            NOT `card`: `card` also sets `flex-direction: column`, which silently
            stacked all six tabs into a full-width vertical column.

            The strip scrolls sideways rather than wrapping: six tabs will not
            fit a pane docked at 320px, and a wrapped second row of tabs moves
            the content down every time the pane is resized.

            SCROLL-REGION INSET — the reason the capsule and the scrolling are
            split across two elements. Padding on the scrolling element does NOT
            keep pills off the curve, because that padding lives inside the
            scrollable content box and scrolls away with it: below ~620px pane
            width the leading pill reached past the edge and its rounded cap
            flattened against the capsule curve, losing up to 6px at its extreme
            top and bottom. So the capsule (background + rounding + horizontal
            inset) sits on a NON-scrolling wrapper, and only the inner region
            scrolls — the pills can never reach the curve because the inset is
            outside the thing that moves. Do not merge these back into one
            element, and do not reduce `px-4` without re-checking a narrow pane. */}
        <div className="bg-base-300 shrink-0 rounded-full px-4 py-2">
          <TabsList scrollable>
            {TABS.map((entry) => (
              // `text-base-content` is not decoration — it is a correction.
              // Silica's own `.tabs-tab` ships its resting ink at 65% alpha, which
              // is a faded token on text a person is meant to READ. Tab labels are
              // navigation: they have to be legible before you click them, and
              // "which section am I not in" is the question the strip exists to
              // answer. The selected tab is already distinguished by a filled
              // pill, so the fade buys no hierarchy it was not already getting for
              // free. Full ink on every label; the pill carries the state.
              <TabsTab key={entry.value} value={entry.value} className="flex items-center gap-1.5">
                {entry.label}
                {/* The dot is what makes a toolbar Save honest. Save commits the
                      tab you are standing on, so something has to say "Pricing
                      still has unsaved work" while you are on Media — placement
                      was never going to carry that. Same device the dock uses on a
                      pane tab, one level down. Announced as well as drawn: a
                      color-only signal is not a signal for everyone. */}
                {tabSave.dirtyTabs.has(entry.value) ? (
                  <>
                    <span
                      // The selected pill is already a solid module fill, so a
                      // `bg-module` dot would vanish into it — invisible on the
                      // one tab you are actually standing on. On the selected
                      // pill the dot wears the pill's own ink; everywhere else
                      // it wears the module hue against the plain strip.
                      className={
                        entry.value === tab
                          ? 'bg-module-content size-1.5 shrink-0 rounded-full'
                          : 'bg-module size-1.5 shrink-0 rounded-full'
                      }
                      aria-hidden
                    />
                    <span className="sr-only">(unsaved changes)</span>
                  </>
                ) : null}
              </TabsTab>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            {/* NO identity header here, deliberately — it used to carry a
                read-only <h1> of the title, the page address in monospace, and a
                dot-separated metadata line, on every tab.

                It went because every part of it was already somewhere better.
                The title and the web address are EDITABLE FIELDS on this very
                tab, and the platform rule is that an entity shows its identity
                ONCE, as the field you change it in — a read-only heading above
                the field it duplicates is the thing that rule exists to stop.
                The dock tab overhead already names the product, so nothing is
                lost by not repeating it. The toolbar already carries status and
                a View link to the live page.

                The monospace address was also the single thing making this read
                like a developer tool rather than a product: monospace says "this
                is a machine identifier you must copy exactly", and a shop owner
                does not think of their product page that way.

                The metadata belongs where it is actionable, not stacked here:
                price on Pricing, version count on Variants. "1 version" was our
                word for it, not theirs. */}

            {/* LAZY-THEN-KEEP. A panel mounts the first time you open its tab
                and then stays mounted for the life of the pane. It has to: a tab
                you edited and navigated away from still owns a draft and a dirty
                dot, and unmounting it would discard the edit and the dot in the
                same instant — losing work while removing the only sign that work
                existed. Never-visited tabs cost nothing, since a tab you have
                not opened cannot be dirty. */}
            <TabsPanel value="overview" className="flex flex-col gap-4">
              {/* ONE status message, on the tab whose business it is. The
                  toolbar badge carries the same state everywhere else, so
                  repeating the paragraph on all six would be noise. */}
              <Alert color={state.tone} variant="soft">
                <AlertContent>
                  <AlertTitle>{state.label}</AlertTitle>
                  <AlertDescription>{state.detail}</AlertDescription>
                </AlertContent>
              </Alert>
              <TabValueProvider value="overview">
                <ProductOverviewTab ctx={ctx} product={product} />
              </TabValueProvider>
            </TabsPanel>

            <TabsPanel value="options">
              {visitedTabs.has('options') ? (
                <TabValueProvider value="options">
                  <ProductOptionsTab ctx={ctx} product={product} />
                </TabValueProvider>
              ) : null}
            </TabsPanel>

            <TabsPanel value="variants">
              {visitedTabs.has('variants') ? (
                <TabValueProvider value="variants">
                  <ProductVariantsTab ctx={ctx} product={product} />
                </TabValueProvider>
              ) : null}
            </TabsPanel>

            <TabsPanel value="media">
              {visitedTabs.has('media') ? (
                <TabValueProvider value="media">
                  <ProductMediaTab ctx={ctx} product={product} />
                </TabValueProvider>
              ) : null}
            </TabsPanel>

            <TabsPanel value="attributes">
              {visitedTabs.has('attributes') ? (
                <TabValueProvider value="attributes">
                  <ProductAttributesTab ctx={ctx} product={product} />
                </TabValueProvider>
              ) : null}
            </TabsPanel>

            <TabsPanel value="pricing">
              {visitedTabs.has('pricing') ? (
                <TabValueProvider value="pricing">
                  <ProductPricingTab ctx={ctx} product={product} />
                </TabValueProvider>
              ) : null}
            </TabsPanel>

            <TabsPanel value="seo">
              {visitedTabs.has('seo') ? (
                <TabValueProvider value="seo">
                  <ProductSeoTab ctx={ctx} product={product} />
                </TabValueProvider>
              ) : null}
            </TabsPanel>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

export function ProductDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <AddProduct ctx={ctx} /> : <ManageProduct ctx={ctx} id={id} />;
}
