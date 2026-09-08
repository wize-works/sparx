# Sephora / Huda Beauty — design study → `sparx-beauty-counter`

**Version:** 1.0.0
**Author:** Brandon Korous
**Last Updated:** 2026-08-04
**Reference:** **Huda Beauty** — https://hudabeauty.com (captured 2026-08-04, default 1280px viewport, real Chromium). Sephora (the intended reference) **hard-blocked** automated Chrome with a `403 Access Denied` wall on the first request, so this study falls back to Huda Beauty per the brief — the same "beauty counter" archetype (own-brand color-cosmetics house, shade-forward merchandising, ratings on every card).
**Archetype:** Beauty counter — dense category-driven makeup merchandising, hot-pink chrome, shade-swatch grids on cards AND on the PDP, ratings-forward product cards, loyalty/VIP prompts, gift-with-purchase promotional bands, editorial "find your match" storytelling.
**sparx slug:** `beauty-counter` · **Example vertical:** own-brand color cosmetics (foundation / lip / eye / tools) · **Theme:** bespoke tinted — `gloss` (see §6; closest presets `salon`/`petal` from care/shops)

> Faithfulness bar: **closest clone allowed** — mimic structure AND aesthetic feel,
> sparx components + branding only, no trademarked assets. See [README](../README.md).

## 1. Why this reference

Sephora and Huda Beauty are the defining **beauty-counter** storefronts: a color-cosmetics house where the merchandising problem is not "which product" but "which **shade**." That single fact reshapes the whole layout language — the swatch grid becomes a first-class navigation control (on the card, in the buy-box, in the mega-nav), every product card leads with a **star rating + review count** because social proof sells a shade you can't swatch on your own hand, and the chrome runs a saturated brand hue (Huda's hot magenta) that treats color itself as the product. It earns its place in our set as the **shade-and-ratings anchor**: the densest, most swatch-driven, most review-forward archetype we study, and the one that most needs product cards to carry a color row + rating inline. The homepage is a "find your perfect match" funnel — tabbed drops → editorial match-making → shoppable grid → gift-with-purchase → community UGC — engineered to move a visitor from a look to a shade to a bag.

## 2. Screenshots

Captured to `./images/`.

