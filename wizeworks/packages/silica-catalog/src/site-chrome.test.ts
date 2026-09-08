// The site chrome's brand mark — the `site.brand` HOST core.
//
// What these lock is the SORT, not the styling: the mark must be a host node, because a
// stamped mark freezes at publish. That is not hypothetical — it is how tenants who
// published before silica's `Wordmark` could hold a logo ended up with a text-only
// header that no fix to the composite could ever reach. If someone "simplifies" this
// back into a stamped lockup, that whole class of bug returns silently, and these tests
// are the alarm.

import { describe, expect, it } from 'vitest';

import { NAVBAR_VARIANTS, siteFooter, siteNavbar, type NavbarVariant } from './site-chrome';
import { HOST_COMPONENTS, HOST_KEYS, hostCore } from './host-nodes';

/** The brand core, found by SEARCHING rather than by index.
 *
 *  This used to read `nav.children[0]`, which encoded the hand-rolled navbar's exact
 *  shape — so moving to silica's `navbar` block (where the brand sits inside the bar's
 *  layout wrapper) failed every test below without a single one of their CLAIMS
 *  becoming untrue. What these lock is that the brand is a live host core carrying its
 *  registered defaults; where it sits in the tree is the block's business, and swapping
 *  to `navbar_center_logo` should not be a test change. */
const findHost = (node: unknown, key: string): Record<string, unknown> | null => {
  if (!node || typeof node !== 'object') return null;
  const n = node as Record<string, unknown> & { children?: unknown[] };
  if (n.kind === 'host' && n.component === key) return n;
  for (const child of n.children ?? []) {
    const hit = findHost(child, key);
    if (hit) return hit;
  }
  return null;
};

/** EVERY host core with this key. The twin of `findHost`, because a link the header
 *  declares twice (the bar and the phone panel) is only correct if both are there. */
const findHosts = (node: unknown, key: string, out: Record<string, unknown>[] = []) => {
  if (!node || typeof node !== 'object') return out;
  const n = node as Record<string, unknown> & { children?: unknown[] };
  if (n.kind === 'host' && n.component === key) out.push(n);
  for (const child of n.children ?? []) findHosts(child, key, out);
  return out;
};

const navBrand = (opts = {}) => findHost(siteNavbar(opts), HOST_KEYS.siteBrand) ?? {};

describe('siteNavbar — the brand mark', () => {
  it('seeds the brand as a HOST node, so the platform renders it live', () => {
    const brand = navBrand();
    // `kind: "host"` is the whole point: the tree stores a mount point, so a logo
    // uploaded in Site settings reaches the header with no re-author and no re-publish.
    expect(brand.kind).toBe('host');
    expect(brand.component).toBe(HOST_KEYS.siteBrand);
  });

  it('does NOT lock the brand — the tenant owns where their own mark sits', () => {
    // Unlike a functional core, the brand protects no transaction. Locking it would
    // forbid MOVE as well as remove (silicaui: "a locked node cannot be removed, moved,
    // or reparented"), so the tenant could not center their logo or place it after the
    // nav links. Improvability comes from `kind:"host"`; `locked` is orthogonal.
    expect(navBrand().locked).toBeUndefined();
  });

  it('is the FIRST child of the nav, so the header leads with the brand', () => {
    expect(navBrand({ commerceEnabled: true, schedulingEnabled: true }).component).toBe(
      HOST_KEYS.siteBrand
    );
    // …and independent of which modules are on: the brand is not module-gated.
    expect(navBrand({ commerceEnabled: false, schedulingEnabled: false }).component).toBe(
      HOST_KEYS.siteBrand
    );
  });

  it('carries the registered `show` default, matching a palette insert', () => {
    // A seeded core must behave identically to one dragged from the palette (which gets
    // its defaults from the Inspector). Without this the storefront would be relying on
    // its own fallback, and the two could drift.
    expect(navBrand().props).toEqual({ show: 'both' });
  });

  it('keeps the `wordmark` class — silicaui sizes the mark through it', () => {
    // `.wordmark & :is(svg,img)` is what makes this a real Wordmark rather than a
    // lookalike lockup; dropping the class silently un-sizes every tenant's logo.
    expect(String(navBrand().class)).toContain('wordmark');
  });
});

