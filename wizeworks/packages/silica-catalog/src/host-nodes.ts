// The host cores (docs/122 Phase 2/3) — sparx's registry of live, host-owned regions
// the platform renders at request time rather than stamping into a tenant's tree.
//
// silicaui 0.22 shipped the `HostNode` primitive (`kind: "host"`): `toHtml` lowers it
// to an EMPTY mount point (`<div data-sui-host="<key>">`) and the real component is
// mounted at render time — on the live site by the React walk (wizeworks/apps/site), on the
// studio canvas by the host's `renderHostNode` (apps/dashboard).
//
// A host node buys TWO independent things. Don't conflate them:
//
//   1. `kind:"host"` ⇒ IMPROVABILITY. The tree stores a mount point, not markup, so
//      the platform can keep improving what renders there — forever, for every
//      tenant, with no migration. A STAMPED node is the opposite: it is copied at
//      insert and frozen at publish, so improving the composite that produced it
//      never reaches a tenant who already published (docs/122 "Key facts").
//   2. `locked:"host"` ⇒ PROTECTION. The engine refuses to remove or move the node
//      and the author UI offers no unlock, so a transaction can't be deleted.
//
// Most cores want both. The brand mark (`site.brand`) wants only the first: it is
// live-rendered so a logo uploaded in Site settings appears without a builder trip,
// but the tenant owns where it sits, so it is `pinned: false`.
//
// The sorting rule, for the next thing that goes stale: if the PLATFORM must be able
// to improve it forever, it is a host core. If the TENANT owns it, leave it stamped —
// freezing is the correct semantics for tenant content.
//
// This module is the ONE source of truth for the key vocabulary + the palette/inspector
// METADATA (plain data — React-free, like the rest of this package) + the authoring
// composites that wrap a core in a default editable shell. The two React ends map the
// SAME keys to their own components:
//   · apps/dashboard  key → a non-interactive canvas skeleton (`renderHostNode`)
//   · wizeworks/apps/site       key → the real functional component (the live-site walk)
// A key with no live mapping on either end is a half-built surface, so an entry is
// added here only once its full vertical (skeleton + real component + route) lands.

import { el, host, type HostNode, type Node } from '@wizeworks/silicaui-html';

import { FRAME_RATIOS } from './embed';

/** The host-component keys, namespaced by owning module. Matched verbatim against a
 *  `HostNode.component`; every key in `HOST_COMPONENTS` has a live mapping on BOTH
 *  React ends. Add a key here the moment its vertical is complete, never before. */
