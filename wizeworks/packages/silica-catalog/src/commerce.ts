// The commerce/domain composites silica's shipped block library doesn't cover.
//
// silica already ships every primitive + marketing block (navbar, hero, feature
// grid, pricing, FAQ, testimonials, footer, tabs, carousel, forms…) and the whole
// interactive behavior runtime, so sparx's `host.catalog()` only ADDS the
// commerce-domain composites here — merged over silica's defaults via
// `mergeCatalog`, never replacing them.
//
// AUTHORING CONTRACT (builder-contract §5):
//   · every factory returns a FRESH, id-free `Node` (the engine stamps ids on
//     insert), so a factory is called once per insert.
//   · every class is a LITERAL string, so the Tailwind `@source` harness safelists
//     the utilities a freshly-inserted node wears.
//   · data refs are SCOPE-RELATIVE short field keys (`title`, `price`, `image`) —
//     they resolve against the product in scope (a `commerce.product` repeat, a
//     `product` object scope, or an entity pin). The sparx resolver prefixes
//     `item.` when a scope is active; a top-level collection ref (`commerce.product`)
//     names the source directly. See @wizeworks/builder-schemas `silica-resolve`.
//   · `price` binds the raw number; the host resolver's `format` hook renders it as
//     currency — formatting is host territory, never baked into the tree.
//   · a bound image binds a SCALAR `image` ref (the product's primary-image URL);
//     silica's `fillValue` sets `<img src>` / an `Image` atom's `src` prop from a
//     string value (an array ref would fill text, not a src).
//   · a bound ATTRIBUTE (a card's `href`) uses `bindAttr(el, 'href', 'url')`, which
//     sets silica's native `{ kind:'value', ref, attr }`. Binding an `<a>` with a
//     plain `bind()` would replace its children with the URL string and destroy the
//     card. Until silicaui 0.36.0 this needed a hidden carrier input, because the
//     engine stopped resolving children once it filled an attribute binding; it
//     recurses now. See `attr-binding.ts`.

import {
  action,
  atom,
  behave,
  bind,
  el,
  part,
  repeat,
  type ElementNode,
  type Node,
} from '@wizeworks/silicaui-html';

import { bindAttr } from './attr-binding';
import { repeatOrEmpty, visibleWhen } from './conditional';
import { HOST_KEYS, functionalShell, hostCore } from './host-nodes';
import { PLACEHOLDER_IMAGE } from './placeholder';

// The unbound-image placeholder now lives in `placeholder.ts` — record templates in
// other modules (a blog post's featured image) need the same tile, and a second copy
// would drift.

/** The shared product card body — image, title, price. Used standalone (pin it to
 *  one product) and as the repeated item in `product_grid` / `featured_products`.
 *  `extraClass` lets a caller add layout affordances (a fixed width for the
 *  horizontal featured rail) without a second card definition.
 *
 *  The card IS the link: an `<a>` whose `href` is bound to the product's `url`
 *  through `bindAttr` (silica cannot bind an attribute natively — see
 *  `attr-binding.ts`). The whole tile is the hit target, which is what a shopper
 *  expects, and a product with no url degrades to a plain, un-clickable card. */
// Returns the concrete `ElementNode`, not the `Node` union: the card is an `<a>` and
// always will be, and `part()` (like every marker helper) needs a node that can CARRY a
// marker — the union includes `OutletNode`, which cannot. Widening here would force a
// cast at every marker call site for no gain.
function productCardNode(extraClass = ''): ElementNode {
  const base =
    'card bg-base-100 border border-base-300 rounded-box overflow-hidden block hover:border-primary';
  return bindAttr(
    el('a', extraClass ? `${base} ${extraClass}` : base, {
      children: [
        bind(
          atom('Image', 'aspect-square w-full object-cover', {
            src: PLACEHOLDER_IMAGE,
            alt: 'Product image',
          }),
          'image'
        ),
        // `gap-2`, not the half-step `gap-1.5`: the declared vocabulary has no half
        // steps, so `gap-1.5` compiles only while this file is @source-scanned and
        // emits nothing once the class is living in a tenant's stored tree.
        el('div', 'flex flex-col gap-2 p-4', {
          children: [
            bind(el('h3', 'font-semibold text-base-content', { text: 'Product name' }), 'title'),
            // INK, not the brand role. `text-primary` here was pale-on-pale on three
            // shipped themes — `petal` (1.6:1), `workshop` (2.0:1), `salon` (1.5:1) —
            // because those themes deliberately carry a BRIGHT primary that holds dark
            // ink ("a pale rose primary carrying DARK ink", says petal's own comment).
            // Primary is a FILL color on them, and the price is the one number on this
            // card a shopper has to be able to read. Weight and scale carry the emphasis;
            // the card's brand identity rides its Add-to-cart button, which is a
            // `btn-primary` fill and therefore legible by construction.
            bind(el('p', 'text-lg font-bold text-base-content', { text: '$0.00' }), 'price'),
            // The card's half of the sold-out signal (the buy box carries the other).
            // A grid that prices ten things identically and lets a shopper find out
            // which two are gone by clicking each one is not a shop front.
            //
            // Colorless on purpose — an outline chip, no fill. Sold out is not a
            // warning and not a failure, it is simply the absence of stock, and the
            // filled `bg-warning` chip in this same slot already means "low stock":
            // two filled chips a shade apart would read as two grades of the same
            // thing rather than as opposites.
            visibleWhen(
              el(
                'span',
                'inline-flex w-fit items-center rounded-field border border-base-300 px-3 py-1 text-sm font-semibold text-base-content',
                { text: 'Sold out' }
              ),
              'soldOut'
            ),
          ],
        }),
      ],
    }),
    'href',
    'url'
  );
}

/** A single product card — image, name, price. Bind it to one product (an entity
 *  pin) or let it inherit an ancestor product scope. This IS the reusable card the
 *  Products block repeats; select it in the editor and "Save as component" to fork a
 *  custom card, then swap it into the block. */
export function productCard(): Node {
  return productCardNode();
}

/** Which product source a Products block binds. `commerce.product` is the whole
 *  catalog (a shop-all grid); the rest are BOUNDED rails the storefront caps —
 *  featured (merchant-tagged), new (newest), related (same collection as the viewed
 *  product), or a specific category (`commerce.category.<collectionHandle>`). The
 *  editor's data-source picker repoints this per instance (docs/122). */
