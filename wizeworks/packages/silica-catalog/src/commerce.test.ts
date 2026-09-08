// Locks the commerce composites against the REAL silica engine: the data-binding
// structure (a `commerce.product` collection scope repeating scope-relative cards),
// the image-fill contract (a scalar `image` ref → `<img src>`), and the price/text
// binds — driven through `resolveTree` + `toHtml` so a mis-authored ref or class
// fails here, not in a live storefront.

import { describe, expect, it } from 'vitest';
import { resolveTree, toHtml, type DataScope, type ResolveHost } from '@wizeworks/silicaui-html';

import {
  buyBox,
  collectionDetailPage,
  collectionHeader,
  featuredCarousel,
  featuredProducts,
  productCard,
  productDetailPage,
  relatedCarousel,
  productGrid,
  productsBlock,
} from './commerce';
import { COMMERCE_CATALOG } from './catalog';
import { HOST_KEYS } from './host-nodes';
import { renderSilicaBody } from './render';

/** The first host node in a tree carrying `component`. Used to assert not just that a
 *  core is present but HOW it was stamped — a pinned core and an unpinned one look
 *  identical in the rendered HTML and differ only in `locked`. */
function findHost(
  node: unknown,
  component: string
): { component?: string; locked?: string } | undefined {
  const n = node as { kind?: string; component?: string; locked?: string; children?: unknown[] };
  if (!n || typeof n !== 'object') return undefined;
  if (n.kind === 'host' && n.component === component) return n;
  for (const child of n.children ?? []) {
    const hit = findHost(child, component);
    if (hit) return hit;
  }
  return undefined;
}

// A trivial host mirroring what @wizeworks/builder-schemas' resolver does — short refs
// off the scoped item, `commerce.product`/`product` off fixed data — inline so this
// package carries no cross-dependency.
const PRODUCTS = [
  { image: '/aurora.png', title: 'Aurora Lamp', price: 149, url: '/products/aurora-lamp' },
  { image: '/dune.png', title: 'Dune Chair', price: 320, url: '/products/dune-chair' },
];
const PRODUCT = {
  image: '/solo.png',
  title: 'Solo Desk',
  price: 210,
  description: 'A tidy desk.',
  // The paragraph shape the storefront record carries (issue 191); the flat string
  // stays because the cards still bind it.
  descriptionParagraphs: [{ text: 'A tidy desk.' }],
  variantId: 'var_solo_default',
  // One version, so the buy box keeps its hidden field rather than a picker.
  versions: [],
};
// A collection carrying its OWN products (the shape the storefront injects) — its
// `products` is a scope-relative field, resolved off the in-scope collection item.
const COLLECTION = {
  name: 'Lighting',
  description: 'Warm, sculptural light.',
  products: PRODUCTS,
};

// What the REAL resolver publishes on its data root, so a `value` ref naming a source
// resolves through `resolveBinding` and not only through `resolveCollection`. This
// double implemented the scoped-item half only, which made it lie about a contract
// `conditional.ts` documents and the storefront depends on ("a host that publishes its
// collections on the resolver root answers both"). A curated section hangs its heading
// off exactly that, so without this the double reported the heading as missing on a
// host where it is present.
const ROOT_SOURCES: Record<string, unknown[]> = {
  'commerce.product': PRODUCTS,
  'commerce.featured': PRODUCTS,
  // The composed PDP body's cross-sell rail binds RELATED, not featured (issue 412).
  'commerce.related': PRODUCTS,
};