export const HOST_KEYS = {
  /** The shopping cart — line items, quantity edits, totals, checkout CTA. A
   *  self-contained client component (cart state lives in the browser); no auth,
   *  no money movement (that is `commerce.checkout`). */
  commerceCart: 'commerce.cart',
  /** The search experience — query field, Typesense-faceted sidebar, sort, result
   *  grid + pagination, and a pages/collections strip. Read-only; reads the URL's
   *  search params (the route passes them in — a host core can't read the URL). */
  commerceSearch: 'commerce.search',
  /** The product listing (PLP) — the faceted, sortable, paginated catalog grid with a
   *  fitment/price/availability facet panel. Read-only; reads the URL's search params. */
  commercePlp: 'commerce.plp',
  /** The collection index — a card grid of every published collection (featured first).
   *  Read-only; needs only the resolved site (no URL state). */
  commerceCollections: 'commerce.collections',
  /** The category index — a card grid of the root browse categories (featured first),
   *  each drilling into /category/[handle]. Read-only; needs only the resolved site. */
  commerceCategories: 'commerce.categories',
  /** The bookable-services index — a card list of every service open for online booking,
   *  each drilling into /book/[serviceId]. Read-only; self-contained (resolves the tenant
   *  from the request host), so it needs nothing from route context. */
  schedulingServices: 'scheduling.services',
  /** The category DETAIL — one browse node's header + subcategories + a paginated ROLLUP
   *  of every product beneath it (self + descendants). A per-record functional template
   *  (`commerce.category` record type); the route passes the category handle + page via
   *  context. Read-only. */
  commerceCategoryDetail: 'commerce.category-detail',
  /** The collection DETAIL — one collection's header + its members as a faceted, sortable,
   *  paginated grid (the same browser the PLP + category detail use, scoped to this
   *  collection). A per-record functional template (`commerce.collection` record type);
   *  the route passes the collection handle + search params via context. Read-only. */
  commerceCollectionDetail: 'commerce.collection-detail',
  /** A product's REVIEWS — the rating summary, the approved reviews, and the
   *  write-a-review form. A per-record functional template (`commerce.product` record
   *  type); the route passes the product handle via context. Interactive: the form
   *  posts to the public reviews endpoint and what comes back is moderated
   *  server-side, which is why this is a core and not bound refs — a binding can draw
   *  the list, but it cannot carry the form. */
  commerceProductReviews: 'commerce.product-reviews',
  /** A product's QUESTIONS AND ANSWERS — the published questions, the shop's answers,
   *  and the ask-a-question form. A per-record functional template (`commerce.product`
   *  record type); the route passes the product handle via context. Interactive for the
   *  same reason reviews are: the form posts to the public questions endpoint and the
   *  question enters moderation, so a binding could draw the list but could never carry
   *  the form.
   *
   *  It exists because the console's Questions queue was the only end of this that was
   *  built. A shop owner opened it, read "no questions yet", and had no way to learn
   *  that no page on her website could take one — the queue was waiting on a doorbell
   *  nobody had fitted. */
  commerceProductQuestions: 'commerce.product-questions',
  /** The bookable-service DETAIL — one service's header + its LIVE time-picker (availability,
   *  slot selection, booking). A per-record functional template (`scheduling.service` record
   *  type); the route passes the service id via context. Interactive (client widget). */
  schedulingServiceDetail: 'scheduling.service-detail',
  /** The shopper account AUTH form — sign-in / create-account / forgot / reset. ONE core
   *  parameterized by a `mode` host prop (the route/composite sets it; not author-tunable),
   *  so every public /account entry page is one editable shell around this pinned form.
   *  Interactive (client widget); reads its own URL params (redirect / token). */
  commerceAuth: 'commerce.auth',
  /** The site BRAND MARK — the tenant's logo and/or site name, linked home. The one
   *  core that is NOT pinned (`pinned: false`): the tenant may move, restyle, or
   *  delete it like any other node.
   *
   *  It is a host core for a different reason than the others — not to protect a
   *  transaction, but so the platform can keep improving it. A STAMPED brand node
   *  freezes at publish: the tenant who published before `Wordmark` could hold a
   *  logo has a text-only mark forever, and no amount of fixing the composite
   *  reaches them (docs/122 §"Key facts": a composite change never re-authors a
   *  stored tree). A host node stores only a mount point, so the mark renders LIVE
   *  from Site settings on every request — upload a logo, it appears, no builder
   *  trip. `show` picks logo / name / both, which a bound tree cannot express (it
   *  has no conditional — the open "silicaui ask" in docs/122's logo-on-wordmark
   *  note). Staleness-immunity comes from `kind:"host"`; `locked` is orthogonal. */
  siteBrand: 'site.brand',
  /** The ARTICLE BODY of the in-scope CMS entry — the post's rich text, serialized.
   *
   *  A host core rather than a bound node because the body is not a string: it is a
   *  rich-text DOCUMENT (`{type:'doc',content:[…]}`) that only means anything once
   *  `renderDocToHtml` walks it into sanitized markup with its headings, lists,
   *  quotes, callouts, code and embeds intact. A value bind would stringify the
   *  object; there is no binding kind that renders a document. So the one thing a
   *  blog-post template exists to show had no way to appear on the canvas at all,
   *  and every tenant fell through to the bare no-template fallback.
   *
   *  Per-record: the route hands the entry's doc to the live-site renderer, so the
   *  core needs no props — the author places it, and the routed post fills it. */
  cmsArticleBody: 'cms.article-body',
  /** A light/dark theme toggle — a button that flips the site between its light and dark
   *  palettes. A host core, not an authored button, for two reasons a static silica tree
   *  cannot meet: it is INTERACTIVE (client state + the `sparx_theme` cookie the SSR
   *  no-flash script reads), and it must AUTO-HIDE unless the tenant's appearance policy
   *  actually offers both themes (`toggle`) — under any single-theme / device-follow
   *  policy it renders nothing. Place it in the frame's navbar; the live site mounts the
   *  real cookie-backed control (the same one the default header uses), so a silica-framed
   *  site gets a working toggle the shipped `theme-toggle` behavior can't provide (that one
   *  persists to localStorage, not the cookie the live site reads). Not pinned. */
  siteThemeToggle: 'site.theme-toggle',
  /** The site's LEGAL LINKS — privacy / terms / cookie-policy / returns / shipping /
   *  refund, exactly the documents the tenant has actually published, read live from
   *  their doc placements.
   *
   *  A host core rather than authored anchors because the links are DATA the tenant
   *  owns elsewhere, and a static tree gets them wrong in both directions. The starter
   *  footer used to HARDCODE `/privacy-policy` + `/terms-of-service`, so every silica
   *  site promised two legal pages the tenant may never have created — a guaranteed
   *  404 in the footer of a brand-new site. The inverse is just as bad: a tenant who
   *  publishes a cookie policy and a returns policy gets no link to either, because the
   *  frame was stamped before those pages existed.
   *
   *  It also needs a conditional a bound tree cannot express (the same reason
   *  `site.brand` has `show`): with nothing published it must render NOTHING — heading
   *  included — rather than an empty "Legal" column. Mirrors the default site
   *  footer, which appends its Legal column only when `getLegalFooterLinks` is
   *  non-empty. Not pinned: the tenant owns where the links sit (a footer column, a
   *  bottom bar, beside the copyright). */
  siteLegalLinks: 'site.legal-links',
  /** The business's own SOCIAL LINKS — the row of platform marks in a footer.
   *
   *  A host core for the third time and the same reason: it is a tenant setting that
   *  changes AFTER the tree is published, so a stamped node is wrong in both
   *  directions. The footer block ships three social slots, and the seed empties them
   *  rather than publish the block's X/GitHub/LinkedIn placeholders as dead `#` links
   *  — correct, and only half the job. The other half was never built, so Site
   *  identity said "Add one and it appears in your footer", a shop owner added her
   *  Instagram, and nothing appeared: the links were resolved onto `site.social` on
   *  every render and no node ever asked for them (issue 326).
   *
   *  Renders NOTHING with no links, which is what keeps the seed honest — the slot can
   *  now sit in every footer from day one without publishing anything. */
  siteSocialLinks: 'site.social-links',
  /** The visitor's ACCOUNT LINK — "Sign in" to a stranger, their own name to a
   *  signed-in shopper, always pointing at the right one of `/account/login` and
   *  `/account`.
   *
   *  A host core for the same reason as `site.legal-links`, and it failed in the same
   *  two directions. The navbar's secondary slot was a stamped
   *  `{ text: 'Sign in', href: '/account/login' }`, so every site on the platform told
   *  a signed-in customer to sign in — above her own name, on her own order — and
   *  offered her no route back to the account holding her orders and addresses
   *  (issue 291). A stamped node cannot know who is reading it; only something
   *  rendered per request can.
   *
   *  Unlike the other chrome cores it needs no route context: the storefront chrome
   *  renders inside `<CustomerProvider>`, so the live component reads the session it
   *  is already sitting in. Not pinned — the tenant owns where it sits, exactly as
   *  they own the brand mark and the theme toggle. */
  siteAccountLink: 'site.account-link',
  /** PAGE LINKS for a bound list on this page — Previous / 1 2 3 / Next, plus
   *  "Showing 25–48 of 137".
   *
   *  A host core because pagination is almost entirely CONDITIONAL, and a bound tree
   *  has no conditional (the same wall `site.brand`'s `show` and `site.legal-links`
   *  hit). There is no Previous link on page one, no Next on the last, the current
   *  page is text rather than a link, the window of numbers around it changes as you
   *  walk, and the whole control must not render at all when everything fits on one
   *  page. Every one of those is a decision, and a repeated `<a>` bound to a list of
   *  URLs can express none of them — it would render a dead "Previous" on page one of
   *  every site on the platform.
   *
   *  It also has to build URLs that PRESERVE the rest of the query string, so a
   *  reader who filtered and then paged does not lose the filter. That is a
   *  computation over the live request, which is exactly what a host core is for.
   *
   *  `list` names which bound collection it drives, for the rare page carrying two.
   *  Not pinned: the tenant owns where their pager sits, and a page with no list on
   *  it should be able to delete it. */
  sitePagination: 'site.pagination',
  /** A MAP of one location — an address, a place name, or a pasted Google Maps link.
   *
   *  THE ONE EMBED SPARX RENDERS ITSELF, and the reason is narrow enough to state
   *  exactly. Everything else framed on a page is silicaui's `Embed` component: the
   *  ENGINE owns the iframe, recognises the provider and mints the player URL, so a
   *  video block is a stamped `Embed` and nothing here. `Embed` accepts a maps link too
   *  — by passing it through UNCHANGED, which works only for the `output=embed` form
   *  that nobody has. An ordinary Google Maps page URL is answered with
   *  `X-Frame-Options` and renders as a refused, empty frame, and a plain ADDRESS — the
   *  one thing a shop owner definitely has — cannot be used at all.
   *
   *  So this core exists to take an address and build a URL that works. "Find your shop
   *  on Google Maps, open the share menu, choose Embed a map, copy the iframe code, take
   *  the src out of it" is not a thing to ask of someone putting their address on their
   *  contact page. They type the address. If the engine ever learns to do that, this
   *  core should go — it is compensation for a gap, not a design.
   *
   *  The `find_us` catalog section carries the address as TEXT and always has. This is
   *  the picture beside it, which is the part visitors actually use. Not pinned: a map
   *  is the tenant's own content, and deleting it must be ordinary. */
  siteMap: 'site.map',
  /** ANYTHING ELSE from another site — a booking calendar, an order form, a reservation
   *  widget, a donation page.
   *
   *  The escape hatch, and it is a core for the same narrow reason the map is. The
   *  engine's `Embed` frames a recognised set of providers — YouTube and Vimeo, the
   *  audio/podcast players (Spotify, SoundCloud, Apple Music, Apple Podcasts, since 0.50),
   *  and Google's own `/maps/embed` string — and renders EVERYTHING else as a plain
   *  anchor. That is a sound default for an engine and it is not a general embed. The
   *  previous sparx builder shipped one (the `bx-*` Embed section, still live in
   *  `wizeworks/apps/site`), so leaving this out would be a capability the platform used to have and
   *  lost.
   *
   *  Unlike the Video block, this one frames a URL the author chose, so it says so:
   *  https only, sandboxed, and the target's own `X-Frame-Options` is the real gate — a
   *  site that refuses to be embedded refuses here too. A recognised link (a YouTube or
   *  Vimeo video, a Spotify/podcast player) is sent BACK to the Video block by the
   *  pre-publish check rather than framed, because the watch/track page refuses to frame
   *  (a blank box) when the Video block would mint the real player. Not pinned. */
  siteEmbed: 'site.embed',
} as const;