export type ProductsSource =
  | 'commerce.product'
  | 'commerce.featured'
  | 'commerce.new'
  | 'commerce.related'
  | `commerce.category.${string}`;

/** grid = a responsive multi-column grid (a shop/catalog page); rail = a horizontal
 *  snap-scrolling strip (a featured/cross-sell rail); carousel = that same strip with
 *  real Previous/Next controls and a per-view card width. grid and rail differ only in
 *  the repeat container's classes; carousel additionally carries silica's `carousel`
 *  behavior, so it is the one layout that is not purely a class swap. */
export type ProductsLayout = 'grid' | 'rail' | 'carousel';

export interface ProductsBlockOptions {
  source?: ProductsSource;
  layout?: ProductsLayout;
  heading?: string;
}

// Literal container trees per layout — the authoring contract (§5) requires every
// class to be a LITERAL string so the Tailwind `@source` harness safelists it; a
// computed/concatenated class string would ship un-generated utilities. So each
// layout is its own literal node rather than a templated class.
function gridContainer() {
  return el('div', 'grid grid-cols-2 gap-6 @2xl:grid-cols-3 @4xl:grid-cols-4', {
    children: [productCardNode()],
  });
}
function railContainer() {
  return el('div', 'flex snap-x gap-6 overflow-x-auto pb-4', {
    children: [productCardNode('w-64 shrink-0 snap-start')],
  });
}

/**
 * The carousel's TRACK — the repeat container, marked as silica's `track` part so the
 * `carousel` behavior knows what to scroll, with each card marked `slide`.
 *
 * HOW MANY ARE VISIBLE IS THIS, and nothing else. `limit` on the binding decides how
 * many records LOAD; the card's basis decides how many you can see at once, and the two
 * are deliberately different numbers — "4 at a time out of 12" is one repeat with
 * `limit: 12` and a quarter-width slide. silicaui's own schema note says the same thing,
 * which is reassuring given we asked for the field.
 *
 * SEVERAL AT ONCE, because a featured strip is a list of things to compare and a
 * strip showing one of them is not that. On a product page it is worse than not
 * that: a full-width card underneath the product being sold makes the cross-sell
 * the biggest thing on the page, and the thing the page exists for the smaller.
 *
 * ── Why this is a `scroll-strip` and not a `carousel` ────────────────────────
 *
 * It was a `carousel`, which shows exactly ONE slide per view: silicaui sizes the
 * strip's children itself at a specificity a call-site utility cannot beat, and the
 * block carried a `basis-full @2xl:basis-1/3 @4xl:basis-1/4` ladder that had never
 * applied. Measured live at a 2543px container: strip 1152px, slide 1152px. Removing
 * the ladder changed nothing; adding a bare `basis-1/4` changed nothing.
 *
 * That was read as "multi-per-view needs a silicaui change". It does not. It needs the
 * OTHER behavior, which silicaui already ships and which describes this exact case in
 * its own words: "not `carousel`, which translates a track of full-width slides one at
 * a time — here every item is meant to be visible at once and the scroll position is
 * continuous". A `carousel` is for one hero at a time; a rail of products is a
 * `scroll-strip`. Reaching for the one named like the thing rather than the one
 * described like the job is the whole mistake, and it cost a blocked issue.
 *
 * What comes with it, all from the component rather than from here: the Previous and
 * Next controls appear only once the cards stop fitting and disable at each end, the
 * scrollbar chrome stays hidden because the buttons replace it, and the static markup
 * ships the controls already `hidden` so a no-JS render degrades to a plain scroller
 * instead of two dead buttons.
 *
 * The cards are a real width (`w-64`), so four fit a capped page and a phone gets one
 * plus the sliver of the next — which is the affordance that says there is more.
 */
function carouselTrack(): ElementNode {
  // The REPEAT container: its children repeat inside it, so this is the row itself.
  //
  // `w-max` + `mx-auto` is what centres a strip that FITS without breaking one that
  // does not. `justify-center` on a scroll container strands the leading card behind
  // an unreachable edge once the row overflows; auto margins only ever distribute
  // POSITIVE free space, so they centre one product and resolve to zero for twelve.
  return el('div', 'flex w-max gap-6 mx-auto', {
    children: [productCardNode('w-64 shrink-0')],
  });
}

/** The repeat, wrapped in silica's scroll-strip track, plus whatever else
 *  `repeatOrMaybeEmpty` returned (the empty sentence, on a layout that has one).
 *
 *  Split here rather than at the two call sites because the repeat is ALWAYS the
 *  first element and the destructure would otherwise be a `Node | undefined` each
 *  place — a type hole standing in for a shape this module guarantees. */
function stripTrack(parts: Node[]): Node[] {
  const [row, ...rest] = parts;
  if (!row) return parts;
  return [
    // `.scroll-strip` wraps ONLY the track. It is the component's own layout class and
    // lays its children out in a ROW (controls flanking a track), so putting it on the
    // section's content wrapper put the heading BESIDE the products instead of above
    // them. The controls live up in the heading row here, deliberately (issue 187), so
    // this wrapper has one child and the behavior finds its parts by nesting anyway.
    el('div', 'scroll-strip', {
      children: [part(el('div', 'scroll-strip-track', { children: [row] }), 'track')],
    }),
    ...rest,
  ];
}

/**
 * One carousel control — a raw `<button>` wearing the plugin's real `btn` classes, with
 * an `Icon` atom inside it.
 *
 * NOT `atom('Button', …)`, and the reason is worth stating because it looks like a
 * RULE #1 violation and isn't. A `ComponentNode` has no `attrs`: it carries only the
 * props its component declares, and `Button` declares no `aria-label`. Built that way
 * these render as `<button class="btn btn-circle"></button>` — two empty circles with
 * nothing inside and nothing for a screen reader to announce. A test below pins that,
 * because it is invisible in review and obvious to anyone using the site.
 *
 * The button is still a silica button: `btn btn-circle btn-sm` are the plugin's own
 * emitted classes, so it wears the theme and responds to it. The icon carries
 * `aria-hidden` itself, so the label is the only thing announced.
 *
 * COLORLESS ON PURPOSE. It shipped as `btn-neutral btn-outline`, which is a grey nobody
 * approved on a control that carries no meaning to colour — moving a strip sideways is
 * not a destructive act, not a primary one, and not a module's. A bare `.btn` resolves
 * its ink from `base-content` and is theme-correct in both themes without naming a
 * colour at all, which is the right control for a genuinely untyped action.
 *
 * `type="button"` because a carousel can legitimately sit inside a form (a filtered
 * PLP), where the HTML default of `submit` would navigate away on the first Next click.
 */