const host: ResolveHost = {
  resolveBinding(ref: string, scope: DataScope) {
    const item = scope.item as Record<string, unknown> | undefined;
    if (item && ref in item) return { value: item[ref] };
    // A root path — the shape `resolvePathEx` answers in builder-schemas.
    if (ref in ROOT_SOURCES) return { value: ROOT_SOURCES[ref] };
    return { value: item?.[ref] };
  },
  resolveCollection(ref: string, scope: DataScope) {
    if (ref === 'commerce.product') return PRODUCTS;
    if (ref === 'commerce.featured') return PRODUCTS; // bounded rail — host fills a slice
    if (ref === 'commerce.related') return PRODUCTS; // the PDP's cross-sell, same shape
    if (ref === 'product') return [PRODUCT]; // object source → collection-of-one
    if (ref === 'collection') return [COLLECTION];
    // ANY array field on the in-scope item, which is what the real resolver does
    // (`resolveScoped` reads the item first and the root second, for collections and
    // scalars alike). It was a hardcoded `products` and then `[]` for everything else,
    // so `descriptionParagraphs` and `versions` — both record fields the buy box
    // repeats — came back EMPTY from the double and present from production.
    const fromItem = (scope.item as Record<string, unknown> | undefined)?.[ref];
    if (Array.isArray(fromItem)) return fromItem as readonly unknown[];
    return [];
  },
};

/** Every `value` ref carried anywhere in a subtree, in document order. */
function valueRefs(node: unknown, out: string[] = []): string[] {
  const n = node as { data?: { kind?: string; ref?: string }; children?: unknown[] };
  if (n?.data?.kind === 'value' && n.data.ref) out.push(n.data.ref);
  for (const c of n?.children ?? []) if (c && typeof c === 'object') valueRefs(c, out);
  return out;
}
/** The first descendant carrying a `collection` binding. */
function collectionRef(node: unknown): string | undefined {
  const n = node as { data?: { kind?: string; ref?: string }; children?: unknown[] };
  if (n?.data?.kind === 'collection') return n.data.ref;
  for (const c of n?.children ?? []) {
    if (c && typeof c === 'object') {
      const found = collectionRef(c);
      if (found) return found;
    }
  }
  return undefined;
}

describe('product_grid — data-bound product collection', () => {
  it('binds the grid as a collection over commerce.product', () => {
    expect(collectionRef(productGrid())).toBe('commerce.product');
  });

  it('the card binds scope-relative SHORT refs (image, title, price)', () => {
    const refs = valueRefs(productCard());
    expect(refs).toEqual(expect.arrayContaining(['image', 'title', 'price']));
    // never a dotted root path — these resolve against the product in scope
    expect(refs.every((r) => !r.includes('.'))).toBe(true);
  });

  it('resolves + renders one card per product through the real engine', () => {
    const html = toHtml(resolveTree(productGrid(), host));
    expect(html).toContain('Aurora Lamp');
    expect(html).toContain('Dune Chair');
    expect((html.match(/Lamp|Chair/g) ?? []).length).toBe(2);
  });

  it('fills the scalar image ref into an <img src> (not text)', () => {
    const html = toHtml(resolveTree(productGrid(), host));
    expect(html).toContain('src="/aurora.png"');
    expect(html).toContain('src="/dune.png"');
  });

  it('binds the raw price number (the host formats it, not the tree)', () => {
    const html = toHtml(resolveTree(productGrid(), host));
    expect(html).toContain('149');
    expect(html).toContain('320');
  });

  // A grid whose cards navigate nowhere is not a storefront. The card IS the
  // link: an <a> whose href is bound per-item through the attr-binding bridge.
  // Rendered via `renderSilicaBody` because that is the seam that hoists.
  it('renders each card as a link to ITS OWN product', () => {
    const html = renderSilicaBody(productGrid(), { host });
    expect(html).toContain('href="/products/aurora-lamp"');
    expect(html).toContain('href="/products/dune-chair"');
    expect(html).not.toContain('<input'); // the carrier never ships
  });
});

describe('featured_products — horizontal rail', () => {
  it('repeats the BOUNDED commerce.featured source (not the whole catalog) in a scroll row', () => {
    expect(collectionRef(featuredProducts())).toBe('commerce.featured');
    const html = toHtml(resolveTree(featuredProducts(), host));
    expect(html).toContain('overflow-x-auto');
    expect((html.match(/Lamp|Chair/g) ?? []).length).toBe(2);
  });
});