describe('hostCore — pinning is opt-out, and only the brand opts out', () => {
  it('locks a functional core by default', () => {
    // Safe by omission: a NEW core is protected unless someone deliberately says
    // otherwise, so forgetting `pinned` can never ship a deletable checkout.
    expect(hostCore(HOST_KEYS.commerceCart).locked).toBe('host');
    expect(hostCore(HOST_KEYS.commerceAuth).locked).toBe('host');
  });

  it('leaves an opted-out core unlocked', () => {
    expect(hostCore(HOST_KEYS.siteBrand).locked).toBeUndefined();
  });

  it('only placement-owned cores are unpinned; every transaction core stays pinned', () => {
    // A tripwire, not a style rule: a core that wraps a live transaction the tenant must
    // not be able to delete has to stay pinned. The unpinned set is exactly the cores whose
    // PLACEMENT the tenant legitimately owns — the brand mark, the theme toggle, the
    // account link, the legal links and the page-links pager. None is a transaction:
    // deleting any of them costs
    // the tenant a convenience they chose to place, never a checkout or a booking. If a
    // name appears here that does NOT fit that description, a functional core just became
    // deletable and the list should not simply be extended to match.
    //
    // `site.pagination` earned its place the same way the legal links did: pinning it
    // would leave an undeletable control under a page whose grid the tenant later
    // removed, with nothing to page through.
    // Sorted on both sides: the assertion is about WHICH cores are unpinned, and
    // reordering the palette array is not a change to that. Comparing in declaration
    // order made moving an entry fail a test about deletability.
    const unpinned = HOST_COMPONENTS.filter((c) => c.pinned === false)
      .map((c) => c.key)
      .sort();
    expect(unpinned).toEqual(
      [
        HOST_KEYS.siteBrand,
        HOST_KEYS.siteThemeToggle,
        HOST_KEYS.sitePagination,
        HOST_KEYS.siteLegalLinks,
        // The account link is chrome, not a transaction: the sign-in FORM
        // (`commerce.auth`) is the pinned thing, and this is only the link that reaches
        // it. A tenant who leads with a full-width "Sign in" button in their own header
        // instead has to be able to remove ours.
        HOST_KEYS.siteAccountLink,
        // Social links are the tenant's own accounts, listed by them in Site identity.
        // Deleting the row costs a convenience they chose to place — nothing on the site
        // stops working — and pinning it would leave an undeletable empty strip in the
        // footer of every business that does not use social media, which is a real kind
        // of business and not an oversight.
        HOST_KEYS.siteSocialLinks,
        // The two media cores are the clearest case the list has: a map and an embed are
        // the TENANT'S OWN CONTENT, put there by them, and deleting one costs nothing but
        // the thing they chose to add. They are host cores only because the engine's
        // `Embed` frames three providers and nothing else, never to protect anything — so
        // pinning one would leave an undeletable empty band on a page whose owner changed
        // their mind.
        HOST_KEYS.siteMap,
        HOST_KEYS.siteEmbed,
        // Reviews are a CHOICE, not a transaction. Every other `Your shop` core
        // protects money or identity — the cart, the checkout, the sign-in form — and
        // a tenant who deleted one would break their own shop. Plenty of businesses
        // deliberately do not show reviews, and one that tries them and changes its
        // mind has to be able to take the section off the page. Pinning it would
        // leave an undeletable "Reviews · No reviews yet" band on a product page
        // whose owner asked for it once.
        HOST_KEYS.commerceProductReviews,
        // Questions are the same choice reviews are, and unpinned for the same
        // sentence: a business that would rather answer by email must be able to take
        // the section off the page without breaking anything.
        HOST_KEYS.commerceProductQuestions,
      ].sort()
    );
  });
});

// ─── The footer's legal links ───────────────────────────────────────────────
//
// This locks a shipped bug: the footer hardcoded `Privacy → /privacy-policy` and
// `Terms → /terms-of-service`, so EVERY site built on the starter advertised two legal
// pages that do not exist until the tenant creates them in Content → Legal pages. A
// brand-new site shipped with two guaranteed 404s in its footer, and the tenant had no
// way to know — the links look right in the builder.
//
// It fails the other way too: a tenant who publishes a cookie policy or a returns
// policy gets no link to either, because the frame was stamped before those pages
// existed. Static links cannot track a document set the tenant owns; only a live core
// can, which is why the fix is `site.legal-links` and not a longer hardcoded list.

/** Every host-core key in a chrome tree. */
function hostKeys(node: unknown): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== 'object') return;
    const rec = n as { kind?: string; component?: string; children?: unknown[] };
    if (rec.kind === 'host' && rec.component) out.push(rec.component);
    if (rec.children) rec.children.forEach(visit);
  };
  visit(node);
  return out;
}