function carouselControl(role: 'prev' | 'next', label: string, icon: 'arrow-left' | 'arrow-right') {
  return part(
    // `scroll-strip-control` is the component's own class: the behavior ships these
    // hidden, reveals them only once the cards stop fitting, and disables each at its
    // end. Without it they are two buttons that are always there and never dim.
    el('button', 'scroll-strip-control btn btn-circle btn-sm', {
      attrs: { type: 'button', 'aria-label': label },
      children: [atom('Icon', 'size-4', { name: icon })],
    }),
    role
  );
}

/** THE configurable product listing — one block, prop-driven. It repeats the reusable
 *  product card over the chosen `source`, laid out as a `grid` or a `rail`. The editor
 *  surfaces `source` through the data-source picker (every option is registered in
 *  `COMMERCE_SOURCES`) and `layout` through the normal layout controls; `productGrid`
 *  and `featuredProducts` below are just this block with preset literal options, kept
 *  so existing pages and the starter/blueprints resolve unchanged. */
/** What a shopper sees where the products would be. In the SITE's voice, not the
 *  console's: this is a customer reading a business's page, not an owner reading
 *  their catalog. Says only what is true — there is nothing here yet — and invents
 *  no price and no stock state (issue 092). */
const NOTHING_TO_SHOW = 'Nothing in the shop just yet. Check back soon.';

/**
 * The storefront's content width, as one name (issue 187).
 *
 * Every other section on a page caps itself — the footer, the shop header, the nav —
 * and the products block did not, so its heading started at the window edge while the
 * buy box above it started 450px in. On a page where one section is full-bleed and the
 * rest are not, the full-bleed one does not read as "wide", it reads as broken.
 *
 * `6xl` because it is what the chrome already uses and what most of this file already
 * uses. The buy box's `5xl` stays as it is: it caps a half-width product image at a
 * sane ~500px, which is its own reason and not this one.
 */
const CONTENT_WIDTH = 'mx-auto w-full max-w-6xl';

export function productsBlock(opts: ProductsBlockOptions = {}): Node {
  const { source = 'commerce.product', layout = 'grid', heading = 'Products' } = opts;

  // A CURATION says nothing when it has nothing to say (issue 187).
  //
  // "Featured" over "Nothing in the shop just yet. Check back soon." is a hole on a
  // live business's page, and on a product page it is also FALSE: a bounded rail
  // excludes the product being looked at, because it is a cross-sell, so a shop with
  // one product renders 1 − 1 = 0 and apologises for an empty shop on the page of the
  // product that is in it.
  //
  // The whole-catalog GRID keeps its sentence. A shopper who navigated to the shop
  // asked the question and is owed the answer; a rail is a garnish nobody asked for.
  // A CURATION says nothing when it has nothing to say. Its HEADING goes with it: the
  // heading is the thing that turns an empty strip into a visible hole, because
  // "Featured" over an apology is a promise the page then breaks. On a product page the
  // apology is also FALSE — a bounded rail excludes the product being looked at, since
  // it is a cross-sell, so a one-product shop renders 1 − 1 = 0 and tells every visitor
  // its shop is empty on the page of the product that is in it.
  //
  // The whole-catalog GRID keeps both. A shopper who navigated to the shop asked the
  // question and is owed the answer; a rail is a garnish nobody asked for.
  const curated = layout !== 'grid';
  const emptyText = curated ? null : NOTHING_TO_SHOW;

  // A carousel is a different SHAPE, not a different container class: the heading shares
  // a row with the controls, and the whole section carries the behavior. Handled first so
  // the grid/rail path below stays the simple thing it was.
  if (layout === 'carousel') {
    return behave(
      el('section', 'bg-base-100 @container px-6 py-12', {
        children: [
          el('div', CONTENT_WIDTH, {
            children: [
              // Controls sit BESIDE the heading rather than floating over the cards.
              // Overlaying them would need absolute positioning and a scrim to stay
              // legible against whatever product photo happens to be underneath — a
              // shadow by another name, and a control whose contrast depends on the
              // tenant's imagery is one that will be unreadable on someone's site. In
              // the header row it is legible by construction.
              headingRow(
                el('div', 'mb-8 flex items-center justify-between gap-6', {
                  children: [
                    el('h2', 'text-2xl font-semibold text-base-content', { text: heading }),
                    el('div', 'flex gap-2', {
                      children: [
                        carouselControl('prev', 'Previous products', 'arrow-left'),
                        carouselControl('next', 'Next products', 'arrow-right'),
                      ],
                    }),
                  ],
                }),
                curated ? source : null
              ),
              ...stripTrack(repeatOrMaybeEmpty(carouselTrack(), source, emptyText)),
            ],
          }),
        ],
      }),
      { type: 'scroll-strip' }
    );
  }

  const children: Node[] = [
    headingRow(
      el('h2', 'mb-8 text-2xl font-semibold text-base-content', { text: heading }),
      curated ? source : null
    ),
    ...repeatOrMaybeEmpty(layout === 'rail' ? railContainer() : gridContainer(), source, emptyText),
  ];
  // A GRID over the whole catalog gets page links under it, because that grid is the
  // one that runs out of room: it shows 24 records and the catalog has more. A RAIL is
  // a curation — "Featured", "New in" — and a Next button under a curated strip is a
  // curation that forgot it was one, so it gets nothing.
  //
  // Safe to include unconditionally on a grid: the core renders NOTHING unless the
  // route actually paginated something and there is more than one page. An author who
  // repoints this block at `commerce.featured` is left with an invisible node, not a
  // broken pager. And it has to be added HERE rather than retrofitted, because a
  // stamped tree freezes at publish (docs/122) — a block inserted today is the only
  // one this can ever reach.
  if (layout === 'grid' && source === 'commerce.product') {
    children.push(hostCore(HOST_KEYS.sitePagination, 'pt-4'));
  }
  return el('section', 'bg-base-100 @container px-6 py-12', {
    children: [el('div', CONTENT_WIDTH, { children })],
  });
}

