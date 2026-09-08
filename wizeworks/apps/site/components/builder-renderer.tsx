// Renders a published Builder node tree to production storefront markup
// (docs/44 §2.3, docs/61). Distinct from the dashboard editor canvas only in its
// PER-NODE WRAPPER (no selection chrome, semantic output) and its DATA (real
// records vs the canvas sample): the per-type LEAF render is the ONE shared map in
// `@wizeworks/builder-render` (docs/builder/02), so the canvas and this path can no
// longer drift. Each node's Tailwind-native `class` string is applied verbatim and
// resolves against the compiled per-tenant stylesheet (the same classes the editor
// canvas previews, so preview == production).
//
// This file owns the TREE WALK: binding resolution + cardinality, container
// iteration (an array-bound container repeats its children once per record), the
// Carousel slide build, the Outlet, the ThemeToggle policy gate, and the single
// `<div class={node.class}>` wrapper per node. Leaf content comes from the shared
// `renderLeaf(mode: 'live')`; the interactive islands (BuyBox/Signup/…) it returns
// read their effects from the BuilderRuntime mounted in the storefront layout.

import * as React from 'react';
import {
  bindingIsProductScope,
  cardinalityOf,
  isRawContainerType,
  isRawElementType,
  rawTagOf,
  resolveBinding,
  resolvePath,
  safeElementAttrs,
  type BuilderNode,
  type Cardinality,
  type DataSources,
  type Scope,
} from '@wizeworks/builder-schemas';
import {
  BuilderCarousel,
  NavShell,
  ProductFormProvider,
  ThemeToggle,
  leafWearsClass,
  renderLeaf,
  renderLegacyNavLinks,
  resolveBuilderProduct,
  sxAttrs,
} from '@wizeworks/builder-render';

// ── Class-only rendering (docs/61) ────────────────────────────────────────────
//
// A node's entire styling is its `class` string, compiled per tenant to the
// `--st-*` tokens by @wizeworks/surface-compile. The renderer applies it verbatim —
// no box→CSS engine, no `.bx-*` layout classes, no inline geometry. The ONE inline
// style that remains is a dynamic background image (a per-node / per-record URL
// can't be a static utility class), painted from the node's bg-* props.

/** Join class fragments, dropping falsy ones; undefined when empty. */
function cls(...parts: (string | false | null | undefined)[]): string | undefined {
  const joined = parts.filter(Boolean).join(' ');
  return joined || undefined;
}

// Background-media scrims (docs/45) — a translucent veil layered OVER the photo
// (below content) for text legibility; `gradient` darkens top+bottom.
const SCRIM: Record<string, string | null> = {
  none: null,
  dark: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45))',
  light: 'linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55))',
  gradient:
    'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.04) 28%, rgba(0,0,0,0.04) 62%, rgba(0,0,0,0.6))',
};

/** Nine-point focal point → CSS `background-position`. */
const BG_POSITION_CSS: Record<string, string> = {
  center: 'center',
  top: 'center top',
  bottom: 'center bottom',
  left: 'left center',
  right: 'right center',
  'top-left': 'left top',
  'top-right': 'right top',
  'bottom-left': 'left bottom',
  'bottom-right': 'right bottom',
};

const CONTAINERS = new Set([
  'Section',
  'Grid',
  'Stack',
  'Card',
  'Carousel',
  'ProductForm',
  'NavMenu',
]);

/** The first image of a bound image/images value, or null. */
function firstImage(value: unknown): { url?: string; alt?: string } | null {
  const candidate = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (candidate && typeof candidate === 'object') return candidate;
  return null;
}

/** The inline background-image style for a node, from its `bg-*` props (docs/61):
 *  a static `bgImage` URL or a record image resolved from `bgImageBinding` against
 *  the node's scope (the bound image wins). Undefined when there's no image — the
 *  surface color then comes from the node's `class` (`bg-base-200`, …). */
function backgroundStyleFor(node: BuilderNode, scope: Scope): React.CSSProperties | undefined {
  const p = node.props;
  const staticUrl = typeof p.bgImage === 'string' ? p.bgImage : undefined;
  const bindingPath = typeof p.bgImageBinding === 'string' ? p.bgImageBinding : undefined;
  const boundUrl = bindingPath ? firstImage(resolvePath(scope, bindingPath))?.url : undefined;
  const image = boundUrl ?? staticUrl;
  if (!image) return undefined;
  const overlay = typeof p.bgOverlay === 'string' ? p.bgOverlay : 'none';
  const fit = p.bgFit === 'contain' ? 'contain' : 'cover';
  const position = typeof p.bgPosition === 'string' ? p.bgPosition : 'center';
  const url = `url("${image.replace(/["\\]/g, '')}")`;
  const scrim = SCRIM[overlay];
  return {
    backgroundImage: scrim ? `${scrim}, ${url}` : url,
    backgroundSize: fit,
    backgroundPosition: BG_POSITION_CSS[position] ?? 'center',
    backgroundRepeat: 'no-repeat',
  };
}