describe('products — the one configurable block', () => {
  it('defaults to a grid over the whole catalog', () => {
    const block = productsBlock();
    expect(collectionRef(block)).toBe('commerce.product');
    expect(toHtml(resolveTree(block, host))).toContain('grid-cols-2');
  });

  it('binds the chosen source and lays out as a rail', () => {
    const block = productsBlock({ source: 'commerce.featured', layout: 'rail', heading: 'Picks' });
    expect(collectionRef(block)).toBe('commerce.featured');
    const html = toHtml(resolveTree(block, host));
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('Picks');
  });

  it('accepts a parameterized category source', () => {
    expect(collectionRef(productsBlock({ source: 'commerce.category.studio-goods' }))).toBe(
      'commerce.category.studio-goods'
    );
  });

  it('presets (productGrid / featuredProducts) are just this block', () => {
    expect(collectionRef(productGrid())).toBe('commerce.product');
    expect(collectionRef(featuredProducts())).toBe('commerce.featured');
  });

  it('puts page links under a whole-catalog GRID, and never under a rail', () => {
    // The catalog grid is the one that runs out of room — it shows 24 and the shop has
    // more. A rail is a curation ("Featured", "New in"), and a Next button under a
    // curated strip is a curation that forgot it was one.
    const grid = toHtml(resolveTree(productGrid(), host));
    expect(grid).toContain(`data-sui-host="${HOST_KEYS.sitePagination}"`);

    const rail = toHtml(resolveTree(featuredProducts(), host));
    expect(rail).not.toContain(HOST_KEYS.sitePagination);

    // Nor under a category grid: those are a chosen slice, not the catalog.
    const category = toHtml(
      resolveTree(productsBlock({ source: 'commerce.category.studio-goods' }), host)
    );
    expect(category).not.toContain(HOST_KEYS.sitePagination);
  });

  it('leaves the pager UNLOCKED, so a tenant who wants no pager can delete it', () => {
    // Every other seeded core is `locked: "host"` because removing it would break a
    // transaction. This one is a convenience under a grid the tenant may later remove.
    const pager = findHost(productGrid(), HOST_KEYS.sitePagination);
    expect(pager).toBeTruthy();
    expect(pager?.locked).toBeUndefined();
  });
});