/** The empty sentence, or no sentence at all. `repeatOrEmpty` always writes one; a
 *  curation passes null and gets just the repeat, because its whole section is about to
 *  be dropped by `hideWhenCurationEmpty` anyway. */
function repeatOrMaybeEmpty(container: ElementNode, ref: string, emptyText: string | null): Node[] {
  if (emptyText !== null) return repeatOrEmpty(container, ref, emptyText);
  const only = repeat(container, ref);
  only.data = { kind: 'collection', ref, omitWhenEmpty: true };
  return [only];
}

/**
 * A curation's heading, which leaves when its products do. `ref` is null for the
 * whole-catalog grid, whose heading always stands.
 *
 * A SIBLING of the repeat, never an ancestor of it — which is not a style preference,
 * it is the engine's contract. `visible` reads `resolveBinding` and a repeat reads
 * `resolveCollection` (see `conditional.ts`), so a host that implements only the latter
 * cannot answer a `visible` carrying a collection ref. On an unanswerable ref the engine
 * keeps the node AS AUTHORED and stops there — which, on an ancestor, means the repeat
 * beneath it never resolves and the whole strip renders its placeholder card: "Product
 * name · $0.00". Wrapping the section in `visible` was the first attempt here and it did
 * exactly that; `record-templates-render` caught it.
 *
 * As a sibling it is the same shape the empty sentence has always used, one polarity
 * apart, and the repeat beside it keeps resolving through its own mechanism whatever
 * this one answers. A host that cannot answer the ref drops the heading — so a host
 * that renders these blocks must publish its sources on the data root, which is what
 * `createSilicaResolver` does for both the storefront and the studio canvas.
 */
function headingRow(row: ElementNode, ref: string | null): Node {
  return ref === null ? row : visibleWhen(row, ref);
}

/** A HEADLESS product carousel — the same `track` + Previous/Next the carousel
 *  `productsBlock` uses, but WITHOUT the `<section>` chrome or the heading row. `productsBlock`
 *  is the section-level block a page drops in directly; this is the bare interactive strip, for
 *  a container that already frames it — a tab panel whose pill row is the heading, a column
 *  that supplies its own padding. Same `carousel` behavior + `carousel`/`carousel-item` classes,
 *  so it hydrates and scrolls identically; only the surrounding section + `<h2>` are dropped.
 *
 *  Its controls go with its products (issue 187): two dead arrows over an apology is
 *  worse than nothing, and the container that already frames this is the thing that
 *  should decide what an empty strip looks like. */
export function productCarousel(source: ProductsSource = 'commerce.product'): Node {
  return behave(
    el('div', 'flex flex-col gap-6', {
      children: [
        headingRow(
          el('div', 'flex items-center justify-end gap-2', {
            children: [
              carouselControl('prev', 'Previous products', 'arrow-left'),
              carouselControl('next', 'Next products', 'arrow-right'),
            ],
          }),
          source
        ),
        ...stripTrack(repeatOrMaybeEmpty(carouselTrack(), source, null)),
      ],
    }),
    { type: 'scroll-strip' }
  );
}

/** A responsive grid over the whole catalog — the shop-all page. A preset of
 *  `productsBlock`. */
export function productGrid(): Node {
  return productsBlock({
    source: 'commerce.product',
    layout: 'grid',
    heading: 'Shop our products',
  });
}

/** A horizontal, snap-scrolling rail of FEATURED products — a preset of
 *  `productsBlock` bound to the BOUNDED `commerce.featured` source (merchant-tagged,
 *  capped to a handful, newest-few fallback, current product excluded on a PDP). A
 *  curated few, never the entire catalog.
 *
 *  **Not the default any more, and not what a page should reach for first** (issue 187).
 *  A rail is a fixed `w-64` strip with a raw scrollbar under it: it shows the same card
 *  size at every width, runs off the side of a phone, and offers a shopper no control
 *  except dragging. `featuredCarousel` below does the same job with real Previous/Next
 *  buttons and a card that reflows. This preset stays because a rail is a legitimate
 *  thing to CHOOSE in the editor; nothing ships it by default. */
export function featuredProducts(): Node {
  return productsBlock({ source: 'commerce.featured', layout: 'rail', heading: 'Featured' });
}

/** A CAROUSEL of featured products — the same bounded source as `featuredProducts`, shown
 *  a few at a time with Previous/Next controls instead of a bare scroll strip. The
 *  separate preset exists because a rail and a carousel are different promises to a
 *  shopper: a rail says "swipe if you like", a carousel says "there is more, here is how
 *  to reach it". An author who wants a different count sets `limit` on the repeat in the
 *  editor — the block deliberately hard-codes neither.
 *
 *  **This is what every default page ships** — the starter's home page and the product
 *  page's cross-sell both. It was built and then left uncalled, which is how a scroll
 *  strip ended up being the thing every tenant's site was born with. */
export function featuredCarousel(): Node {
  return productsBlock({ source: 'commerce.featured', layout: 'carousel', heading: 'Featured' });
}

/** A CAROUSEL of RELATED products — the cross-sell a PRODUCT page ships.
 *
 *  Same shape as `featuredCarousel`, different source, and the difference is the point.
 *  "Featured" means the ones the merchant TAGGED `featured`, and nothing else (see
 *  `commerce.featured`'s note in the storefront resolver — the fallback to the whole
 *  catalog was removed because it put the catalog on the page twice under a heading
 *  claiming a curation nobody had made). That is a fine thing to put on a HOME page,
 *  where a merchant is choosing what to lead with.
 *
 *  On a PRODUCT page it is the wrong idea twice over. A shopper reading one garment
 *  wants others LIKE IT, not the shop's window display; and a brand-new shop has tagged
 *  nothing, so the rail correctly hides itself and the product page ships with no
 *  cross-sell at all — silently, with nothing on the page or in the studio to say a rail
 *  was ever there. A clothing label with eight products and a customer at the bottom of
 *  one of them was offered nothing else, for exactly this reason.
 *
 *  `commerce.related` is bounded, excludes the product being viewed, and is never empty
 *  for a shop with more than one thing in it. The author can still repoint it at
 *  Featured, a category, or the whole catalog from the block's own source picker. */
export function relatedCarousel(): Node {
  return productsBlock({
    source: 'commerce.related',
    layout: 'carousel',
    heading: 'You might also like',
  });
}

