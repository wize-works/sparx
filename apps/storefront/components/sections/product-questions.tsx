// Bound product section — published Q&A list + ask-a-question form.

import type { ProductQuestionsConfig } from '@sparx/sitebuilder-schemas';

import { QuestionForm } from '@/components/question-form';
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
  const questions = ctx.productExtras?.questions ?? [];
  return (
    <section className="sf-section">
      <h2 className="sf-h2" style={{ marginBottom: '1rem' }}>
        {config.heading}
      </h2>
      {questions.length > 0 ? (
        <ul className="sf-qa" style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem' }}>
          {questions.map((q) => (
            <li key={q.id} className="sf-qa__item">
              <p className="sf-qa__q">
                <strong>Q:</strong> {q.body}
                {q.displayName ? (
                  <span className="sf-muted" style={{ fontWeight: 400 }}>
                    {' '}
                    — {q.displayName}
                  </span>
                ) : null}
              </p>
              {q.answers.map((a) => (
                <p key={a.id} className="sf-qa__a">
                  <strong>A:</strong> {a.body}
                  {a.isOfficial ? <span className="sf-qa__official">Store</span> : null}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sf-muted" style={{ marginBottom: '1.25rem' }}>
          {config.emptyText}
        </p>
      )}
      {config.showForm ? (
        <QuestionForm tenantSlug={ctx.tenantSlug} handle={product.handle} />
      ) : null}
    </section>
  );
}