- `home-fold.png` — Hero fold: dark announcement bar ("NEW! LIQUID MATTE MOUSSE - AVAILABLE IN 8 SHADES"), hot-pink two-row header (utility nav + category nav), full-bleed lifestyle hero with bottom-left overlay ("SOFTCORE MATTE LIPS" + "SHOP THE LOOK"), and the country/welcome popup.
- `home-full.png` — Full homepage scroll: hero → tabbed product carousel (NEW / BEST SELLERS / GIFT & SETS) → "THE PERFECT MATCH" editorial band → "FIND YOUR PERFECT MATCH" product grid → "FREE BLUSH" gift-with-purchase band → "OUR COMMUNITY" UGC grid → pink footer + newsletter.
- `nav.png` — Category mega-nav (hover "FACE"): left vertical category list (SHOP ALL FACE / FOUNDATION / POWDER & SETTING / PRIMER / CONCEALER / CONTOUR & HIGHLIGHT / BLUSH) + a "SHOP ALL FACE" pill, beside a "TRENDING IN FACE" 5-up product rail with BEST SELLER badges and prices.
- `pdp.png` — PDP fold: left thumbnail rail (product / on-model / texture / on-model / **shade-range strip**), main pack shot with a VEGAN FRIENDLY roundel; buy-box with breadcrumb, title, one-line description + size, **4.5 ★ (2143)** in magenta, `$42.00`, **SHADE "Peaches N Cream 245B"**, a "Select a Shade" swatch dropdown + selected swatch, pill **ADD TO BAG**, and a **"earn up to 42 Points with Huda's VIPs"** loyalty line.
- `pdp-full.png` — Full PDP: gallery + buy-box → loyalty/free-samples reassurance → accordions (**PRODUCT INFO / HOW TO USE / COMMON QUESTIONS / INGREDIENTS**) → embedded FREE BLUSH promo card → **reviews** ("4.5 — Based on 2,143 reviews", REVIEWS/QUESTIONS tabs, FILTERS, WRITE A REVIEW, "Most Helpful" sort, verified-buyer rows with helpful up/down votes) → footer.
- `plp.png` — Foundation collection grid: 4-up cards, each with product image, name, short description, price, a **shade-swatch row (5 circles + "+N")**, **star rating + count**, and a **ADD TO BAG / SELECT SHADES / Select-a-Size** action that adapts to the product's variant model. MINI SIZE / FULL SIZE / VEGAN FRIENDLY badges.
- `plp-full.png` — Full collection: breadcrumb + "**SHOP FOUNDATION**" header, a compact **Sort + filter** chip bar (no heavy sidebar), the 4-up grid, and an **in-grid "FREE BLUSH" promotional tile** interrupting the merchandising.
- `footer.png` — Hot-pink footer: script HB monogram, link columns (ABOUT US / HUDA'S VIPS LOYALTY PROGRAM / AMBASSADOR / AFFILIATE / BLOG / CONTACT / SHIPPING / FAQS / RETURNS / legal), "HEY BEAUTIFUL, LET'S CONNECT" newsletter, social row, copyright.
- `shade-grid.png` — Signature: the tabbed homepage carousel (NEW / BEST SELLERS / GIFT & SETS) with each card carrying a full **row of shade-swatch dots** (up to 8 + "+"), badges (NEW / HUDA'S DUO / BEST SELLER / SAVE 10%), star ratings, and ADD TO BAG / NOTIFY ME.
- `rewards-band.png` — Signature: the **"FREE BLUSH with all orders over $100"** gift-with-purchase band — blush ground, product splash, "SHOP NOW", a heart **"CHOOSE SHADE AT CHECKOUT"** roundel, and "\*T&Cs apply" fine print.

## 3. Design language

- **Palette:** **Saturated hot-magenta chrome on warm near-white.** The brand hue is a bright magenta-pink `~#E5006E` (header, category nav, every primary button fill, price text, star glyphs, badges, footer) carried with **white ink** — a bold, high-chroma fill, the exact inverse of a "soft luxury" pale-pink. Content grounds are a warm near-white / pale blush `~#FDF4F6`→`#FCEFF3`; ink is near-black plum `~#1A1013`; secondary promo grounds are muted mauve/rose (`~#B05F63` "perfect match" band) and warm greige (`~#F1EDEA` GWP band); hairline `~#EFE6E9`. Product photography brings the shade chroma (nudes, berries, corals). Mood: confident, feminine, loud, color-obsessed — color _is_ the merchandise.
- **Typography:** A **heavy uppercase display grotesque** for section headers and product titles ("SHOP FOUNDATION", "#FAUXFILTER LUMINOUS MATTE FOUNDATION", "FREE BLUSH", "OUR COMMUNITY") — tight, bold, all-caps — paired with a clean humanist sans for body, descriptions, prices and review copy (sentence case, regular weight). The heavy-caps-vs-clean-sans contrast reads as beauty-editorial. Navigation and badge labels are small all-caps. Prices are bold; strikethrough compare-at + magenta "Save $X" sit inline.
- **Imagery:** Three registers — (1) **on-model lifestyle** for hero + editorial bands (close, glossy, skin-and-lip forward); (2) **studio pack shots** on white for product cards (with a paint-swipe of the shade beside the bottle); (3) **glossy product-splash** stills for the GWP band. Plus **UGC/creator** portraits in the community grid. Crops are generous; hero is full-bleed edge-to-edge.
- **Shape & density:** **Rounded and soft** — fully-pill buttons (ADD TO BAG), rounded cards and dropdowns, circular swatch dots and roundel badges. Cards sit on hairline borders with a very soft lift. **Dense 4-up product grids** and a 5-up mega-nav rail. Swatch rows and rating rows make each card taller and more information-rich than a fashion card. Generous vertical spacing between bands; section headers get air.
- **Motion:** Auto/hover category mega-flyouts; **in-place tab filters** on the homepage carousel (NEW / BEST SELLERS / GIFT & SETS) that reslice the row without navigating; carousel prev/next; hover image-swap + swatch-hover recolor on cards; the country/welcome modal on first load; sticky header. Restrained, merchandising-driven — no cinematic video.

## 4. Layout anatomy (top to bottom)

- **Announcement / utility bar:** Slim near-black strip, centered underlined text promoting the current drop ("NEW! LIQUID MATTE MOUSSE - AVAILABLE IN 8 SHADES"). Single message, link-styled.
- **Header / nav:** Hot-magenta, **two rows**. **Row 1 (utility):** left quick-links (SHOP ALL · NEW · BEST SELLERS · GIFTS & SETS), centered **wordmark**, right cluster (country/currency selector, search, account, wishlist, cart). **Row 2 (category):** the primary taxonomy — LIPS · FACE · EYES · CHEEKS · FRAGRANCES · MINIS · BRUSHES & ACCESSORIES · SKIN CARE — each opening a **mega-flyout**: a left vertical sub-category list + a "TRENDING IN {category}" product rail (BEST SELLER badges, prices) + a "SHOP ALL {category}" pill. Sticky.
- **Hero:** **Full-bleed on-model lifestyle image**, overlay copy pinned bottom-left: heavy-caps headline ("SOFTCORE MATTE LIPS"), a product-line subhead, and a single **"SHOP THE LOOK"** CTA. Not centered.
- **Homepage section sequence** (this IS the blueprint's home composition):
  1. **Tabbed product carousel** — "NEW / BEST SELLERS / GIFT & SETS" tab filter over 4 shoppable cards (badge, image, name, price + compare-at "Save $X", **shade-swatch dot row**, ★ rating + count, ADD TO BAG / NOTIFY ME), "View All".
  2. **Editorial match-making band** — "THE PERFECT MATCH": mauve ground, lip close-up, "Find Your Duo" copy + **"FIND YOUR DUO"** CTA. The shade-pairing story.
  3. **"FIND YOUR PERFECT MATCH" product grid** — 4 shoppable cards (lip duos) with NEW / SAVE 10% badges, compare-at pricing, ratings, ADD TO BAG, "View All".
  4. **Gift-with-purchase / rewards band** — "FREE BLUSH with all orders over $100", product-splash still, "SHOP NOW", a heart **"CHOOSE SHADE AT CHECKOUT"** roundel, "\*T&Cs apply" fine print.
  5. **Community / UGC grid** — "OUR COMMUNITY": creator portraits with **"JOIN HUDA'S VIPS"** and **"JOIN AMBASSADORS"** pills — loyalty + advocacy.
  6. **Footer** (below).
- **PDP anatomy:** Two-column. **Left:** vertical thumbnail rail (pack shot, on-model, **texture swatch**, on-model, **full shade-range strip**) + large main image with a **VEGAN FRIENDLY** roundel. **Right (buy-box):** breadcrumb (Shop All / Face / Foundation), heavy-caps title, one-line description + size, **★ 4.5 (2143)** in magenta, price, **SHADE "{selected shade name}"**, a **"Select a Shade" swatch dropdown** (opens to the full shade grid) + the selected swatch, a full-pill **ADD TO BAG**, a **loyalty line** ("earn up to 42 Points with Huda's VIPs"), "Create an account / Sign in to earn points" + **"Free Samples with every order"** reassurance, then **accordions**: PRODUCT INFO · HOW TO USE · COMMON QUESTIONS · INGREDIENTS, and an embedded FREE BLUSH promo card. **Below:** a **reviews** block — big "4.5" + histogram-style "Based on 2,143 reviews", **REVIEWS / QUESTIONS** tabs, FILTERS + WRITE A REVIEW, "Most Helpful" sort, verified-buyer/reviewer rows (title, body, **helpful ▲/▼ votes**, date), SHOW MORE.
- **Collection / PLP:** Breadcrumb + heavy two-tone header ("SHOP **FOUNDATION**"). A **compact control bar** — a "Sort" pill (with ⇅) + a filter chip ("Shop All") — rather than a heavy left sidebar. Then a **4-up product grid**; each card = optional BEST SELLER / MINI SIZE / FULL SIZE / VEGAN badge, image, name, short description, price, **shade-swatch row (circles + "+N")**, **★ rating + count**, and an action that adapts to the variant model (ADD TO BAG for single-SKU, **SELECT SHADES** for shade-ranged, **Select a Size** dropdown for size-ranged, NOTIFY ME for out-of-stock). An **in-grid promotional tile** (FREE BLUSH) interrupts the grid as a merchandising cell.
- **Footer:** Hot-magenta. Script monogram, three+ link columns (ABOUT / **HUDA'S VIPS LOYALTY PROGRAM** / AMBASSADOR / AFFILIATE / BLOG · CONTACT / SHIPPING / FAQS / FIND MY ORDER / RETURNS · legal), a **"HEY BEAUTIFUL, LET'S CONNECT"** newsletter sign-up, a social-icon row, and copyright.

## 5. Signature interaction patterns

1. **Shade-swatch as a first-class control, everywhere.** A row of circular shade dots (+ "+N more") on every product **card**, a "Select a Shade" **swatch grid** in the PDP buy-box with the selected shade _named_, and a full **shade-range strip** in the gallery. The swatch is navigation, not decoration.
2. **Ratings on every card.** ★ average + `(count)` in the brand hue sits on the card between price and CTA — social proof is inline merchandising, not a PDP-only afterthought.
3. **Variant-adaptive card CTA.** The same card slot renders **ADD TO BAG** (single SKU), **SELECT SHADES** / **Select a Size** (ranged), or **NOTIFY ME** (out of stock) depending on the product — one component, four states.
4. **Loyalty + gift-with-purchase woven through the funnel.** VIP points on the PDP ("earn 42 Points"), free-samples reassurance, a homepage + in-PDP + in-grid **gift-with-purchase band** ("FREE BLUSH… CHOOSE SHADE AT CHECKOUT"), and community "JOIN VIPS / AMBASSADORS" prompts.
5. **In-place tabbed drops.** NEW / BEST SELLERS / GIFT & SETS tabs reslice the homepage carousel without navigation — the beauty-counter equivalent of a drop rhythm.

## 6. The sparx translation

- **Theme:** **bespoke tinted — `gloss`** (closest shipped presets `salon` and `petal`, both `care`/`shops`, both **GROUND tinted**). Those two presets are structurally right — a visibly blush/mauve page — but both carry a **pale** primary with dark ink ("soft luxury"). The beauty-counter look is the opposite: a **bright, saturated primary that fills and carries white ink.** `gloss` keeps the tinted-blush grounds and borrows petal's surface geometry, but swaps in a bold magenta primary.
  - **Grounds (4 surfaces, light):** `base-100` page = warm near-white blush `oklch(98% 0.012 350)` (~~`#FDF4F6`); `base-200` muted = pale blush `oklch(95% 0.03 350)` (~~`#FBEAF0`); `base-300` line/inset = `oklch(90% 0.05 345)` (~~`#F3D3DE`); **ink chrome ground** = near-black plum `oklch(18% 0.02 345)` (~~`#1A1013`) — carried as a `surface="dark"` island for the announcement bar and any dark beat.
  - **Primary strategy:** **bright** — a saturated hot magenta `oklch(58% 0.24 355)` (~`#E5006E`) that **fills** the header band, primary buttons, price, star glyphs and badges, carrying **white ink** (white-on-magenta clears AA at body sizes). This is the one place `gloss` departs from `salon`/`petal`, and it is the whole point.
  - **Secondary:** deep wine/plum `oklch(40% 0.14 345)` — editorial band grounds, the "perfect match" mauve, secondary headings.
  - **Accent:** warm nude/peach `oklch(80% 0.09 45)` — swatch-neutral chrome, the VIP/loyalty "gold-ish" accent, GWP roundel ground. (Status roles inherit `STATUS_ON_LIGHT`.)
  - **Neutral:** near-black plum `oklch(26% 0.02 345)` for the text chassis + hairlines.
  - **Shape:** rounded — `selector: 2rem` (pill buttons + swatch chips), `field: 0.5rem`, `box: 1rem`, `depth: 1`. Matches the reference's fully-pill CTAs and soft cards.
  - **Fonts:** `head` = a **heavy uppercase grotesque** (tenant-loaded display face — bold, tight, all-caps section headers + product titles); `body` = a clean humanist sans (`Outfit` / `Inter`), sentence case, ≥16px. (Geist is the sparx-surface default; a tenant site is free to load a display face — that is tenant freedom.)
  - **AA:** white-on-magenta primary, plum-ink-on-blush body, and magenta-on-white price/stars all clear the catalog AA sweep; the pale accent is used for chrome/roundels, never as readable ink.

- **Section mapping:**

  | Huda/Sephora homepage band                      | sparx catalog key                                                    |
  | ----------------------------------------------- | -------------------------------------------------------------------- |
  | Announcement drop bar                           | `notice_banner`                                                      |
  | Two-row header / category mega-nav + footer     | `sparx_layout` (silica frame navbar/footer)                          |
  | Full-bleed lifestyle hero + single CTA          | `offer_hero` _(image + bottom-left overlay)_                         |
  | Tabbed product carousel (New/Best/Gifts)        | `product_carousel` _(tab-filter + swatch-row + rating variant — §7)_ |
  | "The Perfect Match" editorial band              | `picture_band`                                                       |
  | "Find Your Perfect Match" product grid          | `products` _(swatch-row + rating card variant — §7)_                 |
  | "Free Blush" gift-with-purchase band            | `offer_hero` _(GWP/promo variant — §7)_ (fallback `bundle_offer`)    |
  | "Our Community" UGC grid + VIP/ambassador pills | `sparx_gallery` / `gallery_grid` _(UGC variant)_                     |
  | Newsletter + link columns                       | `newsletter_signup` + `onward_links`                                 |

  **PDP:** buy-box → `buy_box` _(shade-swatch selector + selected-shade name + loyalty micro-line variant — §7)_; gallery + shade-range strip → `products`/gallery; PRODUCT INFO → `prose_section` / `spec_list`; HOW TO USE → `how_it_works`; COMMON QUESTIONS → `faq_single_open`; INGREDIENTS → `spec_list` / `inclusion_list`; free-samples/VIP reassurance → `reassurance_row`; reviews → `review_summary` _(verified-buyer + helpful-votes + REVIEWS/QUESTIONS tabs + histogram variant — §7)_; embedded promo → `notice_banner` / `offer_hero`.
  **PLP:** header + breadcrumb → `collection_header`; Sort + filter chip bar → `products` collection controls; grid → `products` _(same card variant)_; in-grid FREE BLUSH tile → `category_tiles` promo slot / `offer_hero` _(in-grid promo tile — §7)_.

- **Example business:** **Maeve** — an own-brand **color-cosmetics house** ("Full pigment. No apology."). A bold, shade-obsessed makeup line spanning face, lip, eye and tools, sold direct.
  - **Commerce catalog (~15 SKUs across foundation/lip/eye/tools, multi-shade so swatch rows + selectors render):**
    - **Face:** _Second Skin Luminous Foundation_ (24 shades) · _Cloud Set Loose Powder_ (4 shades) · _Soft Focus Blurring Primer_ (1) · _Sunlit Cream Blush_ (8 shades) · _Sculpt Contour Stick_ (6 shades).
    - **Lip:** _Velvet Matte Liquid Lip_ (16 shades) · _Glass Shine Lip Oil_ (8 shades) · _Precision Lip Liner_ (10 shades) · _Bitten Lip Stain_ (6 shades).
    - **Eye:** _Bloom 9-Pan Eyeshadow Palette_ (3 palettes — Warm / Cool / Rose) · _Featherweight Mascara_ (Black / Brown) · _Skinny Gel Eyeliner_ (6 shades) · _Brow Sculpt Pomade_ (6 shades).
    - **Tools:** _The Buffing Foundation Brush_ · _Seamless Blender Sponge_ · _Precision Shadow Brush Duo_.
    - **Collections:** New In · Best Sellers · Foundation · Lip · Eye · Tools · Gift Sets. Compare-at pricing + "Save $X" on sets; MINI / FULL SIZE and VEGAN badges; several NOTIFY-ME (waitlist) SKUs.
  - **CMS journal / how-to plan — "The Maeve Edit"** (`cms.blog_post` records that fill the editorial + how-to bands and PDP HOW-TO):
    - _How to find your foundation shade match_ (undertone quiz) · _The 5-minute everyday face_ · _Build a berry lip in three steps_ · _Warm vs cool: reading your undertone_ · _Blush placement by face shape_ · _What niacinamide + hyaluronic acid actually do in your base_ · _Founder note: why we launched with 24 shades_ · _Shade drop: introducing the Cool palette._

- **Design freedom used (tenant-only affordances):** saturated magenta **flood-fill chrome** (header + footer bands); a **soft card lift** (subtle shadow, permitted on a tenant site); full-bleed hero imagery; **hover swatch-recolor + image-swap** on cards; the **welcome/country modal**; fully-pill buttons + circular swatch chips. All are tenant-site freedoms (they would be forbidden on a sparx-owned surface) — sparx's own restraint rules (no shadow / no flood-fill hue / no gradient) do **not** bind a builder-authored tenant template.

- **Deliberate departures:** vertical is a **fictional own-brand line (Maeve)** — no Sephora/Huda wordmark, monogram, product names ("#FauxFilter", "Easy Blur", "Liquid Matte Mousse"), photography, or shade names; reviews/ratings/points values are generic placeholders, not scraped; we keep **one** bright brand hue disciplined to chrome + primary + price + stars + badges (color still comes mostly from the shade photography); the PLP uses a **compact Sort+filter bar** (matching Huda) rather than inventing a heavy faceted sidebar.

## 7. Build notes / catalog gaps

These are catalog **variants/additions** (propagate once, never per-bundle inlines). The beauty-counter archetype leans hardest on the product-card, so most gaps live there:

- **`product_card` shade-swatch + rating variant** — a **row of circular shade swatches** (bound to the product's shade options) with a "+N" overflow chip, plus an inline **★ average + `(review count)`** between price and CTA. This is the single most load-bearing addition; without it the cards read as generic apparel cards, not beauty cards.
- **Variant-adaptive card CTA** — one action slot resolving to **ADD TO BAG** (single SKU) / **SELECT SHADES** / **Select a Size** dropdown (ranged) / **NOTIFY ME** (out of stock), driven by the product's variant model.
- **`buy_box` shade-swatch selector** — a **grid of shade circles** (or a swatch dropdown that opens the grid) that **names the selected shade** ("Peaches N Cream 245B"), with a compare-at + "Save $X" price treatment.
- **`buy_box` loyalty micro-line** — a bindable "earn up to {N} Points with {VIP program}" + free-samples reassurance row (a small component, not a hardcoded string).
- **`product_carousel` tabbed variant** — NEW / BEST SELLERS / GIFT & SETS tabs that reslice the row in place (reuse from the bold-athletic study's ranked/tab work).
- **`offer_hero` gift-with-purchase / promo variant** — a promo band with a threshold headline, product-splash still, CTA, and a "choose shade at checkout" roundel + fine-print slot; must also be embeddable as an **in-grid promo tile** inside a `products` grid and inline in the PDP buy-box.
- **`review_summary` beauty variant** — a rating **histogram** ("Based on N reviews"), **REVIEWS / QUESTIONS** tabs, FILTERS + WRITE A REVIEW, sort, and per-review **verified-buyer/reviewer** label + **helpful ▲/▼ vote** counts.
- **`sparx_gallery` UGC variant** — a creator/community portrait grid with overlaid "JOIN VIPS / AMBASSADORS" CTA pills.
- **Two-row header in the silica frame** — a utility row (quick-links · centered wordmark · country/search/account/wishlist/cart) above a category row whose items open a **mega-flyout** (vertical sub-category list + "TRENDING IN {cat}" product rail + "SHOP ALL {cat}" pill).