/** The Add-to-cart FORM — the buy box's interactive half.
 *
 *  It is a real `<form>` because silica's `form` behavior is the ONLY thing that
 *  calls the host's `onAction`: on a valid submit it gathers the form's controls
 *  via FormData and dispatches `{kind:'submit', values}`. So the cart line's
 *  identity has to ride in actual form fields, not in the node tree.
 *
 *  Two markers, two jobs, both on the `<form>` itself:
 *    · `behave(…, {type:'form'})` → `data-sui-behavior="form"`, which is what
 *      `hydrate()` looks for when deciding to wire the submit handler.
 *    · `action(…, 'add-to-cart')` → `data-sui-action`, the opaque `ref` handed to
 *      `onAction` so the host knows WHICH action fired.
 *  They live in different node fields (`behavior` vs `data`), so one node carries both.
 *
 *  `variantId` is a bound hidden input: silica's `fillValue` writes a bound value
 *  into an `<input>`'s `value` attribute (silicaui ≥ 0.12 — before that it wrote
 *  children, which a void element drops, so the id vanished silently). It resolves
 *  to '' for a product with no live variant. No `required` guard here, because the
 *  attribute is inert on a hidden input and `checkValidity()` would pass anyway —
 *  the storefront's `onAction` is what refuses to add an empty variant. */
/**
 * WHICH ONE a shopper is buying — the sizes, colors and other versions a product is
 * sold in.
 *
 * The buy box had none. It posted a hidden `variantId` fixed to the default version,
 * so every shopper on a five-size garment bought the same size whatever they wanted,
 * and nothing on the page said so (issue 190). The platform had a full swatch picker
 * built — `apps/site/components/product-detail.tsx`, availability per option value and
 * an image that follows the color — but the live page takes the silica record-template
 * branch and never reaches it.
 *
 * RADIOS, not a `<select>`, and no JavaScript in either case. `<option>` would have to
 * carry its id in `value` AND its words as text, and a node carries ONE binding — so
 * the label would have to be a `<span>` inside an `<option>`, which browsers flatten.
 * A radio splits cleanly: the input binds its `value`, the span beside it binds the
 * words. It is also the better control for five sizes, which want to be seen at once.
 *
 * `required` on every radio is what makes the browser refuse a submit with nothing
 * picked, rather than defaulting silently to whichever version happened to be first.
 * Empty for a single-version product, where the hidden field takes over.
 */
export function versionPicker(): Node {
  return visibleWhen(
    el('fieldset', 'flex flex-col gap-2', {
      children: [
        el('legend', 'text-base font-medium text-base-content', { text: 'Choose yours' }),
        // The container renders ONCE and its children repeat, so both branches below
        // are authored per version and the engine drops whichever one does not apply.
        repeat(
          el('div', 'flex flex-wrap gap-x-4 gap-y-2', {
            children: [versionChoice(false), versionChoice(true)],
          }),
          'versions'
        ),
      ],
    }),
    'versions'
  );
}

/**
 * One version's radio — the buyable branch, or the sold-out one.
 *
 * A size that is gone must be UNPICKABLE, not merely annotated. It was neither: every
 * version rendered the same enabled radio, so a shopper could select "XS · Bone, sold
 * out", press Add to cart, and learn from a red line under the button that they could
 * not have it (issue 214). The words were in the label the whole time — the control
 * simply did not act on them.
 *
 * `disabled` is what makes it impossible rather than discouraged, and it is also what
 * makes the storefront's "Sorry, this item just sold out." true again: with the option
 * unpickable, that sentence can only reach a shopper in the race it describes.
 *
 * The sold-out radio binds NOTHING. A node carries one binding and the enabled radio
 * spends its on `value`; a disabled control never posts, so it has nothing to carry.
 * That is what leaves the branch free to be gated on `soldOut` instead.
 *
 * The buyable branch is NEGATED rather than gated on a `sellable` twin, which means the
 * host must publish `soldOut` on EVERY version, false included. An absent ref is
 * UNKNOWN to the engine, not false — it keeps the node and stops resolving the bindings
 * underneath it, so leaving the flag off the in-stock versions drew fourteen radios
 * with no words beside them. The screen caught that; the types could not.
 */
function versionChoice(soldOut: boolean): ElementNode {
  const input = el('input', 'radio', {
    attrs: soldOut
      ? { type: 'radio', name: 'variantId', disabled: true }
      : { type: 'radio', name: 'variantId', required: 'required' },
  });
  return visibleWhen(
    el(
      'label',
      soldOut
        ? 'flex cursor-not-allowed items-center gap-2 text-base text-base-content line-through'
        : 'flex items-center gap-2 text-base text-base-content',
      {
        children: [
          soldOut ? input : bindAttr(input, 'value', 'id'),
          bind(el('span', '', { text: '' }), 'label'),
        ],
      }
    ),
    'soldOut',
    !soldOut
  );
}

export function addToCartForm(): Node {
  return action(
    behave(
      el('form', 'mt-2 flex flex-col gap-3', {
        // `data-success-message` is deliberately EMPTY. The behavior announces one of
        // the two messages into the status part on every settle, and on success the
        // cart drawer opens — a line of text under the button saying the same thing is
        // noise. An empty string is not the same as an absent attribute here: absent
        // falls back to the built-in "Submitted.", which is not a sentence about a
        // basket. The ERROR default is left alone so the storefront's `onAction` can
        // overwrite it with the real reason ("Sorry, this item just sold out.").
        attrs: { 'data-success-message': '' },
        children: [
          versionPicker(),
          // The hidden field and the picker are the SAME form field, so exactly one of
          // them may exist: two controls named `variantId` both post. The picker shows
          // when there are versions to choose between; this shows when there are not.
          // The wrapper carries the condition because the input's own binding slot is
          // already spoken for by its value.
          visibleWhen(
            el('div', '', {
              children: [
                bind(
                  el('input', '', { attrs: { type: 'hidden', name: 'variantId' } }),
                  'variantId'
                ),
              ],
            }),
            'versions',
            true
          ),
          // The quantity control nests INSIDE its label, so the pair needs no `id`
          // — a page with two buy boxes would otherwise emit a duplicate id.
          el('label', 'flex items-center gap-3 text-base text-base-content', {
            children: [
              el('span', 'font-medium', { text: 'Quantity' }),
              el('input', 'input w-24', {
                attrs: { type: 'number', name: 'quantity', value: '1', min: '1', step: '1' },
              }),
            ],
          }),
          atom('Button', 'btn btn-primary btn-lg', { type: 'submit' }, ['Add to cart']),
          buyStatus(),
        ],
      }),
      { type: 'form' }
    ),
    'add-to-cart'
  );
}