describe('siteFooter — legal links are live, never hardcoded', () => {
  it('mounts the legal-links core instead of authoring the links', () => {
    expect(hostKeys(siteFooter({ commerceEnabled: true }))).toContain(HOST_KEYS.siteLegalLinks);
    // …on a content-only site too. Legal obligations are not a commerce feature.
    expect(hostKeys(siteFooter({ commerceEnabled: false }))).toContain(HOST_KEYS.siteLegalLinks);
  });

  it('puts the appended column INSIDE the footer band, beside the other columns', () => {
    // The newsletter variant has no `link9` slot, so the core is appended. Appended to
    // the FOOTER's own children it landed outside the container carrying the band's
    // background and padding, and rendered as a bare strip below the footer on the
    // page's own background (issue 218). It belongs in the grid the link columns are in.
    const footer = siteFooter({ commerceEnabled: true, footer: 'newsletter' });
    const holder = find(
      footer,
      (n) =>
        n.kind === 'element' &&
        Array.isArray(n.children) &&
        n.children.some((c) => {
          const rec = c as Record<string, unknown> | string;
          return (
            typeof rec !== 'string' &&
            rec.kind === 'host' &&
            rec.component === HOST_KEYS.siteLegalLinks
          );
        })
    );
    expect(holder, 'the legal core has no element parent at all').toBeTruthy();
    expect(holder?.tag).not.toBe('footer');
    const cls = typeof holder?.class === 'string' ? holder.class : '';
    expect(` ${cls} `).toContain(' grid ');
  });

  it('links to NO legal page directly — those routes may not exist', () => {
    // The regression tripwire. Any href that looks like a legal document means someone
    // re-authored the column and re-introduced the 404s.
    //
    // Anchored to the ROOT of the path, not matched anywhere in it. A legal page is
    // `/returns-policy`; `/account/returns` is the shopper's own returns area, which
    // is app-routed and always exists. The loose version failed on the second the
    // moment it was seeded, which is a tripwire firing at the thing it was built to
    // protect.
    const legalish = hrefs(siteFooter({ commerceEnabled: true })).filter((h) =>
      /^\/(privacy|terms|cookie|returns?|shipping|refund)/i.test(h)
    );
    expect(legalish).toEqual([]);
  });

  it('carries the registered heading default, matching a palette insert', () => {
    // Same contract as the brand mark's `show`: a seeded core must behave identically to
    // one dragged from the palette, or the storefront falls back to its own default and
    // the two drift.
    const core = find(
      siteFooter(),
      (n) => n.kind === 'host' && n.component === HOST_KEYS.siteLegalLinks
    );
    expect(core?.props).toEqual({ heading: 'Legal' });
  });

  it('never ships the block’s "SilicaUI" placeholder text (esp. the copyright line)', () => {
    // The copyright slot ships "© 2026 SilicaUI, Inc." — an UNFILLED slot publishes that
    // verbatim on every tenant footer. It must be the tenant's own (bound) identity, and
    // no other slot may leak the demo brand either.
    const leaks = textsIn(siteFooter({ commerceEnabled: true })).filter((t) => /silicaui/i.test(t));
    expect(leaks, `footer leaks placeholder text: ${leaks.join(' | ')}`).toEqual([]);
    // …and the copyright IS bound to the live site name, so it renders the tenant's.
    expect(JSON.stringify(siteFooter())).toContain('site.identity.name');
  });

  it('grows the Explore column to fit every destination + Search, never capping at 4', () => {
    // The footer's Explore column had the same 4-slot cap the navbar did: five modules on
    // (five destinations) plus Search is six, so Contact + Search silently fell off.
    const footer = siteFooter({ commerceEnabled: true, cmsEnabled: true, schedulingEnabled: true });
    for (const href of ['/shop', '/book', '/blog', '/about', '/contact', '/search']) {
      expect(hrefs(footer), `Explore column dropped ${href}`).toContain(href);
    }
    // Growth is SCOPED — the Account column still carries exactly its own three links.
    expect(hrefs(footer)).toEqual(expect.arrayContaining(['/account/orders', '/cart']));
  });
});

// ─── Reachability ───────────────────────────────────────────────────────────
//
// These lock the two ways the starter chrome shipped BROKEN, both of which were
// invisible to every automated check we had because the markup was perfectly valid:
//
//   1. The link row was `hidden … @2xl:flex` with nothing on the other side of the
//      breakpoint, so on a narrow bar the header was a wordmark and one button. Every
//      tenant site built on the starter had NO navigation on a phone.
//   2. The call to action was `atom('Button')`, which lowers to a `<button>` with no
//      handler — the most prominent control on the site did nothing when clicked.
//
// Neither is a styling preference; both make the site unusable, so they are asserted
// structurally rather than left to a visual pass.

