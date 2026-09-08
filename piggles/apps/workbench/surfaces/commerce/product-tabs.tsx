'use client';

// The seven sections of a product: the strip you switch with, and the ONE place
// a panel is built.
//
// ── Why panels are built here and not written out seven times ────────────
//
// They were written out seven times, and six of them were wrong in the same
// way. Silica's `TabsPanel` passes through to Base UI's `Tabs.Panel`, whose
// `keepMounted` defaults to FALSE — an inactive panel is removed from the tree,
// taking the tab body's draft with it. So a shop owner filled in fabric, fit and
// care, clicked Overview to write the description, saved, and came back to three
// empty boxes and "Saved just now" on screen (issue 188).
//
// The flag itself is one word. Building every panel through one function is what
// stops the eighth tab from being added without it, and it is the reason the
// three devices below can work at all:
//
//   • a tab mounts on first visit and STAYS mounted, keeping its draft
//   • `useTabSave` stays registered, so a dirty dot can appear on a tab you are
//     not standing on
//   • `useDirtySource` at the pane level therefore sees every tab, not just the
//     visible one
//
// ── Why PILLS, and why `module` rather than `module-commerce` ────────────
//
// This app is a tabbed dock, so there are two tab strips within ~40px of each
// other and they mean different things: the dock's strip switches DOCUMENTS
// (closeable, draggable, one per surface), this one switches SECTIONS OF ONE
// RECORD. An underline spans and divides a region, which reads as GOVERNING the
// panel — i.e. as a sibling of the dock strip above it. A pill is a closed shape
// sitting INSIDE a region, which is what containment looks like.
//
// `color="module"`, NOT `color="module-commerce"`. Both compile, but `module` is
// the ACTIVE-module bridge: SurfaceMount wraps every pane in `<ModuleScope>`,
// which repoints `--color-module` for that subtree, so `module` resolves to
// whatever module the surface is registered under. Hardcoding commerce orange
// would be outright wrong on the facet panes registered under other modules.

import type { ReactNode } from 'react';
import { TabsList, TabsPanel, TabsTab } from '@wizeworks/silicaui-react';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { TabValueProvider } from './product-tab-save';
import { ProductOverviewTab } from './product-overview';
import { ProductOptionsTab } from './product-options';
import { ProductVariantsTab } from './product-variants';
import { ProductMediaTab } from './product-media';
import { ProductPricingTab } from './product-pricing';
import { ProductAttributesTab } from './product-attributes';
import { ProductSeoTab } from './product-seo';
import type { Product } from './products-data';

/**
 * The seven tabs, in order — declared as data so the ORDER is visible in one
 * place and adding one is a single entry.
 *
 * Options and Variants are deliberately separate. Options are the AXES the
 * product is sold along, and editing them is a schema-shaped act with a blast
 * radius: adding a value multiplies the grid, removing one destroys the SKUs
 * sitting on it. Variants are routine price and code entry. Putting a
 * destructive structural edit on the same surface as everyday data entry is how
 * someone rebuilds a lattice while meaning to change a price.
 */
export const PRODUCT_TABS: { value: string; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'options', label: 'Options' },
  { value: 'variants', label: 'Variants' },
  { value: 'media', label: 'Media' },
  { value: 'attributes', label: 'Details' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'seo', label: 'SEO' },
];

/**
 * One tab's panel. Mounts on first visit and stays mounted for the life of the
 * pane, so an edited-then-left tab keeps its draft and its dirty dot.
 *
 * `before` renders above the body and OUTSIDE the save scope — the status alert
 * on Overview belongs to the pane, not to the form.
 */
function ProductTabPanel({
  value,
  visited,
  className,
  before,
  children,
}: {
  value: string;
  visited: ReadonlySet<string>;
  className?: string;
  before?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TabsPanel value={value} keepMounted className={className}>
      {visited.has(value) ? (
        <>
          {before}
          <TabValueProvider value={value}>{children}</TabValueProvider>
        </>
      ) : null}
    </TabsPanel>
  );
}

