'use client';

// Reviews & questions — what customers said about this product, and what they
// asked about it on its page.
//
// ── This is a moderation queue, not a form ───────────────────────────────
//
// There is no Save on this pane and there must not be one. Every decision here
// commits on its own the moment it is made — publish this review, hide that one,
// answer this question — because each is about a DIFFERENT person's words, and
// batching them behind one button would mean an accidental Save publishing four
// things you were still reading. The one exception is a reply, which is text
// someone is composing: it has its own Send, on its own row, beside the review
// it belongs to.
//
// ── Why reviews and questions share a pane ───────────────────────────────
//
// They are the same job — a queue of things customers wrote that need a decision
// — and they are read in one sitting. They are two RESOURCES with two moderation
// verbs, which is why the data layer keys them separately (`facetPart`) so
// answering a question does not refetch every review, but one pane and an
// internal tab strip is the right shape for the work.
//
// ── The number that is actually load-bearing ─────────────────────────────
//
// `averageRating` on the product record is the DENORMALIZED figure the
// storefront renders, and it counts approved reviews only. The pane shows it
// prominently and says what it counts, because the difference between "3.2 from
// 5 reviews" and "3.2 from 5 reviews, with 4 more waiting for you" is the whole
// reason to open this.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  Rating,
  Select,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  faCheck,
  faEyeSlash,
  faMessages,
  faReply,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { FollowingNotice, ProductScopeFallback, useProductScope } from './product-scope';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  productErrorMessage,
  questionState,
  reviewState,
  useAnswerQuestion,
  useDeleteReview,
  useModerateQuestion,
  useModerateReview,
  useProductQuestions,
  useProductReviews,
  useRespondToReview,
  type Product,
  type ProductQuestion,
  type ProductReview,
} from './products-data';

const LABEL = 'Reviews & questions';
/** Registry module for this pane, so the brand draws Sell's own picture rather
 *  than the generic one. */
const MODULE = 'commerce';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'flagged';

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Everything',
  pending: 'Waiting for you',
  approved: 'Published',
  rejected: 'Hidden',
  flagged: 'Reported',
};

/** A composer that only exists once someone asks for it. Kept local to the row
 *  so two open replies cannot share one draft — which is what happens when the
 *  text lives in the list's state keyed on "the row being replied to". */