describe('buy_box — self-scoping product detail', () => {
  it('scopes itself to the product object source (collection-of-one)', () => {
    expect(collectionRef(buyBox())).toBe('product');
  });

  it('renders the pinned product once, with an inert add-to-cart action', () => {
    const tree = buyBox();
    // the action marker survives resolution (the engine never touches action nodes)
    const html = toHtml(resolveTree(tree, host));
    expect(html).toContain('Solo Desk');
    expect(html).toContain('A tidy desk.');
    expect(html).toContain('data-sui-action');
    expect(html).toContain('Add to cart');
    expect((html.match(/Solo Desk/g) ?? []).length).toBe(1);
  });

  // Her words, in the shape she typed them (issue 191). A bind writes ONE text node,
  // and `white-space: normal` collapses the blank lines an owner left between
  // paragraphs — six paragraphs about a garment reached the page as one block.
  it('renders one paragraph per block of the description', () => {
    const WRITTEN = {
      ...PRODUCT,
      descriptionParagraphs: [{ text: 'A tidy desk.' }, { text: 'Oak, oiled by hand.' }],
    };
    const wrote: ResolveHost = {
      ...host,
      resolveCollection: (ref, scope) =>
        ref === 'product' ? [WRITTEN] : (host.resolveCollection?.(ref, scope) ?? []),
    };
    const html = toHtml(resolveTree(buyBox(), wrote));
    expect(html).toContain('<p>A tidy desk.</p>');
    expect(html).toContain('<p>Oak, oiled by hand.</p>');
  });

  it('says nothing at all for a product with no description', () => {
    // The template's own placeholder must never reach a shopper as a fact (issue 092).
    const SILENT = { ...PRODUCT, description: '', descriptionParagraphs: [] };
    const silent: ResolveHost = {
      ...host,
      resolveCollection: (ref, scope) =>
        ref === 'product' ? [SILENT] : (host.resolveCollection?.(ref, scope) ?? []),
    };
    const html = toHtml(resolveTree(buyBox(), silent));
    expect(html).not.toContain('Product description.');
    expect(html).not.toContain('<p></p>');
  });

  // The add-to-cart contract, end to end through the real engine. Every one of
  // these was silently broken before silicaui 0.12: `fillValue` wrote a bound
  // value into an element's CHILDREN, and `input` is a void element, so `toHtml`
  // dropped it and the form submitted no variant at all.
  it("resolves the variant id into the hidden input's value attribute", () => {
    const html = toHtml(resolveTree(buyBox(), host));
    expect(html).toContain('name="variantId"');
    expect(html).toContain('value="var_solo_default"');
    // …and as an ATTRIBUTE, never as text content the browser would ignore.
    expect(html).not.toContain('>var_solo_default<');
  });

  // WHICH ONE a shopper is buying (issue 190). The buy box shipped with a hidden
  // `variantId` fixed to the default version and no control anywhere, so on a garment
  // in five sizes and three colors every shopper bought the same one — silently, with
  // nothing on the page even hinting there was a choice.
  describe('the version picker', () => {
    const SIZED = {
      ...PRODUCT,
      // `soldOut` on EVERY version, false included: an absent ref is UNKNOWN to the
      // engine, which keeps the node and stops resolving what is inside it.
      versions: [
        { id: 'var_s', label: 'S · Clay', soldOut: false },
        { id: 'var_m', label: 'M · Clay', soldOut: false },
        { id: 'var_l', label: 'L · Clay', soldOut: false },
      ],
    };
    const sized: ResolveHost = {
      ...host,
      resolveCollection: (ref, scope) =>
        ref === 'product' ? [SIZED] : (host.resolveCollection?.(ref, scope) ?? []),
    };

    it('renders one radio per version, each carrying its own variant id', () => {
      const html = toHtml(resolveTree(buyBox(), sized));
      expect(html).toContain('Choose yours');
      expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
      for (const version of SIZED.versions) {
        expect(html).toContain(`value="${version.id}"`);
        expect(html).toContain(version.label);
      }
    });

    it('drops the hidden field when there is a picker, so only ONE variantId posts', () => {
      const html = toHtml(resolveTree(buyBox(), sized));
      expect(html).not.toContain('type="hidden"');
      expect((html.match(/name="variantId"/g) ?? []).length).toBe(3);
    });

    it('requires a choice rather than defaulting to whichever came first', () => {
      // Without `required` the browser posts nothing for an untouched radio group and
      // the shopper is back to buying a version they never picked.
      const html = toHtml(resolveTree(buyBox(), sized));
      expect(html).toMatch(/type="radio"[^>]*required/);
    });

    it('keeps the hidden field, and shows no picker, for a single-version product', () => {
      const html = toHtml(resolveTree(buyBox(), host));
      expect(html).not.toContain('Choose yours');
      expect(html).not.toContain('type="radio"');
      expect(html).toContain('value="var_solo_default"');
    });

    // A size that is gone has to be UNPICKABLE, not merely annotated (issue 214). It
    // said "sold out" in its own label and was selectable anyway, so the only way to
    // learn was to press Add to cart and be refused under the button.
    describe('a version that is sold out', () => {
      const GONE = {
        ...PRODUCT,
        versions: [
          { id: 'var_s', label: 'S · Clay', soldOut: false },
          { id: 'var_m', label: 'M · Clay', soldOut: false },
          { id: 'var_l', label: 'L · Clay, sold out', soldOut: true },
        ],
      };
      const gone: ResolveHost = {
        ...host,
        resolveCollection: (ref, scope) =>
          ref === 'product' ? [GONE] : (host.resolveCollection?.(ref, scope) ?? []),
      };

      it('cannot be chosen', () => {
        const html = toHtml(resolveTree(buyBox(), gone));
        expect(html).toMatch(/type="radio"[^>]*disabled/);
        expect((html.match(/disabled/g) ?? []).length).toBe(1);
      });

      it('still says so in words, so the size reads as gone rather than missing', () => {
        const html = toHtml(resolveTree(buyBox(), gone));
        expect(html).toContain('L · Clay, sold out');
        expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
      });

      it('carries no variant id, so nothing can post it', () => {
        const html = toHtml(resolveTree(buyBox(), gone));
        expect(html).toContain('value="var_s"');
        expect(html).toContain('value="var_m"');
        expect(html).not.toContain('value="var_l"');
      });

      it('does not cost the sizes still for sale their labels', () => {
        // The first cut gated the buyable branch on `soldOut` being ABSENT, which the
        // engine reads as an UNKNOWN ref: it keeps the node and stops resolving the
        // bindings underneath, so all fourteen in-stock sizes drew a bare radio with
        // no words. Every version carries the flag now, false included.
        const html = toHtml(resolveTree(buyBox(), gone));
        expect(html).toContain('S · Clay');
        expect(html).toContain('M · Clay');
        expect(html).not.toContain('data-sui-visible');
      });
    });
  });

  it('marks the form as both a form behavior and the add-to-cart action', () => {
    const html = toHtml(resolveTree(buyBox(), host));
    // `hydrate()` wires the submit handler off data-sui-behavior; the ref that
    // reaches the host's onAction comes off data-sui-action. Both must be on the
    // <form>, or the button is decoration.
    expect(html).toMatch(/<form[^>]*data-sui-behavior="form"/);
    expect(html).toMatch(/<form[^>]*data-sui-action="add-to-cart"/);
    expect(html).toContain('type="submit"');
  });

  it('submits a quantity field defaulting to 1', () => {
    const html = toHtml(resolveTree(buyBox(), host));
    expect(html).toContain('name="quantity"');
    expect(html).toMatch(/name="quantity"[^>]*value="1"/);
    expect(html).toMatch(/name="quantity"[^>]*min="1"/);
  });

  // A typed product's own detail blocks — fabric, fit, care, materials (issue 193).
  // Nothing had ever rendered these against real data, and all three faults showed up
  // the first time somebody put a real garment on a real site.
  describe('the typed detail sections', () => {
    const TYPED = {
      ...PRODUCT,
      attributeSections: [
        { key: 'fabric', label: 'Fabric & construction', value: '11oz cotton canvas.', items: [] },
        { key: 'care', label: 'Care', value: 'Cold wash, line dry.', items: [] },
        {
          key: 'materials',
          label: 'Materials',
          value: '',
          items: [
            { label: 'Cotton', value: '60%' },
            { label: 'Linen', value: '40%' },
          ],
        },
      ],
    };
    const typed: ResolveHost = {
      ...host,
      resolveCollection: (ref, scope) =>
        ref === 'product' ? [TYPED] : (host.resolveCollection?.(ref, scope) ?? []),
    };

    it('prints a scalar detail ONCE, under its heading', () => {
      // It printed twice: the heading, an EMPTY line where the value should have been,
      // then the label and value again as a row. `visibleWhen(bind(div))` threw the
      // bind away (one `data` marker per node), and the `items` repeat rendered its
      // template against an empty list, resolving `label`/`value` off the section.
      const html = toHtml(resolveTree(buyBox(), typed));
      expect((html.match(/Fabric &amp; construction/g) ?? []).length).toBe(1);
      expect((html.match(/11oz cotton canvas\./g) ?? []).length).toBe(1);
      expect(html).toContain(
        '<p class="text-base leading-relaxed text-base-content">11oz cotton canvas.</p>'
      );
    });

    it('keeps each section in its own box, rather than pouring them all into one', () => {
      // A repeat renders its container's CHILDREN once per item INSIDE the container,
      // so making the section box the repeat itself put five sections' worth of
      // headings and values in a single bordered box with no rule between them.
      const html = toHtml(resolveTree(buyBox(), typed));
      expect(
        (html.match(/class="flex flex-col gap-2 border-t border-base-300 pt-4"/g) ?? []).length
      ).toBe(TYPED.attributeSections.length);
    });

    it('renders a repeater detail as one row per material', () => {
      const html = toHtml(resolveTree(buyBox(), typed));
      expect((html.match(/border-b border-base-200 pb-1/g) ?? []).length).toBe(2);
      expect(html).toContain('Cotton');
      expect(html).toContain('60%');
      expect(html).toContain('Linen');
      expect(html).toContain('40%');
    });
  });

  // The sold-out contract. Every one of these was broken in the same way: the buy box
  // never read stock at all, so a bakery whose bread goes by eleven kept an enabled
  // "Add to cart" on every sold-out loaf, the POST came back 409, and silica's form
  // behavior announced the reason into a 1px clipped live region — which is to say, to
  // nobody. The API had the right answer the whole time.
  it('swaps the add-to-cart form for a sold-out notice when the product is sold out', () => {
    const gone: ResolveHost = {
      ...host,
      resolveCollection: (ref) => (ref === 'product' ? [{ ...PRODUCT, soldOut: true }] : []),
    };
    const html = toHtml(resolveTree(buyBox(), gone));
    expect(html).toContain('Sold out');
    expect(html).not.toContain('Add to cart');
    expect(html).not.toContain('name="variantId"');
  });

  it('keeps the form for a product whose stock is simply UNKNOWN', () => {
    // The fixture carries no `soldOut` at all — an older stored record, a theme
    // preview, a tenant with the inventory module off. Absent must not read as sold
    // out: `computeAvailability` treats an uncounted variant as in stock, and a tree
    // that disagreed would hide the buy button on every product nobody has counted.
    const html = toHtml(resolveTree(buyBox(), host));
    expect(html).toContain('Add to cart');
    expect(html).not.toContain('Sold out');
  });

  it('gives the form a VISIBLE status part so a failed add is not silent', () => {
    // Without an authored `data-sui-part="status"`, silica's form behavior builds its
    // own — 1x1px, `clip-path: inset(50%)`. The message exists; nobody sighted sees it.
    const html = toHtml(resolveTree(buyBox(), host));
    expect(html).toMatch(/<p[^>]*data-sui-part="status"/);
    expect(html).toContain('empty:hidden');
    // Empty, not absent: absent falls back to the built-in "Submitted.", which is not
    // a sentence about a basket. The cart drawer is the success signal.
    expect(html).toMatch(/<form[^>]*data-success-message=""/);
  });

  it('resolves an empty value when the product has no live variant', () => {
    // defaultVariantId === null upstream → '' in scope. The markup still renders;
    // refusing the empty add is the storefront onAction handler's job (a hidden
    // input ignores `required`).
    const noVariant: ResolveHost = {
      ...host,
      resolveCollection: (ref) => (ref === 'product' ? [{ ...PRODUCT, variantId: '' }] : []),
    };
    const html = toHtml(resolveTree(buyBox(), noVariant));
    expect(html).toContain('name="variantId"');
    expect(html).toContain('value=""');
  });
});