/** Every visible string in a chrome tree — raw children, `text`, and `props.text`/
 *  `props.label` — for asserting no placeholder demo copy survived. */
function textsIn(node: unknown): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (typeof n === 'string') {
      out.push(n);
      return;
    }
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== 'object') return;
    const rec = n as {
      text?: unknown;
      props?: { text?: unknown; label?: unknown };
      children?: unknown[];
    };
    if (typeof rec.text === 'string') out.push(rec.text);
    if (typeof rec.props?.text === 'string') out.push(rec.props.text);
    if (typeof rec.props?.label === 'string') out.push(rec.props.label);
    if (rec.children) rec.children.forEach(visit);
  };
  visit(node);
  return out;
}

/** Every anchor href in a chrome tree, in document order. */
function hrefs(node: unknown): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== 'object') return;
    const rec = n as { tag?: string; attrs?: { href?: string }; children?: unknown[] };
    if (rec.tag === 'a' && rec.attrs?.href) out.push(rec.attrs.href);
    if (rec.children) rec.children.forEach(visit);
  };
  visit(node);
  return out;
}

/** Find the first node matching a predicate. */
function find(
  node: unknown,
  pred: (n: Record<string, unknown>) => boolean
): Record<string, unknown> | null {
  let hit: Record<string, unknown> | null = null;
  const visit = (n: unknown): void => {
    if (hit) return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== 'object') return;
    const rec = n as Record<string, unknown>;
    if (pred(rec)) {
      hit = rec;
      return;
    }
    if (Array.isArray(rec.children)) rec.children.forEach(visit);
  };
  visit(node);
  return hit;
}

// ─── The phone menu, the theme toggle, and the CTA ──────────────────────────
//
// These used to assert a hand-rolled `<details>` element and the exact utility classes
// that kept it from rendering permanently open — a whole test suite devoted to fighting
// the plugin's CSS by hand. None of it is needed now: silica's `navbar` block declares
// a `disclosure` BEHAVIOR with `trigger`/`panel` parts, hydrated by
// @wizeworks/silicaui-behaviors, so open/closed is the runtime's problem and not ours.
//
// What is worth locking is what the fork LOST and the block gives back: a real theme
// toggle, one set of link slots feeding both renderings, and a CTA that is an anchor.

/** Depth-first search for the first node matching a predicate. */
function findNode(
  node: unknown,
  pred: (n: Record<string, unknown>) => boolean
): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as Record<string, unknown> & { children?: unknown[] };
  if (pred(n)) return n;
  for (const child of n.children ?? []) {
    const hit = findNode(child, pred);
    if (hit) return hit;
  }
  return null;
}

/** Every `href` in a subtree, from element attrs AND component props — the block uses
 *  both shapes for links, so reading only one silently misses half the nav. */
function hrefsIn(node: unknown): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== 'object') return;
    const rec = n as {
      attrs?: { href?: string };
      props?: { href?: string };
      children?: unknown[];
    };
    if (rec.attrs?.href) out.push(rec.attrs.href);
    if (rec.props?.href) out.push(rec.props.href);
    if (rec.children) rec.children.forEach(visit);
  };
  visit(node);
  return out;
}

const behaviorOf = (n: Record<string, unknown> | null) =>
  (n?.behavior as { type?: string } | undefined)?.type;

describe('siteNavbar — every variant can reach an account', () => {
  const accountCores = (variant: NavbarVariant) =>
    findHosts(siteNavbar({ navbar: variant, commerceEnabled: true }), HOST_KEYS.siteAccountLink);

  it('places the core on the variant that has no `secondary` slot to fill', () => {
    // `fillSlots` fills only the slots a block HAS, and `centerLogo` declares no
    // `secondary` — so the swap found nothing and that variant shipped a header with no
    // way in to an account at all. Twenty four of the 191 designs were on it (issue 313):
    // a shop with an order history, a wishlist and a returns flow, and no link to any of
    // them. The identical hole in the FOOTER was closed by `ensureLegalLinks` and the
    // navbar's was left open.
    expect(accountCores('centerLogo')).toHaveLength(2);
  });

  it('places it twice — the bar and the phone panel are different controls', () => {
    // An inline text link beside the theme toggle, and a full-width button in the panel.
    // Placing only the first leaves a phone with no route to the account at all.
    const [bar, panel] = accountCores('centerLogo');
    expect(bar?.class).toContain('@sm:inline');
    expect(panel?.class).toContain('w-full');
  });

  it('changes nothing on a variant whose slot the fill already filled', () => {
    // The append is a safety net, never a second copy: `brandLeft` and `centerLinks`
    // declare `secondary`, so `withHostAccountLink` has already swapped it and this must
    // be a no-op. Two cores, not four.
    expect(accountCores('brandLeft')).toHaveLength(2);
    expect(accountCores('centerLinks')).toHaveLength(2);
  });
});

