// Bound product section — published Q&A list + ask-a-question form.
//
// The MARKUP lives in `products/product-questions-view.tsx`, shared with the
// `commerce.product-questions` host core. This section and that core differ only in
// where the questions come from (the PDP route hands this one its list; the core
// fetches its own), so they must not differ in what a shopper sees. Reviews already
// work this way — see the note at the top of `products/product-reviews-view.tsx`.

import type { ProductQuestionsConfig } from '@wizeworks/sitebuilder-schemas';

import { ProductQuestionsView } from '@/components/products/product-questions-view';
import type { SectionContext } from '../section-renderer';

export function ProductQuestionsSection({
  config,
  ctx,
}: {
  config: ProductQuestionsConfig;
  ctx: SectionContext;
}) {
  const product = ctx.product;
  if (!product) return null;
  return (
    <ProductQuestionsView
      heading={config.heading}
      emptyText={config.emptyText}
      showForm={config.showForm}
      tenantSlug={ctx.tenantSlug}
      handle={product.handle}
      items={ctx.productExtras?.questions ?? []}
    />
  );
}
