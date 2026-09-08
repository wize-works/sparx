// What a product's QUESTIONS look like — the published questions, the shop's
// answers, the empty line, and the ask-a-question form.
//
// Presentation only, and shared on purpose — the same rule
// `product-reviews-view.tsx` states for reviews. Two things put questions on a
// product page: the legacy bound section (`sections/product-questions.tsx`, handed
// its questions by the PDP route) and the silica host core
// (`products/product-questions-core.tsx`, which fetches its own). They differ ONLY
// in where the data comes from, so they must not differ in what a shopper sees.

import { QuestionForm } from '@/components/question-form';
import type { PublicQuestion, PublicQuestionAnswer } from '@/lib/commerce';

function formatQuestionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** One answer beneath its question. The shop's own answers carry a badge, because a
 *  shopper deciding whether to trust the sentence needs to know whether the business
 *  wrote it or another customer did. */
function Answer({ answer }: { answer: PublicQuestionAnswer }) {
  return (
    <div className="border-primary bg-base-200 rounded-field mt-3 border-l-[3px] px-3.5 py-2.5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-base-content text-[0.78rem] font-semibold tracking-wide uppercase">
          {answer.isOfficial ? 'Store answer' : 'Customer answer'}
        </span>
        {answer.isOfficial ? <span className="badge badge-primary badge-sm">Store</span> : null}
        <span className="text-base-content ml-auto text-sm">
          {formatQuestionDate(answer.createdAt)}
        </span>
      </div>
      <p className="text-base-content m-0 leading-relaxed">{answer.body}</p>
    </div>
  );
}

function QuestionCard({ question }: { question: PublicQuestion }) {
  return (
    <li className="border-base-300 border-b py-[1.1rem] first:pt-0">
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        {question.displayName ? (
          <span className="text-base-content font-semibold">{question.displayName}</span>
        ) : (
          <span className="text-base-content font-semibold">A customer asked</span>
        )}
        <span className="text-base-content ml-auto text-sm">
          {formatQuestionDate(question.createdAt)}
        </span>
      </div>
      <p className="text-base-content m-0 leading-relaxed">{question.body}</p>
      {question.answers.map((answer) => (
        <Answer key={answer.id} answer={answer} />
      ))}
      {question.helpfulCount > 0 ? (
        <p className="text-base-content mt-2.5 text-sm">
          {question.helpfulCount} {question.helpfulCount === 1 ? 'person' : 'people'} found this
          helpful
        </p>
      ) : null}
    </li>
  );
}

export interface ProductQuestionsViewProps {
  heading: string;
  emptyText: string;
  showForm: boolean;
  tenantSlug: string;
  handle: string;
  items: PublicQuestion[];
}

export function ProductQuestionsView({
  heading,
  emptyText,
  showForm,
  tenantSlug,
  handle,
  items,
}: ProductQuestionsViewProps) {
  return (
    <section className="py-16">
      <h2 className="text-base-content mb-4 text-3xl font-semibold tracking-tight">{heading}</h2>
      {items.length > 0 ? (
        <ul className="m-0 mb-6 list-none p-0">
          {items.map((question) => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </ul>
      ) : (
        <p className="text-base-content mb-5">{emptyText}</p>
      )}
      {showForm ? <QuestionForm tenantSlug={tenantSlug} handle={handle} /> : null}
    </section>
  );
}