/**
 * All seven panels. `statusAlert` renders above the Overview body and outside
 * its save scope — it belongs to the pane, not to the form.
 */
export function ProductTabPanels({
  ctx,
  product,
  visited,
  statusAlert,
}: {
  ctx: SurfaceContext;
  product: Product;
  visited: ReadonlySet<string>;
  statusAlert: ReactNode;
}) {
  return (
    <>
      <ProductTabPanel
        value="overview"
        visited={visited}
        className="flex flex-col gap-4"
        before={statusAlert}
      >
        <ProductOverviewTab ctx={ctx} product={product} />
      </ProductTabPanel>

      <ProductTabPanel value="options" visited={visited}>
        <ProductOptionsTab ctx={ctx} product={product} />
      </ProductTabPanel>

      <ProductTabPanel value="variants" visited={visited}>
        <ProductVariantsTab ctx={ctx} product={product} />
      </ProductTabPanel>

      <ProductTabPanel value="media" visited={visited}>
        <ProductMediaTab ctx={ctx} product={product} />
      </ProductTabPanel>

      <ProductTabPanel value="attributes" visited={visited}>
        <ProductAttributesTab ctx={ctx} product={product} />
      </ProductTabPanel>

      <ProductTabPanel value="pricing" visited={visited}>
        <ProductPricingTab ctx={ctx} product={product} />
      </ProductTabPanel>

      <ProductTabPanel value="seo" visited={visited}>
        <ProductSeoTab ctx={ctx} product={product} />
      </ProductTabPanel>
    </>
  );
}

/**
 * The strip itself. `dirtyTabs` is what makes a toolbar Save honest: Save
 * commits the tab you are standing on, so something has to say "Pricing still
 * has unsaved work" while you are on Media.
 */
export function ProductTabStrip({
  activeTab,
  dirtyTabs,
}: {
  activeTab: string;
  dirtyTabs: ReadonlySet<string>;
}) {
  return (
    // `bg-base-300`, deliberately NOT base-100. The toolbar directly above is
    // base-100, so a base-100 strip made the two read as one continuous slab
    // with no edge between them. We separate surfaces with edges and base-tone
    // shifts rather than shadows, and this is that shift.
    //
    // `rounded-full` so the strip reads as a TRACK the pills sit inside. NOT
    // `card`: `card` also sets `flex-direction: column`, which silently stacked
    // all seven tabs into a full-width vertical column.
    //
    // SCROLL-REGION INSET — the reason the capsule and the scrolling are split
    // across two elements. Padding on the scrolling element does NOT keep pills
    // off the curve: that padding lives inside the scrollable content box and
    // scrolls away with it, so below ~620px pane width the leading pill reached
    // past the edge and its rounded cap flattened against the capsule curve. So
    // the capsule sits on a NON-scrolling wrapper and only the inner region
    // scrolls. Do not merge these back into one element.
    <div className="bg-base-300 shrink-0 rounded-full px-4 py-2">
      <TabsList scrollable>
        {PRODUCT_TABS.map((entry) => (
          // `text-base-content` is not decoration, it is a correction:
          // silica's `.tabs-tab` ships its resting ink at 65% alpha, which is
          // a faded token on text a person is meant to READ. Tab labels are
          // navigation — they have to be legible before you click them. The
          // selected tab is already distinguished by a filled pill.
          <TabsTab key={entry.value} value={entry.value} className="flex items-center gap-1.5">
            {entry.label}
            {dirtyTabs.has(entry.value) ? (
              <>
                <span
                  // The selected pill is already a solid module fill, so a
                  // `bg-module` dot would vanish into it. On the selected pill
                  // the dot wears the pill's own ink; everywhere else it wears
                  // the module hue against the plain strip.
                  className={
                    entry.value === activeTab
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
  );
}
