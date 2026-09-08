// The `commerce.product-questions` host core — customer questions on a
// silica-authored product page.
//
// A host core rather than a bound node tree for the reason reviews are one: asking a
// question is a TRANSACTION, not a read. A shopper types into a form and posts to the
// API, the question enters moderation, and only what the shop published comes back.
// Binding refs can draw the list; they cannot carry the form, and a questions section
// without one is a heading that promises a conversation nobody can start.
//
// It fetches its own questions from the handle the route puts in scope, because a host
// core cannot read the URL and the PDP route already knows which product it resolved.
// `listProductQuestions` degrades to an empty list rather than throwing, so the Q&A
// service having a bad afternoon leaves the product page intact (issue 253's rule).

import { listProductQuestions } from '@/lib/commerce';
import { ProductQuestionsView } from '@/components/products/product-questions-view';

export interface ProductQuestionsCoreProps {
  tenantSlug: string;
  /** The in-scope product's URL handle, from the route's record context. */
  handle: string;
  heading: string;
  emptyText: string;
  showForm: boolean;
}

export async function ProductQuestionsCore({
  tenantSlug,
  handle,
  heading,
  emptyText,
  showForm,
}: ProductQuestionsCoreProps) {
  // No handle means no product in scope — someone placed this on a page that is not a
  // product template. Render nothing rather than an empty questions heading, which
  // would read as "nobody asked about this thing" about a page that has no thing.
  if (!handle) return null;

  const questions = await listProductQuestions(tenantSlug, handle);

  return (
    <ProductQuestionsView
      heading={heading}
      emptyText={emptyText}
      showForm={showForm}
      tenantSlug={tenantSlug}
      handle={handle}
      items={questions}
    />
  );
}
