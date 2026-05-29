// Service-layer barrel. Each service is namespaced so callers write
// `productService.create(ctx, ...)`, `cartService.addItem(ctx, ...)`,
// etc. — symmetric with how the MCP tool registry exposes them.

// Phase 1 — catalog
export * as productService from './product-service';
export * as variantService from './variant-service';
export * as categoryService from './category-service';
export * as collectionService from './collection-service';
export * as fitmentService from './fitment-service';

// Phase 2 — inventory
export * as inventoryService from './inventory-service';

// Phase 3 — pricing + discounts
export * as pricingService from './pricing-service';
export * as discountService from './discount-service';

// Phase 4 — bundles + configurator
export * as configuratorService from './configurator-service';

// Phase 5 — cart, checkout, subscriptions, shipping, tax, providers
export * as cartService from './cart-service';
export * as checkoutService from './checkout-service';
export * as subscriptionService from './subscription-service';
export * as shippingService from './shipping-service';
export * as taxService from './tax-service';
export * as providerService from './provider-service';

// Phase 5/7 — returns / RMA
export * as returnService from './return-service';

// Phase 6 — reviews + Q&A + wishlists
export * as reviewService from './review-service';

// Phase 8 — storefront defaults + theme
export * as storefrontService from './storefront-service';

// Phase 9 — reporting + dashboard home metrics
export * as reportingService from './reporting-service';

export { CommerceNotImplementedError, notImplemented } from './not-implemented';