/** The line under the Add-to-cart button that says what went wrong.
 *
 *  silica's `form` behavior settles every submit into its `status` part — and when a
 *  form authors none, it BUILDS one: a 1x1px `clip-path: inset(50%)` div. That is a
 *  live region, so the message is announced to a screen reader and rendered to
 *  literally nobody else. A shopper clicking Add-to-cart on a sold-out item watched
 *  the button depress and nothing else happen, with the real answer sitting in the
 *  DOM one pixel wide.
 *
 *  `empty:hidden` keeps it out of the form's `gap-3` at rest: the behavior writes
 *  `textContent`, so an idle (or successful) settle leaves the element `:empty`.
 *
 *  Authored through `attrs` rather than `part()` because silicaui's `BehaviorRole`
 *  union does not list `status` — the runtime reads the attribute by name
 *  (`ownParts(root, 'status')`), the type just predates it. */
function buyStatus(): Node {
  return el('p', 'text-base text-error empty:hidden', {
    attrs: { 'data-sui-part': 'status', 'aria-live': 'polite' },
  });
}

/** What the buy box says INSTEAD of a form when the product is not for sale.
 *
 *  Shown on the `soldOut` bind, which the form hides on — so the two are mutually
 *  exclusive by construction rather than by two conditions that can disagree. The
 *  words stay industry-agnostic and make no promise the business has not made: a
 *  bakery, a bookshop and a machine shop all sell out, and none of them can be told
 *  by this file when the thing comes back. */
export function soldOutNotice(): Node {
  return visibleWhen(
    el('div', 'mt-2 flex flex-col gap-2 rounded-box border border-base-300 bg-base-200 p-5', {
      children: [
        el('p', 'text-lg font-semibold text-base-content', { text: 'Sold out' }),
        el('p', 'text-base text-base-content', {
          text: 'This one has gone for now. We will put it back as soon as we have more.',
        }),
      ],
    }),
    'soldOut'
  );
}

/** The product-detail buy box — gallery, title, price (+ compare-at strikethrough),
 *  description, and an Add-to-cart form. Self-scoping: its root repeats over the
 *  `product` object source (a collection-of-one), so dropping it on any page and
 *  pinning the product scopes every descendant to `item.*`. */
/**
 * The routed product's typed attribute sections (docs/143) — the auto-render FLOOR that
 * makes the DEFAULT product page show a product's real detail blocks (fabric/care/specs/…)
 * without any bespoke authoring. Repeats the in-scope product's `attributeSections`
 * (ordered by its type's field order): a scalar attribute renders its `value`; a repeater
 * attribute (materials, specs, nutrition) sub-repeats its `items` as label/value rows. The
 * whole block is `visibleWhen('attributeSections')`, so an untyped product renders NOTHING —
 * a clean empty state, never an empty heading. No field keys are named: every product shows
 * whatever ITS type defines.
 */
export function productAttributes(): Node {
  // A repeat renders its container's CHILDREN once per item, INSIDE that container —
  // it does not clone the container. So the per-section box has to be the repeat's
  // child, not the repeat itself. It was the repeat itself, which put every section's
  // heading and value into ONE box: five sections came out as fourteen loose siblings
  // with no rule between them, and the nested `items` repeat did the same to the
  // materials rows (issue 193).
  const section = el('div', 'flex flex-col gap-2 border-t border-base-300 pt-4', {
    children: [
      bind(
        el('h2', 'text-sm font-semibold uppercase tracking-wide text-base-content', {
          text: 'Section',
        }),
        'label'
      ),
      // Scalar value — dropped for a repeater section (its `value` is '').
      //
      // The condition and the value are two nodes ON PURPOSE. A node carries ONE
      // `data` marker, so `visibleWhen(bind(div))` silently threw the bind away and
      // the div rendered EMPTY on every scalar attribute (issue 193).
      visibleWhen(
        el('div', '', {
          children: [
            bind(el('p', 'text-base leading-relaxed text-base-content', { text: '' }), 'value'),
          ],
        }),
        'value'
      ),
      // Repeater rows (materials, specs, nutrition). `omitWhenEmpty`, because a
      // repeat over an EMPTY list renders its template once — which on a scalar
      // section printed the section's own label a second time with its value beside
      // it, and that is what made every detail read twice.
      ...repeatOrMaybeEmpty(
        el('div', 'flex flex-col gap-1', {
          children: [
            el('div', 'flex items-baseline justify-between gap-4 border-b border-base-200 pb-1', {
              children: [
                bind(el('span', 'text-base font-medium text-base-content', { text: '' }), 'label'),
                bind(el('span', 'text-base text-base-content', { text: '' }), 'value'),
              ],
            }),
          ],
        }),
        'items',
        null
      ),
    ],
  });

  return visibleWhen(
    el('div', 'mt-2', {
      children: [
        repeat(el('div', 'flex flex-col gap-5', { children: [section] }), 'attributeSections'),
      ],
    }),
    'attributeSections'
  );
}

/** The shipping/returns trust line — LINKS the site's real legal pages instead of reprinting
 *  a policy the default template can't know (docs/143). `/shipping-policy` + `/returns-policy`
 *  are the canonical legal slugs. */
export function productPolicyLinks(): Node {
  const link = (href: string, text: string): Node =>
    bindAttrHref(el('a', 'underline underline-offset-4', { text }), href);
  return el(
    'div',
    'flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-base-300 pt-4 text-sm text-base-content',
    {
      children: [
        link('/shipping-policy', 'Shipping & delivery'),
        link('/returns-policy', 'Returns & refunds'),
      ],
    }
  );
}

// A static href on an anchor — the same shape `bindAttr` writes, but for a literal URL
// (no binding). Kept local so the policy links stay a two-liner.
function bindAttrHref(anchor: ElementNode, href: string): Node {
  anchor.attrs = { ...(anchor.attrs ?? {}), href };
  return anchor;
}