describe('product_detail_page — the composed PDP body', () => {
  it('renders the buy box for the in-scope product AND the cross-sell rail', () => {
    // The storefront injects the routed product as the `product` object scope and
    // the catalog as `commerce.product`; the page composes both — the interactive
    // buy box (this product) above a rail (the catalog). Through the hoisting seam.
    const html = renderSilicaBody(productDetailPage(), { host });
    // buy box: the pinned product, once, with a live add-to-cart form.
    expect(html).toContain('Solo Desk');
    expect(html).toMatch(/<form[^>]*data-sui-action="add-to-cart"/);
    expect(html).toContain('value="var_solo_default"');
    // rail: the catalog products link to their own PDPs.
    expect(html).toContain('href="/products/aurora-lamp"');
    expect(html).toContain('href="/products/dune-chair"');
    expect(html).not.toContain('<input type="hidden" name="__sui-attr'); // carriers hoisted away
  });
});

describe('collection_detail_page — the pinned collection-detail core', () => {
  it('is an editable shell wrapping the pinned commerce.collection-detail core', () => {
    // The collection detail is now a FUNCTIONAL core (docs/127 §8) — header + a faceted,
    // sorted, paged grid of the collection's members, server-rendered on the storefront by
    // <CollectionDetail>, not a bind-based `products` repeat. The composite lowers to the
    // empty host mount point the storefront walk swaps for the real component, exactly like
    // the category detail (its browse-tree sibling).
    const html = renderSilicaBody(collectionDetailPage(), { host });
    expect(html).toContain('data-sui-host="commerce.collection-detail"');
    // No baked product markup — the core owns the grid, so nothing is stamped here.
    expect(html).not.toContain('Aurora Lamp');
  });
});