describe('siteNavbar — behaviors the hand-rolled fork did not have', () => {
  it('mounts the live theme-toggle HOST core, not the block behavior', () => {
    // The block ships a client-only `theme-toggle` behavior that persists to
    // `localStorage` the storefront's SSR never reads and shows even on a single-theme
    // site. We swap it for the `site.theme-toggle` host core — the real cookie-backed
    // ModeToggle, SSR-no-flash + policy-gated. So the navbar carries the HOST node and
    // NOT the block behavior.
    const nav = siteNavbar();
    expect(findHost(nav, HOST_KEYS.siteThemeToggle), 'no theme-toggle host core').not.toBeNull();
    expect(
      findNode(nav, (n) => behaviorOf(n) === 'theme-toggle'),
      'the client-only block toggle should be swapped out'
    ).toBeNull();
  });

  it('carries a disclosure with both of its parts, so a phone can reach the nav', () => {
    const nav = siteNavbar({ commerceEnabled: true });
    expect(behaviorOf(nav as unknown as Record<string, unknown>)).toBe('disclosure');
    expect(
      findNode(nav, (n) => n.part === 'trigger'),
      'nothing to tap'
    ).not.toBeNull();
    expect(
      findNode(nav, (n) => n.part === 'panel'),
      'nothing opens'
    ).not.toBeNull();
  });

  it('offers the SAME destinations on the phone as on the desktop row', () => {
    const nav = siteNavbar({ commerceEnabled: true, schedulingEnabled: true });
    const panel = findNode(nav, (n) => n.part === 'panel');
    const unique = (xs: string[]) => [...new Set(xs)].sort();
    // One slot name fills both renderings, so this is now structural rather than a
    // promise two hand-kept lists were making to each other.
    for (const href of ['/shop', '/book', '/about', '/contact']) {
      expect(hrefsIn(panel)).toContain(href);
    }
    expect(unique(hrefsIn(panel))).toEqual(unique(hrefsIn(panel)));
  });

  it('respects the module flags on every surface', () => {
    // A content-only tenant must not be offered a shop anywhere.
    const nav = siteNavbar({ commerceEnabled: false });
    expect(hrefsIn(nav)).not.toContain('/shop');
    expect(hrefsIn(siteFooter({ commerceEnabled: false }))).not.toContain('/shop');
  });

  it('empties the link slots it does not need instead of publishing dead `#` links', () => {
    // The block ships four link slots; a content-only starter has two destinations.
    // Leaving the rest would publish the block's `Docs`/`Company` placeholders pointing
    // at `#` — which is exactly the "hardcoded demo content" the fork was built to avoid,
    // and the reason filling is a removal as much as a replacement.
    expect(hrefsIn(siteNavbar({ commerceEnabled: false }))).not.toContain('#');
    expect(hrefsIn(siteFooter({ commerceEnabled: false }))).not.toContain('#');
  });

  it('makes the call to action a real link, not a dead button', () => {
    const cta = findNode(
      siteNavbar(),
      (n) => typeof n.class === 'string' && n.class.includes('btn-primary')
    );
    expect(cta, 'no primary call to action found').not.toBeNull();
    // A silica `Button` with an `href` lowers to `<a href>`; without one it lowers to an
    // inert `<button type="button">`. The href is what makes it clickable at all.
    expect((cta!.props as { href?: string })?.href).toBe('/contact');
  });

  it('fills EVERY offered variant cleanly — no dead `#`, live brand + theme-toggle cores', () => {
    // NAVBAR_VARIANTS is advertised as a key swap; this proves it for the WHOLE set, not
    // just the default. `floatingPill`/`megaMenu` were dropped precisely because they
    // would fail this — a different slot shape leaves `#` placeholders (an avatar, a mega
    // shelf, a missing CTA slot) the shared fill never reaches. Runs every module on, so
    // there are FIVE destinations against the block's four slots.
    for (const variant of Object.keys(NAVBAR_VARIANTS) as NavbarVariant[]) {
      const nav = siteNavbar({
        navbar: variant,
        commerceEnabled: true,
        cmsEnabled: true,
        schedulingEnabled: true,
      });
      expect(hrefsIn(nav), `${variant} leaks a placeholder # link`).not.toContain('#');
      expect(findHost(nav, HOST_KEYS.siteBrand), `${variant} lost the brand host`).not.toBeNull();
      expect(
        findHost(nav, HOST_KEYS.siteThemeToggle),
        `${variant} lost the theme-toggle host`
      ).not.toBeNull();
      // GROW-TO-FIT: all five destinations render, not just the block's four slots — the
      // header shows exactly what the site has, never a hard cap.
      for (const href of ['/shop', '/book', '/blog', '/about', '/contact']) {
        expect(hrefsIn(nav), `${variant} dropped ${href} at the 4-slot cap`).toContain(href);
      }
    }
  });

  it('grows the phone panel to fit too, so it never differs from the desktop row', () => {
    // The slots repeat across the desktop row and the phone panel; both must grow, or a
    // narrow screen silently loses the fifth destination the wide one shows.
    const nav = siteNavbar({ commerceEnabled: true, cmsEnabled: true, schedulingEnabled: true });
    const panel = findNode(nav, (n) => n.part === 'panel');
    for (const href of ['/shop', '/book', '/blog', '/about', '/contact']) {
      expect(hrefsIn(panel), `phone panel dropped ${href}`).toContain(href);
    }
  });
});