/** A real low-stock badge — bound to the routed product's inventory, shown ONLY when stock is
 *  genuinely at/below its reorder point (`visibleWhen('lowStock')`). Honest scarcity, never
 *  fabricated; renders nothing when stock is healthy. */
export function productStockBadge(): Node {
  return visibleWhen(
    el(
      'span',
      'inline-flex w-fit items-center gap-2 rounded-field bg-warning px-3 py-1 text-sm font-semibold text-warning-content',
      {
        text: 'Low stock',
      }
    ),
    'lowStock'
  );
}

/**
 * What a shopper has to know before they commit to a thing that has to be MADE
 * (issue 184): how long the wait is, what happens to their money, and whether
 * today's batch has any left.
 *
 * It binds three SENTENCES rather than three values, because the tree has no
 * arithmetic and no calendar — "5" and "3000" cannot become "we need 5 days to
 * make it" and "Pay $30.00 today" inside a bind. The storefront composes them
 * (`lib/made-to-order-copy`) and this places them.
 *
 * The whole panel hangs on `madeToOrder.shown`, which is ABSENT rather than
 * false on an ordinary product, so a product with none of the three rules
 * renders nothing at all — which is every product that existed before this. Each
 * line carries its own condition too: a deposit with no notice period, or a
 * notice period with no deposit, are both ordinary.
 *
 * It sits ABOVE the add-to-cart form, not below it. The wait and the deposit
 * change what somebody is agreeing to, so they have to be read before the button
 * and not after it.
 */
export function madeToOrderNote(): Node {
  const line = (ref: string, cls: string): Node =>
    visibleWhen(
      el('span', cls, { children: [bind(el('span', '', { text: '' }), `madeToOrder.${ref}`)] }),
      `madeToOrder.${ref}`
    );
  return visibleWhen(
    el(
      'div',
      'flex flex-col gap-1 rounded-box border border-base-300 bg-base-200 p-3 text-sm text-base-content',
      {
        children: [
          line('ready', 'font-semibold'),
          line('deposit', ''),
          line('scarce', 'font-semibold'),
        ],
      }
    ),
    'madeToOrder.shown'
  );
}

export function buyBox(): Node {
  return repeat(
    // A self-contained SECTION so the buy box stands alone — dropped as a bare block,
    // or shown standalone in the marketplace preview — instead of relying on a page to
    // wrap it. `px-6 py-12` are its own margins (without them the image and Add-to-cart
    // button butt against the edge); `mx-auto max-w-5xl` caps it so the half-width image
    // is a sane ~500px, not full-bleed.
    //
    // CONTAINER-QUERY TRAP: `@container` marks an element as a query container for its
    // DESCENDANTS, but a `@2xl:` class on that SAME element resolves against the nearest
    // ANCESTOR container. So the container is the SECTION and `@2xl:grid-cols-2` lives on
    // the grid INSIDE it — the grid measures the section it was given, never the window.
    el('section', 'bg-base-100 @container px-6 py-12', {
      children: [
        el('div', 'mx-auto grid w-full max-w-5xl gap-8 @2xl:grid-cols-2', {
          children: [
            // `eager`, and this is the one image on the page that must be.
            //
            // silica's `Image` ships `loading="lazy"`, which is right for the card
            // grids this file also builds and wrong here: this is the largest thing
            // above the fold on a shop's highest-traffic page, so it IS the Largest
            // Contentful Paint. Lazy defers the request until layout has run, which
            // puts the one image the score is measured on last in the queue.
            //
            // `fetchpriority` would be the natural companion and is deliberately not
            // set: `toHtml`'s attribute allowlist for `img` does not carry it, so it
            // would be dropped silently — the failure this catalog's literal-class
            // rule exists to avoid, wearing a different hat.
            //
            // A raw `img` rather than the `Image` atom, and that is the whole reason:
            // silicaui's `Image` builds `loading="lazy"` itself and IGNORES a
            // `loading` prop without a word, so there is no way to author an eager
            // image through it (probed against silicaui 0.55.0 — `loading`, `eager`
            // and `priority` all come out `lazy`). The element path honours the attr,
            // `responsive-images` rewrites elements and atoms alike, and `_shell`'s
            // `picture()` is already a raw img — so nothing is lost. Revert to the
            // atom if silicaui ever forwards the prop.
            bind(
              el('img', 'aspect-square w-full rounded-box object-cover', {
                attrs: { src: PLACEHOLDER_IMAGE, alt: 'Product image', loading: 'eager' },
              }),
              'image'
            ),
            // `justify-center` vertically centers the details beside the tall product
            // image, so a short product (title + price + one line) sits balanced rather
            // than packed at the top with a void beneath the Add-to-cart button.
            el('div', 'flex flex-col justify-center gap-4', {
              children: [
                bind(
                  el('h1', 'text-3xl font-bold text-base-content', { text: 'Product name' }),
                  'title'
                ),
                el('div', 'flex items-baseline gap-3', {
                  children: [
                    // Ink, not the brand role — same reason as the card price above, and
                    // the same three themes failed here too. This is the price a shopper
                    // commits money against.
                    bind(
                      el('span', 'text-2xl font-bold text-base-content', { text: '$0.00' }),
                      'price'
                    ),
                    // The was-price strikethrough, shown ONLY on an actual sale. It used
                    // to be a bare value bind, which meant a product with no
                    // `compareAtPrice` still rendered `<span class="line-through">` —
                    // empty, but a real flex item, so every non-sale product page carried
                    // a stray `gap-3` after the price. The wrapper is what carries the
                    // condition (one `data` per node), so the inner span still fills.
                    visibleWhen(
                      el('span', 'text-lg text-base-content line-through', {
                        children: [bind(el('span', '', { text: '' }), 'compareAtPrice')],
                      }),
                      'compareAtPrice'
                    ),
                  ],
                }),
                // Honest low-stock signal (docs/143) — self-hides when stock is healthy.
                productStockBadge(),
                // PARAGRAPHS, not one bind. A bind writes a single text node, and
                // `white-space: normal` collapses the blank lines an owner typed — six
                // paragraphs about a garment arrived as one twenty-five-line block
                // (issue 191). The record splits the same words at blank lines.
                //
                // `omitWhenEmpty`, so a product that HAS no description renders
                // nothing rather than the template's placeholder paragraph (issue
                // 092). The scaffolding text survives only where the ref is unknown,
                // which is an authoring canvas — a storefront record always carries
                // the field, empty array and all.
                ...repeatOrMaybeEmpty(
                  el('div', 'flex flex-col gap-3 text-base-content', {
                    children: [bind(el('p', '', { text: 'Product description.' }), 'text')],
                  }),
                  'descriptionParagraphs',
                  null
                ),
                // Before the button, because it changes what is being agreed to
                // (issue 184). Self-hides on every product that is not made to
                // order, which is most of them.
                madeToOrderNote(),
                // The form and the notice hang off the SAME `soldOut` bind, one negated,
                // so a product that cannot be bought never renders a control that says
                // it can. Wrapped in a plain div because a node carries one `data`
                // binding and the form's is already spoken for by its action.
                //
                // The bind is `soldOut` and NOT `inStock` because of what ABSENT has to
                // mean. A record that carries neither field — an older stored shape, a
                // theme preview, a fixture — must still be buyable: not knowing a
                // product's stock is not the same as knowing it has none, and inverting
                // that would hide the buy button on every product nobody has counted.
                // Same rule the availability service holds (`computeAvailability`: no
                // level rows → untracked → in stock), expressed in the tree.
                visibleWhen(
                  el('div', 'flex flex-col', { children: [addToCartForm()] }),
                  'soldOut',
                  true
                ),
                soldOutNotice(),
                // The product's OWN typed attributes (docs/143) — the auto-render floor, so a
                // typed product shows real fabric/care/specs on the DEFAULT page with no
                // bespoke authoring; an untyped product shows nothing.
                productAttributes(),
                // Shipping & returns — LINKS the site's real legal pages, never reprinted copy.
                productPolicyLinks(),
              ],
            }),
          ],
        }),
      ],
    }),
    'product'
  );
}

