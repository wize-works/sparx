// @sparx/commerce-schemas — Zod input/output schemas for every Commerce
// write surface (REST, MCP, Server Actions, storefront, B2B portal).
//
// One barrel. Per the CRM convention, every schema this package exports
// is also re-exported here so callers can `import { CreateProductInput,
// IssueGiftCardInput } from '@sparx/commerce-schemas'` without worrying
// about file paths.
//
// The numbered groupings below mirror the Phase ordering in the Commerce
// implementation plan so you can read this file top-to-bottom and walk
// the same delivery sequence.

// Phase 0 — primitives shared across every file.
export * from './common';

// Phase 1 — catalog (products, variants, options, categories, collections,
// fitment).
export * from './products';
export * from './categories';
export * from './fitment';

// Phase 2 — inventory (warehouses, levels, lots, serials).
export * from './inventory';

// Phase 3 — pricing + discounts + gift cards + store credit.
export * from './pricing';
export * from './discounts';

// Phase 4 — bundles + configurator.
export * from './bundles';

// Phase 5 — cart, checkout, subscriptions, shipping, tax, providers.
export * from './cart';
export * from './checkout';
export * from './subscriptions';
export * from './shipping';
export * from './tax';
export * from './providers';

// Phase 6 — reviews, Q&A, wishlist.
export * from './reviews';

// Phase 5/7 — returns / RMA.
export * from './returns';

// Phase 8 — storefront-level settings + theme.
export * from './storefront';