export type HostComponentKey = (typeof HOST_KEYS)[keyof typeof HOST_KEYS];

/** A minimal prop descriptor for a core's Inspector controls — a React-free mirror
 *  of the builder's `HostPropDef`, mapped 1:1 by the dashboard host. */
export interface HostComponentProp {
  name: string;
  label?: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'color' | 'binding';
  options?: { value: string; label: string }[];
  default?: unknown;
}

/** Palette + inspector metadata for one core — a React-free mirror of the builder's
 *  `HostComponentDef` (`apps/dashboard` maps this onto the real type).
 *
 *  A core is `pinned` by DEFAULT (inserted `locked: "host"`), so the tenant styles +
 *  repositions the shell around it but can never delete the transaction. `pinned:
 *  false` opts out for a core that is live-rendered for IMPROVABILITY rather than to
 *  protect a transaction — see `HOST_KEYS.siteBrand`. The two properties are
 *  orthogonal: `kind:"host"` is what makes a node immune to going stale; `locked` is
 *  only about whether the editing spine may move or remove it. */
export interface HostComponentMeta {
  /** The allowlist key an author's placed `HostNode.component` carries. */
  key: HostComponentKey;
  /** Insert-palette + Navigator label, e.g. "Shopping cart". Must be unique against the
   *  CATALOG's labels too — both land in one flat, searchable palette list with no
   *  de-duplication, so "Map" here and "Map" in `sections/media.ts` is a coin toss for
   *  the author. */
  label: string;
  /** Palette group heading. Display copy, Title Case — NOT a slug.
   *
   *  Since `0.51.0` the engine slugs this and looks it up among its own built-in groups,
   *  matching either their key or their slugged label. A hit puts these cores INSIDE that
   *  group (`'media'` would join silicaui's Media, beside Image/Video/Embed); a miss makes
   *  a `hostcat:<slug>` group labelled with this string verbatim.
   *
   *  sparx deliberately misses. "Your shop / bookings / site / writing / media" name the
   *  one thing every core in here has in common and no static primitive does: sparx fills
   *  it from the tenant's own data on every request. Merging them into Media would file a
   *  live, self-updating map beside a static `<img>`. (Before `0.51.0` the lookup did not
   *  exist, and `'media'` drew a SECOND section also headed MEDIA — so this started as
   *  collision avoidance and is now a choice.)
   *
   *  Note the lookup only sees silicaui's built-ins, not `SPARX_CATALOG`, so a core can
   *  never be filed into one of sparx's own section groups. */
  category: string;
  /** A registered icon name (silica `IconName`), drawn in the palette row, the Navigator
   *  and the inspector's identity header.
   *
   *  LIVE since `0.51.0` — `hostIcon()` reads it, validates with `isIconName`, and on an
   *  unknown name falls back to `"plug"` with a one-time console warning. (Through
   *  `0.50.0` it was ignored outright and every core drew that plug; if you are reading a
   *  comment elsewhere that calls this a dead field, it is stale.)
   *
   *  There is still no map or pin glyph in the 109-name set, which is why the map core
   *  reaches for `contact`. */
  icon: string;
  /** One-line description, in the tenant's language.
   *
   *  LIVE since `0.51.0`: it is the palette row's `title` tooltip and feeds search
   *  ranking, alongside label / key / group. It is ALSO the `title=` the workbench canvas
   *  puts on a placed core (`host-cores.tsx`). So it has two audiences — someone
   *  scanning the palette for a block they have not placed yet, and someone hovering one
   *  they have. Write it for the first; it reads fine for the second. */
  hint: string;
  /** Default wrapper classes stamped onto a freshly-inserted node (LITERAL strings so
   *  the Tailwind `@source` harness safelists them — same rule as every composite). */
  defaultClass: string;
  /** Author-tunable props surfaced in the Inspector's Host panel. */
  props?: HostComponentProp[];
  /** Whether inserting this core stamps `locked: "host"` (the engine then refuses to
   *  move or remove it, and the author UI offers no unlock). Defaults TRUE — a
   *  functional core must never be deletable. Set `false` only for a core the tenant
   *  legitimately owns the placement of (the brand mark). */
  pinned?: boolean;
}