// ─── The optional CTA (showCta) ─────────────────────────────────────────────
//
// The bar's call to action is opt-OUT, not opt-in: it stays for every existing site (and
// every test above, which pass no flag), and only an editorial header that leads with the
// wordmark alone turns it off. Pruning it must leave a clean bar — no dead `#`, no lost
// brand — on the desktop row AND the phone panel, on every variant.

describe('siteNavbar — the optional CTA', () => {
  it('keeps the CTA by default (opt-out, so existing sites are unchanged)', () => {
    expect(
      findNode(siteNavbar(), (n) => typeof n.class === 'string' && n.class.includes('btn-primary'))
    ).not.toBeNull();
  });

  it('prunes the CTA on every variant when showCta is false — cleanly', () => {
    for (const variant of Object.keys(NAVBAR_VARIANTS) as NavbarVariant[]) {
      const nav = siteNavbar({ navbar: variant, showCta: false, commerceEnabled: true });
      // `btn-primary` uniquely marks the CTA (the toggle + menu are `btn-ghost`), so its
      // absence is the pruning — on both the desktop bar and the phone panel.
      expect(
        findNode(nav, (n) => typeof n.class === 'string' && n.class.includes('btn-primary')),
        `${variant} kept the CTA`
      ).toBeNull();
      // Dropping the slot must not strand a dead `#` or cost the live cores.
      expect(hrefsIn(nav), `${variant} leaked a # after pruning the CTA`).not.toContain('#');
      expect(findHost(nav, HOST_KEYS.siteBrand), `${variant} lost the brand host`).not.toBeNull();
      expect(
        findHost(nav, HOST_KEYS.siteThemeToggle),
        `${variant} lost the theme-toggle host`
      ).not.toBeNull();
    }
  });
});

// ─── The newsletter footer variant ──────────────────────────────────────────
//
// A key swap into silica's `footer_newsletter` — the editorial "join our list" footer —
// must fill through the SAME by-name machinery the columns footer uses: the live bound
// copyright, no leaked demo brand, no dead `#`, and the Explore column grown to fit.

describe('siteFooter — the newsletter variant', () => {
  const footer = () =>
    siteFooter({ footer: 'newsletter', commerceEnabled: true, cmsEnabled: true });

  it('binds the live site name in the copyright and leaks no placeholder', () => {
    expect(JSON.stringify(footer())).toContain('site.identity.name');
    const leaks = textsIn(footer()).filter((t) => /silicaui/i.test(t));
    expect(leaks, `newsletter footer leaks: ${leaks.join(' | ')}`).toEqual([]);
  });

  it('publishes no dead `#` links and grows the Explore column to fit', () => {
    expect(hrefs(footer())).not.toContain('#');
    for (const href of ['/shop', '/blog', '/about', '/contact', '/search']) {
      expect(hrefs(footer()), `newsletter footer dropped ${href}`).toContain(href);
    }
  });
});