// ── Recursive node ───────────────────────────────────────────────────────────

function RenderNode({
  node,
  scope,
  outlet,
}: {
  node: BuilderNode;
  scope: Scope;
  /** The routed page content, rendered where an `Outlet` node sits (site layout
   *  only — undefined when rendering a page tree, which has no Outlet). */
  outlet?: React.ReactNode;
}): React.ReactNode {
  // A raw HTML element (docs/98 Pillar 1) renders AS its tag — a container wraps its
  // walked children in that tag (not the default div), a leaf/void renders through
  // renderLeaf. Either way the tag wears node.class on its own element.
  const rawTag = rawTagOf(node.type);
  const isContainer = CONTAINERS.has(node.type) || isRawContainerType(node.type);
  // docs/61: a presentational leaf carries node.class on its OWN element (its
  // Surface component / the Button recipe) via renderLeaf, so the renderer returns
  // it directly — no wrapper, no double-paint. Every other node gets ONE wrapper
  // div carrying node.class. Exactly one styled element per node. `leafWearsClass`
  // is the SHARED predicate the canvas uses too, so both agree where the class sits.
  const leafStylesByClass =
    !isContainer && (leafWearsClass(node.type) || isRawElementType(node.type));
  const bound = Boolean(node.binding);
  // docs/98 Pillar 7: resolveBinding dispatches on kind — a field path, a pinned
  // entity (`__pins`), a collection source (`__sources`), or an action (no value).
  const value = bound ? resolveBinding(scope, node.binding) : undefined;
  const card: Cardinality = bound ? cardinalityOf(value) : 'empty';
  // A collection source / product pin scopes its subtree to a PRODUCT, so the
  // buy-box context is established (per repeated item below, or once for an object).
  const productScope = bindingIsProductScope(node.binding);
  // The only inline style left: a dynamic background image (a per-node / per-record
  // URL can't be a static class). The surface COLOR comes from node.class.
  const bgStyle = backgroundStyleFor(node, scope);

  let body: React.ReactNode;
  if (node.type === 'Outlet') {
    // The content outlet: render the routed page here (docs/45 §2.6). The routed
    // page owns its own width, so the Outlet's own class is just a full-width slot.
    body = outlet ?? null;
  } else if (node.type === 'Carousel') {
    // Each direct child is a slide. When bound to an array, each record is a slide
    // (its subtree rendered once per item). The client component owns the index
    // state, autoplay, arrows + dots.
    const kids = node.children ?? [];
    let slides: React.ReactNode[];
    if (bound && card === 'array') {
      slides = (value as unknown[]).map((item, i) => {
        const itemKids = kids.map((child) => (
          <RenderNode
            key={child.id}
            node={child}
            scope={{ ...scope, item, index: i }}
            outlet={outlet}
          />
        ));
        // A product carousel scopes each slide to its product (buy-box per slide).
        return productScope ? (
          <ProductFormProvider key={`i${i}`} product={resolveBuilderProduct(item, 'live')}>
            {itemKids}
          </ProductFormProvider>
        ) : (
          <React.Fragment key={`i${i}`}>{itemKids}</React.Fragment>
        );
      });
    } else {
      const s: Scope = bound && card === 'object' ? { ...scope, item: value } : scope;
      slides = kids.map((child) => (
        <RenderNode key={child.id} node={child} scope={s} outlet={outlet} />
      ));
    }
    body = (
      <BuilderCarousel
        slides={slides}
        autoplay={node.props.autoplay !== false}
        interval={Number(node.props.interval) || 6}
        arrows={node.props.arrows !== false}
        dots={node.props.dots !== false}
      />
    );
  } else if (node.type === 'NavMenu') {
    // NavMenu is a CONTAINER of NavItem children (docs/57 rebuild), rendered ONCE
    // into a responsive NavShell — an inline row on wide frames, a hamburger reveal
    // once narrow. Back-compat: a not-yet-migrated NavMenu with legacy
    // `props.links[]` and no children renders those as NavItem-equivalent links, so
    // existing sites keep working until the tree migration converts them.
    const orientation = node.props.orientation === 'stack' ? 'stack' : 'row';
    const kids = node.children ?? [];
    const items =
      kids.length > 0
        ? kids.map((child) => (
            <RenderNode key={child.id} node={child} scope={scope} outlet={outlet} />
          ))
        : renderLegacyNavLinks(node.props.links);
    // An empty nav renders nothing on the live site (parity with the old leaf).
    if (items.length === 0) return null;
    body = <NavShell orientation={orientation}>{items}</NavShell>;
  } else if (isContainer) {
    const kids = node.children ?? [];
    if (bound && card === 'array') {
      // Iterate: each record scopes its subtree to `item`. A product source
      // additionally establishes the buy-box context per item, so a card's
      // AddToCart/Buy-now sells THAT product's variant (docs/98 Pillar 7).
      body = (value as unknown[]).map((item, i) => {
        const itemKids = kids.map((child) => (
          <RenderNode
            key={child.id}
            node={child}
            scope={{ ...scope, item, index: i }}
            outlet={outlet}
          />
        ));
        return productScope ? (
          <ProductFormProvider key={`i${i}`} product={resolveBuilderProduct(item, 'live')}>
            {itemKids}
          </ProductFormProvider>
        ) : (
          <React.Fragment key={`i${i}`}>{itemKids}</React.Fragment>
        );
      });
    } else if (bound && card === 'object') {
      // Set scope: render once, descendants resolve item.*
      body = kids.map((child) => (
        <RenderNode key={child.id} node={child} scope={{ ...scope, item: value }} outlet={outlet} />
      ));
    } else {
      body = kids.map((child) => (
        <RenderNode key={child.id} node={child} scope={scope} outlet={outlet} />
      ));
    }
  } else if (node.type === 'ThemeToggle') {
    // Light/dark switch — interactive, so it's gated here (renderLeaf has no scope).
    // It auto-hides unless the site offers BOTH themes: appearance policy `toggle`
    // (set in /builder/brand). Any single-theme policy (`light-only`/`dark-only`) —
    // and `auto`, which follows the device with no manual control — renders nothing.
    // `site.appearance` is threaded by loadSiteData.
    const appearance = resolvePath(scope, 'site.appearance') as
      { policy?: string; initial?: 'light' | 'dark' } | undefined;
    if (appearance?.policy !== 'toggle') return null;
    body = <ThemeToggle initial={appearance.initial === 'dark' ? 'dark' : 'light'} />;
  } else {
    // A leaf may nest children (Button → an inline Icon, docs/47): render them in
    // the current scope and hand them to the shared renderLeaf, which places them.
    const kids = (node.children ?? []).map((child) => (
      <RenderNode key={child.id} node={child} scope={scope} outlet={outlet} />
    ));
    body = renderLeaf({
      node,
      value,
      cardinality: card,
      bound,
      mode: 'live',
      // The live storefront is page/site (never email — the send path renders email
      // through @wizeworks/email); renderLeaf treats page and site identically.
      surface: 'page',
      leafClass: leafStylesByClass ? node.class : undefined,
      children: kids.length > 0 ? kids : undefined,
    });
  }

  // A product OBJECT scope establishes the shared buy-box context once over its
  // subtree, so VariantPicker/Quantity/AddToCart/action atoms inside stay in sync:
  // a ProductForm node bound to `product`, OR any container pinned to one product
  // (entity pin). A collection ARRAY scope wraps per repeated item above instead.
  if (node.type === 'ProductForm' || (productScope && card === 'object')) {
    body = (
      <ProductFormProvider product={resolveBuilderProduct(value, 'live')}>
        {body}
      </ProductFormProvider>
    );
  }

  // A class-styled leaf already wears node.class on its own element → return it as
  // is. A raw container renders AS its tag (carrying node.class + sanitized attrs).
  // Everything else gets one wrapper div carrying node.class (+ the dynamic
  // background image, the only inline style left). The published page and the
  // editor canvas emit the same class, so preview == production.
  if (leafStylesByClass) return body;
  if (rawTag) {
    return React.createElement(
      rawTag,
      { className: cls(node.class), style: bgStyle, ...sxAttrs(node), ...safeElementAttrs(node) },
      body
    );
  }
  return (
    <div className={cls(node.class)} style={bgStyle} data-bx-type={node.type} {...sxAttrs(node)}>
      {body}
    </div>
  );
}

export function BuilderRenderer({ tree, data }: { tree: BuilderNode; data: DataSources }) {
  return (
    <div className="bx-render" data-builder-page>
      <RenderNode node={tree} scope={{ root: data }} />
    </div>
  );
}

// `BuilderSiteChrome` — the site LAYOUT renderer (docs/45 §2.6) — was deleted with the
// root layout branch that mounted it. `BuilderRenderer` above stays: the catch-all
// `[...slug]` route still reaches this tier for a CMS article, which the silica engine
// does not own.