/** Every host core the studio offers, module-grouped. The dashboard turns this into
 *  `hostComponents(): HostComponentDef[]` (carrying each entry's `pinned`, default
 *  true) and the site turns each `key` into the real component the live site mounts. */
export const HOST_COMPONENTS: HostComponentMeta[] = [
  {
    key: HOST_KEYS.commerceCart,
    label: 'Shopping cart',
    category: 'Your shop',
    // The curated silica icon set (LUCIDE_ICONS) is UI-oriented — no cart glyph;
    // `box` (a package) is the closest registered name. An unregistered name renders
    // empty (the curated-set footgun), so cores pick only from the shipped keys.
    icon: 'box',
    hint: 'The live cart — line items, quantities, totals, and the checkout button. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-4xl px-6 py-10',
  },
  {
    key: HOST_KEYS.commerceSearch,
    label: 'Search results',
    category: 'Your shop',
    icon: 'search',
    hint: 'The live search — query field, filters, sort, and the result grid. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-6xl px-6 py-6',
  },
  {
    key: HOST_KEYS.commercePlp,
    label: 'Product listing',
    category: 'Your shop',
    icon: 'grid',
    hint: 'The live catalog grid with filters, sort, and pagination. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-6xl px-6 py-6',
  },
  {
    key: HOST_KEYS.commerceCollections,
    label: 'Collection index',
    category: 'Your shop',
    icon: 'gallery',
    hint: 'The live grid of all collections. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-6xl px-6 py-6',
  },
  {
    key: HOST_KEYS.commerceCategories,
    label: 'Category index',
    category: 'Your shop',
    icon: 'grid',
    hint: 'The live grid of top-level browse categories. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-6xl px-6 py-6',
  },
  {
    key: HOST_KEYS.schedulingServices,
    label: 'Booking services',
    category: 'Your bookings',
    // `calendar` is a registered curated-set icon; the scheduling module's glyph.
    icon: 'calendar',
    hint: 'The live list of services open for booking, each linking to its time-picker. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-4xl px-6 py-10',
    // The words above the list are the AUTHOR's. They used to be hardcoded — an
    // `<h1>` reading "Book with us" plus a sentence — so dropping this block onto a
    // page that already had a title gave that page two `<h1>`s and two competing
    // sentences in the platform's voice (issue 095). Blank means no heading, which
    // is what a section that already has its own `<h2>` above it wants.
    props: [
      {
        name: 'heading',
        label: 'Heading',
        type: 'text',
        default: 'Book with us',
      },
      {
        name: 'subheading',
        label: 'Line under the heading',
        type: 'text',
        default: 'Choose a service to see open times and reserve your spot.',
      },
    ],
  },
  {
    key: HOST_KEYS.commerceCategoryDetail,
    label: 'Category detail',
    category: 'Your shop',
    icon: 'grid',
    hint: 'One category: its header, subcategories, and the full product rollup beneath it. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-6xl px-6 py-6',
  },
  {
    key: HOST_KEYS.commerceCollectionDetail,
    label: 'Collection detail',
    category: 'Your shop',
    icon: 'gallery',
    hint: 'One collection: its header and members as a filterable, sortable, paginated grid. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-6xl px-6 py-6',
  },
  {
    key: HOST_KEYS.commerceProductReviews,
    // What a shop owner calls it. Not "review widget" and not "PDP reviews" — she
    // is looking for the thing customers write, and that word is "reviews".
    label: 'Reviews and ratings',
    category: 'Your shop',
    // The same glyph `review_summary` wears, because they are the same subject and
    // an author scanning the palette should see them as a pair. (An UNREGISTERED
    // name renders an empty square — the curated set is the only safe source.)
    icon: 'article',
    hint: 'What customers said about this product: the star rating, their reviews, and a form for writing one. Put it on your product page.',
    // NOT pinned. Every other shop core protects a transaction the tenant must not
    // be able to delete — a cart, a checkout, a sign-in form. Reviews are a choice:
    // plenty of businesses do not want them, and one that adds this and changes its
    // mind must be able to take it off the page again.
    pinned: false,
    defaultClass: 'mx-auto w-full max-w-4xl px-6',
    props: [
      {
        name: 'heading',
        label: 'Heading',
        type: 'text',
        default: 'Reviews',
      },
      {
        name: 'emptyText',
        label: 'What to say before anyone has reviewed',
        type: 'text',
        // Says the true thing and asks for the next one. A brand-new shop's product
        // page shows this for weeks, so it is real copy, not a placeholder.
        default: 'No reviews yet — be the first.',
      },
      {
        name: 'showForm',
        label: 'Let customers write a review',
        type: 'boolean',
        default: true,
      },
    ],
  },
  {
    key: HOST_KEYS.commerceProductQuestions,
    // What a shop owner calls it, and the pair of words her console already uses for
    // the queue these land in. Not "Q&A" — an abbreviation she has to expand before
    // she knows whether it is the thing she is looking for.
    label: 'Questions and answers',
    category: 'Your shop',
    // The same glyph reviews wear. A shopper writing on a product page is one subject,
    // and an author scanning the palette should see the two as a set.
    icon: 'article',
    hint: 'Questions customers asked about this product, your answers, and a form for asking a new one. Put it on your product page.',
    // Unpinned, for the reason reviews are: this is a CHOICE, not a transaction.
    // Nothing about the shop stops working without it, and a business that tries
    // taking questions and decides it would rather answer by email must be able to
    // take the section off the page again.
    pinned: false,
    defaultClass: 'mx-auto w-full max-w-4xl px-6',
    props: [
      {
        name: 'heading',
        label: 'Heading',
        type: 'text',
        default: 'Questions',
      },
      {
        name: 'emptyText',
        label: 'What to say before anyone has asked',
        type: 'text',
        // Invites the first one rather than reporting a shortage. A new shop shows
        // this line for months, so it is real copy and not a placeholder.
        default: 'No questions yet — ask us anything.',
      },
      {
        name: 'showForm',
        label: 'Let customers ask a question',
        type: 'boolean',
        default: true,
      },
    ],
  },
  {
    key: HOST_KEYS.schedulingServiceDetail,
    label: 'Booking widget',
    category: 'Your bookings',
    icon: 'calendar',
    hint: 'One service: its details and the live time-picker to book it. Pinned: style and surround it, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-4xl px-6 py-10',
  },
  {
    key: HOST_KEYS.commerceAuth,
    label: 'Account form',
    category: 'Your shop',
    icon: 'avatar',
    hint: 'The shopper sign-in / create-account form. Pinned: style and surround it with your own copy, but it can’t be removed.',
    defaultClass: 'mx-auto w-full max-w-xl px-6 py-12',
  },
  {
    key: HOST_KEYS.siteBrand,
    label: 'Brand (logo + name)',
    category: 'Your site',
    icon: 'image',
    hint: 'Your logo and site name, linked to your home page. Set them once in Site settings — this always shows what’s there.',
    // The `wordmark` class is load-bearing, not decoration: silicaui's own
    // `.wordmark & :is(svg,img)` rule sizes the mark, so keeping it makes this a real
    // Wordmark rather than a lookalike lockup.
    // `gap-2`, not the half-step `gap-2.5` this used to carry: the declared authoring
    // vocabulary has no half steps, so that class only ever compiled because this
    // source file happens to be @source-scanned. Copied into a tenant's tree it is a
    // class that emits nothing the moment this line changes — which is precisely the
    // failure `checkClassString` exists to catch, and it caught this one.
    defaultClass: 'wordmark inline-flex items-center gap-2',
    // The conditional a BOUND tree cannot express: two bound children always both
    // render, which is why the composite had to tell authors to "delete the part you
    // don't want". The host renders in React, so it can simply choose.
    props: [
      {
        name: 'show',
        label: 'Show',
        type: 'select',
        default: 'both',
        options: [
          { value: 'both', label: 'Logo and name' },
          { value: 'logo', label: 'Logo only' },
          { value: 'name', label: 'Name only' },
        ],
      },
    ],
    // NOT pinned — the tenant owns where their own brand sits. See HOST_KEYS.siteBrand
    // for why it is a host core anyway.
    pinned: false,
  },
  {
    key: HOST_KEYS.siteThemeToggle,
    label: 'Theme toggle (light / dark)',
    category: 'Your site',
    icon: 'settings',
    hint: 'A light/dark switch for visitors. Appears only when your site offers both themes (Appearance: toggle) — otherwise it stays hidden. Place it in your header.',
    defaultClass: 'inline-flex items-center',
    // Not pinned: the tenant owns whether and where a theme switch sits in their chrome.
    pinned: false,
  },
  {
    key: HOST_KEYS.siteAccountLink,
    label: 'Account link (sign in / their name)',
    category: 'Your site',
    icon: 'avatar',
    hint: 'Says “Sign in” to a visitor and shows a customer their own name once they are signed in, linking to their orders and details. Put it in your header.',
    defaultClass: 'inline-flex items-center',
    // Not pinned: the tenant owns whether and where an account link sits in their chrome.
    pinned: false,
  },
  {
    key: HOST_KEYS.siteLegalLinks,
    label: 'Legal links',
    category: 'Your site',
    icon: 'article',
    hint: 'Links to the legal pages you have published — privacy, terms, cookies, returns. Always current, and hidden entirely until you publish one. Put it in your footer.',
    // A footer link column: the heading + its links stacked, matching the hand-authored
    // columns beside it.
    defaultClass: 'flex flex-col gap-3',
    props: [
      {
        name: 'heading',
        label: 'Heading',
        type: 'text',
        // Blank renders the links with no heading — for a bottom bar or a copyright row,
        // where a column title would be wrong.
        default: 'Legal',
      },
    ],
    // Not pinned: the tenant owns their footer layout. Pinning would leave an
    // undeletable empty box on a site with no legal pages published yet.
    pinned: false,
  },
  {
    key: HOST_KEYS.siteSocialLinks,
    label: 'Social links',
    category: 'Your site',
    icon: 'share',
    hint: 'The social accounts you list in Site identity, as a row of marks. Always current, and hidden entirely until you add one. Put it in your footer.',
    // POSITIONING ONLY. The renderer's own `SocialLinks` already lays the marks out as a
    // wrapped row (`flex flex-wrap items-center gap-1`), so a row class here would be a
    // second, conflicting one — two `gap-*` utilities on one element resolve by stylesheet
    // order, not by the order they are written, which is a coin toss rather than a design.
    defaultClass: 'mt-2',
    // Not pinned, for the same reason as the legal links: the tenant owns where their
    // socials sit, and a site with none would otherwise carry an undeletable empty row.
    pinned: false,
  },
  {
    key: HOST_KEYS.sitePagination,
    label: 'Page links (older / newer)',
    category: 'Your site',
    // `layout`, not a chevron: the curated silica icon set is UI-oriented and an
    // UNREGISTERED name renders empty (the footgun this file's cart entry already
    // documents), so a core only ever picks a name proven in use here.
    icon: 'layout',
    hint: 'Previous / next links for a list on this page, so visitors can reach everything rather than only the first 24. Hides itself when everything already fits.',
    // Full-width under the grid it pages, with the same page gutter every seeded
    // section uses so it lines up with the list above it.
    defaultClass: 'mx-auto w-full max-w-6xl px-6 pb-12',
    props: [
      {
        name: 'list',
        label: 'Which list',
        type: 'select',
        // Blank = the only paginated list on the page, which is the normal case and
        // means an author never has to answer this question.
        default: '',
        options: [
          { value: '', label: 'The list on this page' },
          { value: 'commerce.product', label: 'Products' },
          { value: 'cms.blog_post', label: 'Blog posts' },
        ],
      },
    ],
    // Not pinned: a pager belongs to the list the tenant placed, so they own whether
    // it is there at all. Pinning would leave an undeletable control under a page
    // whose grid they later removed.
    pinned: false,
  },
  {
    key: HOST_KEYS.cmsArticleBody,
    label: 'Article body',
    category: 'Your writing',
    icon: 'article',
    hint: 'The written body of the post being shown — headings, lists, quotes, and images exactly as they were typed. Pinned: style and surround it, but it can’t be removed.',
    // Prose measure, not the 6xl page measure the commerce cores use: a line of body
    // text past ~75 characters is measurably harder to read, and this core is nothing
    // but body text.
    defaultClass: 'mx-auto w-full max-w-3xl px-6 py-10',
  },
  {
    key: HOST_KEYS.siteMap,
    // "on its own" because the Add palette ALSO carries `map_embed` — the whole block,
    // heading and address and map together — and the engine gives both rows the same
    // weight. Two rows reading exactly "Map" is a coin toss, and the one an author
    // almost always wants is the block. This says which is which without jargon.
    //
    // `0.51.0` made `hide` reach host rows, so suppressing this one is now possible and
    // is deliberately NOT done: the bare core is the only way to put a map inside a
    // layout the author built themselves (a column, a card, a two-up row). The block is
    // a whole section and cannot go there. Keeping both and naming them honestly beats
    // removing the one that composes.
    label: 'Map on its own',
    // Title Case, and NOT "media": the raw `category` string is used verbatim as the
    // palette's group heading, so lowercase slugs render as lowercase headings beside
    // properly-cased ones — and "media" collided outright with silicaui's own built-in
    // "Media" group, drawing two separate sections that both read MEDIA. "Your …"
    // also says the true thing about every core in here: sparx fills it in from the
    // tenant's own data.
    category: 'Your media',
    // The curated set has no map or pin glyph (and an UNREGISTERED name renders empty —
    // the footgun the cart entry above documents). `contact` is the registered one that
    // means this: a map is the contact page's "where we are".
    icon: 'contact',
    hint: 'A map showing where you are. Type your address — or paste a Google Maps link — and visitors get a map they can zoom and get directions from.',
    defaultClass: 'mx-auto w-full max-w-3xl px-6 py-10',
    props: [
      {
        name: 'location',
        label: 'Address or place',
        type: 'text',
        default: '',
      },
      {
        name: 'title',
        label: 'What the map shows',
        type: 'text',
        default: 'Map',
      },
      {
        name: 'zoom',
        label: 'Zoom',
        type: 'number',
        // 15 frames a few surrounding streets — enough to recognise the area without
        // losing the building. A pasted Maps link overrides this with the zoom the
        // author was actually looking at.
        default: 15,
      },
      {
        name: 'ratio',
        label: 'Shape',
        type: 'select',
        default: 'classic',
        options: FRAME_RATIOS.map((r) => ({ value: r.value, label: r.label })),
      },
    ],
    // Not pinned: a map is the tenant's own content. Locking it would leave an
    // undeletable empty band on a page they later changed their mind about.
    pinned: false,
  },
  {
    key: HOST_KEYS.siteEmbed,
    // Same collision as the map above, and worse: this label was IDENTICAL to the
    // catalog's `other_embed`, and silicaui's own Content group ships a third row
    // simply called "Embed". Three rows, three different things, one name. Kept visible
    // for the same reason as the map — it is the composable one.
    label: 'Embed on its own',
    category: 'Your media',
    icon: 'code',
    hint: 'Something from another website — a booking calendar, an order form, a playlist. Paste its link. Some sites don’t allow this; if nothing shows, that site has blocked it.',
    defaultClass: 'mx-auto w-full max-w-3xl px-6 py-10',
    props: [
      { name: 'url', label: 'Link', type: 'text', default: '' },
      {
        name: 'title',
        label: 'What it is',
        type: 'text',
        // A frame with no accessible name is announced as "frame" and nothing else, so
        // a screen-reader user is told something is there and not what. Seeded with a
        // real default rather than blank, because a blank one is what would ship on
        // every untouched block.
        default: 'Embedded content',
      },
      {
        name: 'ratio',
        label: 'Shape',
        type: 'select',
        default: 'classic',
        options: FRAME_RATIOS.map((r) => ({ value: r.value, label: r.label })),
      },
    ],
    pinned: false,
  },
];

