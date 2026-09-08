// Dockable panes scoped to ONE product, each showing another module through
// it — stock is Inventory, trade prices are B2B, translations are Content.
//
// Panes rather than tabs so they dock side by side, tear onto a second
// monitor and persist. Every one takes `{ productId }` and follows the
// product selection when it has none — the contract lives in
// surfaces/commerce/product-scope.tsx.

import {
  faBuilding,
  faGlobe,
  faMessage,
  faPuzzlePiece,
  faRepeat,
  faSliders,
  faSparkles,
  faTruck,
  faWarehouse,
} from '@fortawesome/pro-solid-svg-icons';
import type { SurfaceDefinition } from '../registry';
import { ProductChannelsSurface } from '../../../surfaces/commerce/product-channels';
import { ProductConfiguratorSurface } from '../../../surfaces/commerce/product-configurator';
import { ProductDropshipSurface } from '../../../surfaces/commerce/product-dropship';
import { ProductFitmentSurface } from '../../../surfaces/commerce/product-fitment';
import { ProductReviewsSurface } from '../../../surfaces/commerce/product-reviews';
import { ProductStockSurface } from '../../../surfaces/commerce/product-stock';
import { ProductSubscriptionsSurface } from '../../../surfaces/commerce/product-subscriptions';
import { ProductTradePricingSurface } from '../../../surfaces/commerce/product-trade-pricing';
import { ProductTranslationsSurface } from '../../../surfaces/commerce/product-translations';

export const PRODUCT_PANEL_SURFACES: SurfaceDefinition[] = [
  /* ── Product facets: dockable panes scoped to ONE product ──────────────────
     These are NOT tabs on the product editor, and the distinction is the whole
     reason they exist. Each is another module's functionality seen through a
     product — stock belongs to Inventory, fitment to the catalog's compatibility
     data, trade prices to B2B. As tabs you could only see one at a time inside a
     pane you cannot detach; as panes they dock side by side, tear onto a second
     monitor, and persist.

     All of them:
       • take `{ productId }` and implement the contract in
         surfaces/commerce/product-scope.tsx — pinned when the param is present,
         following the product selection when it is absent;
       • are `listed: true`, so they can be opened cold from the launcher (they
         open in following mode and say how to choose a product);
       • sit in the "Product panels" section so they read as a set rather than
         scattered among the catalog lists.

     Every entry below is live. ──────────────────────────────────────────── */
  {
    key: 'commerce.product.stock',
    title: 'Product stock',
    module: 'inventory',
    icon: faWarehouse,
    section: 'Product panels',
    order: 15,
    keywords: ['inventory', 'levels', 'on hand', 'warehouse', 'reorder'],
    besideWidth: 0.4,
    component: ProductStockSurface,
  },
  {
    key: 'commerce.product.fitment',
    title: 'Product fitment',
    module: 'commerce',
    icon: faPuzzlePiece,
    section: 'Product panels',
    order: 16,
    keywords: ['compatibility', 'fits', 'vehicles', 'models', 'machines'],
    besideWidth: 0.4,
    component: ProductFitmentSurface,
  },
  {
    key: 'commerce.product.configurator',
    title: 'Product configurator',
    module: 'commerce',
    icon: faSliders,
    section: 'Product panels',
    order: 17,
    keywords: ['options', 'build', 'made to order', 'custom'],
    besideWidth: 0.45,
    component: ProductConfiguratorSurface,
  },
  {
    key: 'commerce.product.trade-pricing',
    title: 'Product trade pricing',
    module: 'b2b',
    icon: faBuilding,
    section: 'Product panels',
    order: 18,
    keywords: ['b2b', 'wholesale', 'contract', 'tiers', 'accounts'],
    besideWidth: 0.4,
    component: ProductTradePricingSurface,
  },
  {
    key: 'commerce.product.reviews',
    title: 'Product reviews & questions',
    module: 'commerce',
    icon: faMessage,
    section: 'Product panels',
    order: 19,
    keywords: ['ratings', 'stars', 'feedback', 'qa', 'answers'],
    besideWidth: 0.4,
    component: ProductReviewsSurface,
  },
  {
    key: 'commerce.product.channels',
    title: 'Product listings',
    module: 'commerce',
    icon: faGlobe,
    section: 'Product panels',
    order: 20,
    // No `sparx.market` here. Keywords are what the launcher matches on, so that
    // one made typing another company's product name in the Piggles launcher
    // surface a screen — and the marketplace block on this pane is hidden for
    // Piggles anyway (ProductAdapter.hiddenFeatures).
    keywords: ['channels', 'marketplace', 'listings', 'sites'],
    besideWidth: 0.4,
    component: ProductChannelsSurface,
  },
  {
    key: 'commerce.product.dropship',
    title: 'Product dropshipping',
    module: 'dropship',
    icon: faTruck,
    section: 'Product panels',
    order: 21,
    keywords: ['supplier', 'source', 'fulfillment', 'fulfilment', 'vendor'],
    besideWidth: 0.4,
    component: ProductDropshipSurface,
  },
  {
    key: 'commerce.product.subscriptions',
    title: 'Product subscriptions',
    module: 'commerce',
    icon: faRepeat,
    section: 'Product panels',
    order: 22,
    keywords: ['recurring', 'repeat', 'plans', 'memberships'],
    besideWidth: 0.4,
    component: ProductSubscriptionsSurface,
  },
  {
    key: 'commerce.product.translations',
    title: 'Product translations',
    module: 'cms',
    icon: faSparkles,
    section: 'Product panels',
    order: 23,
    keywords: ['languages', 'localisation', 'localization', 'translate'],
    besideWidth: 0.4,
    component: ProductTranslationsSurface,
  },
];