function ReplyBox({
  placeholder,
  initial,
  busy,
  sendLabel,
  onSend,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  busy: boolean;
  sendLabel: string;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial ?? '');
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        color="module"
        rows={3}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" color="neutral" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          color="module"
          disabled={text.trim() === ''}
          loading={busy}
          onClick={() => {
            onSend(text.trim());
          }}
        >
          {sendLabel}
        </Button>
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  product,
  productId,
}: {
  review: ProductReview;
  product: Product;
  productId: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const moderate = useModerateReview(productId);
  const respond = useRespondToReview(productId);
  const remove = useDeleteReview(productId);
  const [replying, setReplying] = useState(false);

  const state = reviewState(review.status);
  const author = review.displayName ?? 'Someone';

  const failed = (title: string) => (error: unknown) => {
    toast.add({
      title,
      description: productErrorMessage(error, 'Nothing was changed.'),
      type: 'error',
    });
  };

  const setStatus = (status: 'approved' | 'rejected', done: string) => {
    moderate.mutate(
      { id: review.id, status },
      {
        onSuccess: () => {
          toast.add({ title: done, type: 'success' });
        },
        onError: failed('Could not change that review'),
      }
    );
  };

  const onDelete = () => {
    void (async () => {
      const ok = await confirm({
        title: `Delete ${author}'s review?`,
        description: `Their words, their star rating and any photos they attached are removed for good, and ${product.title}'s overall rating is worked out again without them. If you only want it off your website, hide it instead — hiding can be undone.`,
        confirmLabel: 'Delete it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      remove.mutate(review.id, {
        onSuccess: () => {
          toast.add({ title: 'Review deleted', type: 'success' });
        },
        onError: failed('Could not delete that review'),
      });
    })();
  };

  return (
    <article className="border-base-300 flex flex-col gap-3 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Rating
              value={review.rating}
              max={5}
              readOnly
              size="sm"
              label={`${String(review.rating)} out of 5`}
            />
            <Heading level={3} className="min-w-0 text-base font-semibold">
              {review.title}
            </Heading>
          </div>
          <Text className="text-sm">
            {author} · <Timestamp value={review.createdAt} format="relative" />
            {review.helpfulCount > 0 ? ` · ${String(review.helpfulCount)} found this helpful` : ''}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review.verifiedPurchase ? (
            <Badge color="success" variant="soft" size="sm">
              Really bought it
            </Badge>
          ) : null}
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        </div>
      </div>

      <Text className="text-base whitespace-pre-line">{review.body}</Text>

      {review.mediaAssetIds.length > 0 ? (
        <Text className="text-sm">
          {review.mediaAssetIds.length === 1
            ? 'They attached 1 photo.'
            : `They attached ${String(review.mediaAssetIds.length)} photos.`}
        </Text>
      ) : null}

      {review.response ? (
        <div className="border-base-300 bg-base-200 flex flex-col gap-1 rounded-lg border p-3">
          <Text className="text-sm font-medium">Your reply</Text>
          <Text className="text-base whitespace-pre-line">{review.response}</Text>
        </div>
      ) : null}

      {replying ? (
        <ReplyBox
          placeholder="Reply to this review — everyone reading it will see what you write."
          initial={review.response ?? ''}
          busy={respond.isPending}
          sendLabel={review.response ? 'Update reply' : 'Post reply'}
          onCancel={() => {
            setReplying(false);
          }}
          onSend={(text) => {
            respond.mutate(
              { id: review.id, response: text },
              {
                onSuccess: () => {
                  setReplying(false);
                  toast.add({ title: 'Reply posted', type: 'success' });
                },
                onError: failed('Could not post your reply'),
              }
            );
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {review.status === 'approved' ? (
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={moderate.isPending}
              onClick={() => {
                setStatus('rejected', 'Review hidden');
              }}
            >
              <Icon glyph={faEyeSlash} className="size-4" aria-hidden />
              Hide it
            </Button>
          ) : (
            <Button
              size="sm"
              color="module"
              loading={moderate.isPending}
              onClick={() => {
                setStatus('approved', 'Review published');
              }}
            >
              <Icon glyph={faCheck} className="size-4" aria-hidden />
              Publish it
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            onClick={() => {
              setReplying(true);
            }}
          >
            <Icon glyph={faReply} className="size-4" aria-hidden />
            {review.response ? 'Edit your reply' : 'Reply'}
          </Button>
          {/* Deleting is rare and permanent, so it does not sit at the same
              weight as the decision someone actually came here to make. */}
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            shape="square"
            aria-label={`Delete ${author}'s review`}
            loading={remove.isPending}
            onClick={onDelete}
          >
            <Icon glyph={faTrashCan} className="size-4" aria-hidden />
          </Button>
        </div>
      )}
    </article>
  );
}

function QuestionCard({ question, productId }: { question: ProductQuestion; productId: string }) {
  const toast = useToast();
  const moderate = useModerateQuestion(productId);
  const answer = useAnswerQuestion(productId);
  const [answering, setAnswering] = useState(false);

  const state = questionState(question.status);
  const asker = question.displayName ?? 'Someone';

  const failed = (title: string) => (error: unknown) => {
    toast.add({
      title,
      description: productErrorMessage(error, 'Nothing was changed.'),
      type: 'error',
    });
  };

  return (
    <article className="border-base-300 flex flex-col gap-3 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Text className="text-base font-medium">{question.body}</Text>
          <Text className="text-sm">
            {asker} asked · <Timestamp value={question.createdAt} format="relative" />
          </Text>
        </div>
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </div>

      {question.answers.length > 0 ? (
        <div className="flex flex-col gap-2">
          {question.answers.map((entry) => (
            <div
              key={entry.id}
              className="border-base-300 flex flex-col gap-1 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Text as="span" className="text-sm font-medium">
                  {entry.isOfficial ? 'Answered by you' : 'Answered by another shopper'}
                </Text>
                {entry.isOfficial ? (
                  <Badge color="module" variant="soft" size="sm">
                    Official
                  </Badge>
                ) : null}
              </div>
              <Text className="text-base whitespace-pre-line">{entry.body}</Text>
            </div>
          ))}
        </div>
      ) : null}

      {answering ? (
        <ReplyBox
          placeholder="Answer this question — it appears on the product's page under their question."
          busy={answer.isPending}
          sendLabel="Post answer"
          onCancel={() => {
            setAnswering(false);
          }}
          onSend={(text) => {
            answer.mutate(
              { id: question.id, body: text },
              {
                onSuccess: () => {
                  setAnswering(false);
                  toast.add({ title: 'Answer posted', type: 'success' });
                },
                onError: failed('Could not post your answer'),
              }
            );
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            color="module"
            onClick={() => {
              setAnswering(true);
            }}
          >
            <Icon glyph={faReply} className="size-4" aria-hidden />
            Answer it
          </Button>
          {question.status === 'published' ? (
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={moderate.isPending}
              onClick={() => {
                moderate.mutate(
                  { id: question.id, status: 'rejected' },
                  {
                    onSuccess: () => {
                      toast.add({ title: 'Question hidden', type: 'success' });
                    },
                    onError: failed('Could not hide that question'),
                  }
                );
              }}
            >
              <Icon glyph={faEyeSlash} className="size-4" aria-hidden />
              Hide it
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={moderate.isPending}
              onClick={() => {
                moderate.mutate(
                  { id: question.id, status: 'published' },
                  {
                    onSuccess: () => {
                      toast.add({ title: 'Question published', type: 'success' });
                    },
                    onError: failed('Could not publish that question'),
                  }
                );
              }}
            >
              <Icon glyph={faCheck} className="size-4" aria-hidden />
              Show it on the page
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

export function ProductReviewsSurface({ ctx }: { ctx: SurfaceContext }) {
  const scope = useProductScope(ctx, { label: LABEL });
  const productId = scope.productId ?? 'new';
  const reviews = useProductReviews(productId);
  const questions = useProductQuestions(productId);
  const [tab, setTab] = useState('reviews');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const allReviews = useMemo(() => reviews.data?.items ?? [], [reviews.data]);
  const allQuestions = useMemo(() => questions.data ?? [], [questions.data]);

  const shownReviews = useMemo(
    () => (filter === 'all' ? allReviews : allReviews.filter((r) => r.status === filter)),
    [allReviews, filter]
  );
  const shownQuestions = useMemo(() => {
    if (filter === 'all') return allQuestions;
    // Questions carry a smaller vocabulary than reviews. Mapping the shared
    // filter onto it — rather than showing a filter that silently matches
    // nothing — keeps one control honest across both tabs.
    if (filter === 'approved') return allQuestions.filter((q) => q.status === 'published');
    if (filter === 'pending') return allQuestions.filter((q) => q.status === 'pending');
    if (filter === 'rejected') return allQuestions.filter((q) => q.status === 'rejected');
    return [];
  }, [allQuestions, filter]);

  const waiting = allReviews.filter((r) => r.status === 'pending' || r.status === 'flagged').length;
  const unanswered = allQuestions.filter((q) => q.answers.length === 0).length;

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} module={MODULE} />;
  }

  const busy = reviews.isFetching || questions.isFetching;
  const failedToLoad = reviews.isError || questions.isError;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${LABEL} actions`}
        status={
          scope.isFollowing ? (
            <Badge color="info" variant="soft" size="sm">
              Following
            </Badge>
          ) : null
        }
        controls={
          <Select
            size="sm"
            color="module"
            // Bounded, not `flex-1`: an unbounded Select in a `w-full` toolbar
            // grows to fill the bar and truncates the product name down to
            // "Everyday Ceram…". The filter is the thing that gives way here.
            className="ml-auto w-40 shrink-0"
            value={filter}
            // Silica renders the trigger's selected label from `items`, not from
            // children — without it the bar reads "approved" instead of
            // "Published".
            items={FILTER_LABELS}
            aria-label="Show only"
            onValueChange={(next) => {
              setFilter(String(next) as StatusFilter);
            }}
          />
        }
        refresh={
          <RefreshButton
            isFetching={busy}
            updatedAt={reviews.dataUpdatedAt}
            onRefresh={() => {
              void reviews.refetch();
              void questions.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <FollowingNotice scope={scope} />

          {/* Carded, because the branch beside it ends in FormSections — each
              already a card. */}
          {failedToLoad ? (
            <Card>
              <PaneLoadError
                module={MODULE}
                icon={<Icon glyph={faMessages} className="size-6" aria-hidden />}
                title="Could not load what customers said"
                description={productErrorMessage(
                  reviews.error ?? questions.error,
                  'This is a problem reaching the server. Nothing customers wrote has been lost.'
                )}
                onRetry={() => {
                  void reviews.refetch();
                  void questions.refetch();
                }}
              />
            </Card>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Rating
                    value={Math.round(scope.product.averageRating ?? 0)}
                    max={5}
                    readOnly
                    size="sm"
                    label="Average rating"
                  />
                  <Text as="span" className="text-lg font-semibold">
                    {scope.product.averageRating === null
                      ? 'No rating yet'
                      : scope.product.averageRating.toFixed(1)}
                  </Text>
                  <Text as="span" className="text-sm">
                    {scope.product.reviewCount === 1
                      ? 'from 1 published review'
                      : `from ${String(scope.product.reviewCount)} published reviews`}
                  </Text>
                </div>
                {waiting > 0 ? (
                  <Text className="text-sm">
                    {waiting === 1
                      ? '1 review is waiting for your decision and is not on your website yet.'
                      : `${String(waiting)} reviews are waiting for your decision and are not on your website yet.`}
                  </Text>
                ) : null}
              </div>

              <Tabs
                variant="pills"
                color="module"
                value={tab}
                onValueChange={(next) => {
                  setTab(String(next));
                }}
                className="flex flex-col gap-3"
              >
                <div className="bg-base-300 shrink-0 rounded-full px-4 py-2">
                  <TabsList scrollable>
                    <TabsTab value="reviews">
                      Reviews{allReviews.length > 0 ? ` (${String(allReviews.length)})` : ''}
                    </TabsTab>
                    <TabsTab value="questions">
                      Questions
                      {allQuestions.length > 0 ? ` (${String(allQuestions.length)})` : ''}
                    </TabsTab>
                  </TabsList>
                </div>

                <TabsPanel value="reviews">
                  <FormSection title="What customers said">
                    {shownReviews.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {shownReviews.map((review) => (
                          <ReviewCard
                            key={review.id}
                            review={review}
                            product={scope.product}
                            productId={scope.productId}
                          />
                        ))}
                      </div>
                    ) : allReviews.length > 0 ? (
                      // Telling someone to wait for their first review when they
                      // have eleven and picked the wrong filter is the worse of
                      // the two mistakes this screen can make.
                      <Text className="text-sm">
                        None of the {String(allReviews.length)} reviews on {scope.product.title} are{' '}
                        {FILTER_LABELS[filter].toLowerCase()}. Choose &ldquo;Everything&rdquo; above
                        to see them all.
                      </Text>
                    ) : (
                      <Text className="text-sm">
                        Nobody has reviewed {scope.product.title} yet. Reviews appear here as
                        customers write them, and nothing goes onto your website until you publish
                        it.
                      </Text>
                    )}
                  </FormSection>
                </TabsPanel>

                <TabsPanel value="questions">
                  <FormSection
                    title="What customers asked"
                    description={
                      unanswered > 0
                        ? unanswered === 1
                          ? '1 question has no answer yet.'
                          : `${String(unanswered)} questions have no answer yet.`
                        : undefined
                    }
                  >
                    {shownQuestions.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {shownQuestions.map((question) => (
                          <QuestionCard
                            key={question.id}
                            question={question}
                            productId={scope.productId}
                          />
                        ))}
                      </div>
                    ) : allQuestions.length > 0 ? (
                      <Text className="text-sm">
                        None of the {String(allQuestions.length)} questions on {scope.product.title}{' '}
                        match &ldquo;{FILTER_LABELS[filter]}&rdquo;. Choose &ldquo;Everything&rdquo;
                        above to see them all.
                      </Text>
                    ) : (
                      <EmptyState
                        size="sm"
                        icon={<Icon glyph={faMessages} className="size-6" aria-hidden />}
                        title="No questions yet"
                        description={`Nobody has asked anything about ${scope.product.title}. When they do, the question appears here for you to answer before it goes on the page.`}
                      />
                    )}
                  </FormSection>
                </TabsPanel>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