/** Author a functional core as a `HostNode` — the kit's `host()` with the core's
 *  registered default wrapper classes, stamped `locked: "host"` unless the core opts
 *  out (`pinned: false`). The palette-insert path gets the lock from the `pinned`
 *  `HostComponentDef`, but a core embedded DIRECTLY in a code composite / starter page
 *  (not inserted) must carry the lock itself, or the studio would let the author delete
 *  the seeded core. `locked: "host"` = the engine refuses remove/move and shows no
 *  unlock (only the host clears it).
 *
 *  An UNPINNED core is a plain, movable node that merely happens to render live — the
 *  brand mark. Defaulting to locked keeps every functional core safe by omission: a new
 *  core is protected unless someone deliberately says otherwise. */
export function hostCore(
  key: HostComponentKey,
  cls?: string,
  props?: Record<string, unknown>
): HostNode {
  const meta = HOST_COMPONENTS.find((c) => c.key === key);
  const node = host(key, cls ?? meta?.defaultClass ?? '', props ?? defaultHostProps(key));
  return meta?.pinned === false ? node : { ...node, locked: 'host' };
}

/** A core's registered prop defaults, so a seeded core behaves identically to one
 *  inserted from the palette (the Inspector applies defaults on insert; a composite
 *  would otherwise emit a propless node and rely on the renderer's own fallback). */