describe('collection_header — page header band', () => {
  it('binds title + description scope-relatively', () => {
    const refs = valueRefs(collectionHeader());
    expect(refs).toEqual(['title', 'description']);
  });
});

describe('COMMERCE_CATALOG — the palette group', () => {
  it('is one Products group whose items build fresh, distinct nodes', () => {
    expect(COMMERCE_CATALOG).toHaveLength(1);
    const group = COMMERCE_CATALOG[0]!;
    expect(group.key).toBe('commerce');
    expect(group.items.map((i) => i.key)).toEqual([
      'products',
      'product_carousel',
      'product_card',
      'buy_box',
      'collection_header',
    ]);
    // every factory returns a fresh tree (no shared node identity across inserts)
    const first = group.items[0]!;
    const a = first.make();
    const b = first.make();
    expect(a).not.toBe(b);
    expect(a.kind).toBe('element');
  });
});

describe('featured_carousel — a rail with real controls', () => {
  it('carries silica\u2019s SCROLL-STRIP behavior, not its carousel', () => {
    // A carousel translates a track of FULL-WIDTH slides one at a time — one product
    // per view, whatever the width. On a product page that made the cross-sell card
    // bigger than the product the page exists to sell. A scroll-strip is the behavior
    // whose own description is this job: "every item is meant to be visible at once".
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect(html).toContain('data-sui-behavior="scroll-strip"');
    expect(html).not.toContain('data-sui-behavior="carousel"');
  });

  it('shows the products SIDE BY SIDE at a real card width', () => {
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect(html).toContain('data-sui-part="track"');
    expect(html).toContain('class="scroll-strip-track"');
    // Both cards in ONE row, each a real 16rem card rather than a full-width slide.
    expect((html.match(/w-64 shrink-0/g) ?? []).length).toBe(2);
    // `carousel-item` is what pinned each card to the full strip width.
    expect(html).not.toContain('carousel-item');
  });

  it('centres a strip that fits, without stranding one that does not', () => {
    // `justify-center` on a scroll container puts the leading card behind an edge
    // nobody can scroll back to. Auto margins only distribute POSITIVE free space, so
    // they centre a shop with one featured product and resolve to zero for twelve.
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect(html).toContain('class="flex w-max gap-6 mx-auto"');
    expect(html).not.toContain('justify-center');
  });

  it('ships Previous/Next as labelled controls, not bare arrows', () => {
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect(html).toContain('data-sui-part="prev"');
    expect(html).toContain('data-sui-part="next"');
    expect(html).toContain('aria-label="Previous products"');
    expect(html).toContain('aria-label="Next products"');
  });

  it('lets the COMPONENT decide when the controls are there at all', () => {
    // `scroll-strip-control` is what hides them until the cards overflow and disables
    // each at its end. Without the class they are two buttons that are always present
    // and never dim — which is what a rail of two products used to show.
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect((html.match(/scroll-strip-control/g) ?? []).length).toBe(2);
  });

  it('leaves the controls COLOURLESS — moving a strip sideways means nothing', () => {
    // `btn-neutral` is a grey nobody approved (root RULE #4), on a control that carries
    // no meaning for a colour to hold. A bare `.btn` resolves its ink from `base-content`
    // and is correct in both themes without naming one.
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect(html).toContain('btn btn-circle btn-sm');
    expect(html).not.toContain('btn-neutral');
    expect(html).not.toContain('btn-primary');
  });

  it('stays bound to the BOUNDED source and still links each card to its product', () => {
    expect(collectionRef(featuredCarousel())).toBe('commerce.featured');
    const html = renderSilicaBody(featuredCarousel(), { host });
    expect(html).toContain('href="/products/aurora-lamp"');
    expect(html).toContain('href="/products/dune-chair"');
  });

  it('carries no pager — a carousel already has its own way forward', () => {
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect(html).not.toContain('site.pagination');
  });

  it('cross-sells on a PRODUCT page from RELATED, never from featured', () => {
    // Issue 412. "Featured" is the ones the merchant TAGGED `featured` and nothing else,
    // which is the shop's window display — a home-page idea. On a product page a shopper
    // wants others LIKE THIS ONE, and a shop that has tagged nothing (every new shop) got
    // a rail that correctly hid itself, so the product page shipped with no cross-sell at
    // all and nothing anywhere said a rail had been there.
    expect(collectionRef(relatedCarousel())).toBe('commerce.related');
    expect(toHtml(resolveTree(relatedCarousel(), host))).toContain('You might also like');
    // On the composed page, asserted through the UNRESOLVED tree: `collectionRef` reads
    // the first collection in it, which on a PDP is the buy box's own `product` scope.
    const pdp = toHtml(productDetailPage());
    expect(pdp).toContain('data-sui-repeat="commerce.related"');
    expect(pdp).not.toContain('commerce.featured');
  });
});

