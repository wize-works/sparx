// @sparx/email-sections — barrel.
//
// Single source of truth for the shape of every email section config, the
// tier-tagged section registry, and the email body model — shared by the render
// lib (@sparx/email), the service layer (@sparx/email-platform), REST/MCP, and
// the dashboard composer (docs/31-email-section-composer.md).

export * from './common';
export * from './fields';
export * from './registry';
export * from './section-model';
export * from './section-data';

// Section config schemas + inferred types (for renderer + composer typing).
export * from './sections/heading';
export * from './sections/rich-text';
export * from './sections/image';
export * from './sections/button';
export * from './sections/divider';
export * from './sections/spacer';
export * from './sections/featured-products';
export * from './sections/collection-grid';
export * from './sections/latest-blog-posts';
export * from './sections/active-promotion';
export * from './sections/abandoned-cart';
export * from './sections/recommended-products';
export * from './sections/recent-order';
export * from './sections/loyalty-points';