/** The full product-detail PAGE body — the buy box above a "related" rail. This is
 *  the composed tree a `commerce.product` collection template renders: the storefront
 *  injects the routed product as the `product` object scope (a collection-of-one), so
 *  the buy box resolves `item.*` for THIS product while the rail below repeats the
 *  catalog's `commerce.product` source. Dropping it as a page needs no pinning — the
 *  page's record scope drives it. `featuredProducts` (a `commerce.product` repeat) is
 *  the cross-sell strip. */
export function productDetailPage(): Node {
  return el('div', 'flex flex-col', {
    children: [
      // `buyBox()` is a self-contained section now (its own padding + `max-w-5xl`), so the
      // page simply stacks it above the cross-sell strip — no extra wrapper.
      buyBox(),
      // A carousel rather than the scroll rail (issue 187), and it removes itself when
      // there is nothing to cross-sell — which on a one-product shop is ALWAYS, because
      // the strip excludes the product being looked at.
      //
      // Bound to RELATED, not featured (issue 412). "Featured" is the merchant's window
      // display and belongs on a home page; a shopper at the bottom of one garment wants
      // others like it. It also made the rail empty for every shop that had not
      // discovered the `featured` tag, which is every new shop.
      relatedCarousel(),
    ],
  });
}

/** The full collection-detail PAGE body (docs/122 + docs/127 §8) — the `commerce.collection`
 *  record template's default: an editable shell wrapping the PINNED `commerce.collection-detail`
 *  core. Like the category detail, the whole experience (header + a FACETED, sortable,
 *  paginated grid of the collection's members) is server-computed from the handle + search
 *  params, so it is one self-contained functional core the tenant surrounds/restyles but
 *  can't delete. This REPLACED a bind-based flat grid that could only ever show one
 *  truncated page with no filters — the core reuses the PLP's `ScopedProductBrowser`
 *  scoped to the collection, so a large collection is genuinely shoppable. No shell
 *  heading — the core renders its own header. The route mounts `<CollectionDetail>` at the
 *  host node with the collection handle. */
export function collectionDetailPage(): Node {
  return functionalShell(HOST_KEYS.commerceCollectionDetail);
}

/** The full category-detail PAGE body (docs/122) — the `commerce.category` record
 *  template's default: an editable shell wrapping the PINNED `commerce.category-detail`
 *  core. Unlike `collectionDetailPage` (a bind-based flat grid), a category is a browse
 *  TREE node whose header + subcategories + paginated product ROLLUP (self + descendants)
 *  is server-computed, so the whole experience is one self-contained functional core the
 *  tenant surrounds/restyles but can't delete. No shell heading — the core renders its own
 *  header. The route mounts `<CategoryDetail>` at the host node with the category handle. */
export function categoryDetailPage(): Node {
  return functionalShell(HOST_KEYS.commerceCategoryDetail);
}

/** A centered header band for a collection / category landing page. Binds its
 *  title + description scope-relatively against the collection record the page
 *  provides (no self-scope — the collection page owns the object scope). */
/** The SHOP page's header — a static heading, deliberately carrying no binds.
 *
 *  The starter's Shop page used `collectionHeader()`, which is a COLLECTION DETAIL
 *  header: its `title`/`description` binds resolve against the collection in scope. On
 *  `/shop` there is no collection in scope — it is a plain page, not a record template
 *  — so both binds silently kept their placeholders and every tenant's shop page, a
 *  primary nav destination, read:
 *
 *      Collection
 *      Collection description.
 *
 *  Nothing errored; it just shipped. A page that is not a record template must not
 *  carry record binds, which is why this one is plain text the tenant edits in the
 *  studio rather than a bind that can fail to nothing. */
export function shopHeader(): Node {
  return el('section', 'bg-base-100 @container px-6 pt-12 pb-4', {
    children: [
      el('div', 'mx-auto w-full max-w-6xl', {
        children: [
          el('h1', 'text-4xl font-bold tracking-tight text-base-content @2xl:text-5xl', {
            text: 'Shop',
          }),
          el('p', 'mt-4 max-w-2xl text-lg leading-relaxed text-base-content', {
            text: 'Everything we currently have available.',
          }),
        ],
      }),
    ],
  });
}

export function collectionHeader(): Node {
  return el('section', 'bg-base-100 @container px-6 py-12 text-center', {
    children: [
      bind(el('h1', 'text-4xl font-bold text-base-content', { text: 'Collection' }), 'title'),
      bind(
        el('p', 'mx-auto mt-3 max-w-2xl text-lg text-base-content', {
          text: 'Collection description.',
        }),
        'description'
      ),
    ],
  });
}