function defaultHostProps(key: HostComponentKey): Record<string, unknown> | undefined {
  const props = HOST_COMPONENTS.find((c) => c.key === key)?.props;
  if (!props?.length) return undefined;
  const out: Record<string, unknown> = {};
  for (const p of props) if (p.default !== undefined) out[p.name] = p.default;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A default editable SHELL wrapping a pinned core — the fallback page body the
 *  live site renders (and the seed the studio opens) for a functional route with no
 *  stored template yet. A titled section header (fully editable/removable) above the
 *  pinned core; the tenant restyles the heading, adds trust badges / upsells around
 *  it, and repositions everything — the core alone stays put. */
export function functionalShell(
  key: HostComponentKey,
  opts: { heading?: string; coreClass?: string; props?: Record<string, unknown> } = {}
): Node {
  const children: Node[] = [];
  if (opts.heading) {
    children.push(
      el('h1', 'mb-6 px-6 pt-10 text-3xl font-semibold text-base-content', { text: opts.heading })
    );
  }
  children.push(hostCore(key, opts.coreClass, opts.props));
  // `@container`, like every other seeded section: the tenant is expected to add
  // their own content around the pinned core, and a responsive class they write
  // there needs an ancestor container to measure or it does nothing at all.
  return el('section', 'bg-base-100 @container', { children });
}