describe('an empty curation says nothing at all (issue 187)', () => {
  // Nothing featured, nothing in the catalog — the state a one-product shop is in on
  // its own product page, because a bounded rail excludes the product being looked at.
  const bare: ResolveHost = {
    resolveBinding: () => ({ value: undefined }),
    resolveCollection: () => [],
  };

  it('drops a carousel heading AND its controls rather than apologising under them', () => {
    const html = toHtml(resolveTree(featuredCarousel(), bare));
    expect(html).not.toContain('Featured');
    expect(html).not.toContain('data-sui-part="prev"');
    expect(html).not.toContain('data-sui-part="next"');
    // And it invents no apology: "Nothing in the shop just yet" on a product page whose
    // shop demonstrably has that product in it is a false sentence.
    expect(html).not.toContain('Nothing in the shop just yet');
  });

  it('drops a rail heading the same way', () => {
    const html = toHtml(resolveTree(featuredProducts(), bare));
    expect(html).not.toContain('Featured');
    expect(html).not.toContain('Nothing in the shop just yet');
  });

  it('KEEPS both on the whole-catalog grid, which is a destination and owes an answer', () => {
    const html = toHtml(resolveTree(productGrid(), bare));
    expect(html).toContain('Shop our products');
    expect(html).toContain('Nothing in the shop just yet');
  });

  it('keeps the heading when there ARE products', () => {
    const html = toHtml(resolveTree(featuredCarousel(), host));
    expect(html).toContain('Featured');
    expect(html).toContain('data-sui-part="prev"');
  });
});

describe('every products section is capped to the site content width (issue 187)', () => {
  // The block had no inner container at all, so its heading started at the window edge
  // while the buy box above it started 450px in. One section running full-bleed on a
  // page where every other one is capped does not read as wide, it reads as broken.
  it.each([
    ['grid', productGrid()],
    ['carousel', featuredCarousel()],
    ['rail', featuredProducts()],
  ])('%s', (_label, node) => {
    expect(toHtml(resolveTree(node, host))).toContain('mx-auto w-full max-w-6xl');
  });
});

describe('carousel controls — the empty-button trap', () => {
  // `atom('Button', …)` silently drops `aria-label` (a ComponentNode carries only
  // declared props, and Button declares none), which renders two empty circles: nothing
  // visible, nothing announced. Pinned because it type-checks, lints and looks fine in
  // review — it only fails for the person trying to use the site.
  it('every control has a visible glyph AND an announceable name', () => {
    const html = toHtml(resolveTree(featuredCarousel(), host));
    const buttons = html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toMatch(/aria-label="[^"]+"/);
      expect(b).toContain('<svg');
    }
  });
});
