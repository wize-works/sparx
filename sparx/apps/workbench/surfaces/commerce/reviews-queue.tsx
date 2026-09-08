'use client';

// Reviews — the catalog-wide moderation queue.
//
// ── This is a queue, not a form ──────────────────────────────────────────
//
// Every review here is a DIFFERENT customer's words about a different product,
// waiting for a decision. There is no Save and there must not be one: each
// decision commits the moment it is made, because batching them behind one
// button would mean an accidental Save publishing four things you were still
// reading. A reply is the one exception — it is text you are composing, so it
// has its own Send.
//
// ── Why bulk lives HERE and not on the product ───────────────────────────
//
// A single product rarely has enough waiting reviews to want a "publish all".
// The whole catalog does — a promotion drops thirty reviews overnight — so the
// cross-product queue is the natural home for select-many-and-decide. Bulk and
// per-row are the same two verbs (publish / hide / delete); bulk just applies
// one to a checked set in a single call.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Heading,
  Rating,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Check, EyeOff, MessageSquare, Reply, ServerCrash, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { productErrorMessage, reviewState } from './products-data';
import {
  useBulkDeleteReviews,
  useBulkModerateReviews,
  useDeleteQueueReview,
  useModerateQueueReview,
  usePendingReviews,
  useQueueReview,
  useRespondQueueReview,
  type QueueReview,
} from './moderation-data';

const LABEL = 'Reviews';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  return 'beside';
}

/** A reply composer kept local to the row so two open replies never share one
 *  draft. */
function ReplyBox({
  initial,
  busy,
  sendLabel,
  onSend,
  onCancel,
}: {
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
        placeholder="Reply to this review — everyone reading it on your website will see what you write."
        aria-label="Reply to this review"
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
  ctx,
  selected,
  onToggleSelect,
  highlighted,
  pinned,
}: {
  review: QueueReview;
  ctx: SurfaceContext;
  selected: boolean;
  onToggleSelect: (id: string, next: boolean) => void;
  /** The item the queue was opened focused on — wears the module hue. */
  highlighted?: boolean;
  /** A focused item shown above the backlog because it is no longer pending; not
   *  part of "select all waiting", so its checkbox is dropped. */
  pinned?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const moderate = useModerateQueueReview();
  const respond = useRespondQueueReview();
  const remove = useDeleteQueueReview();
  const [replying, setReplying] = useState(false);

  const state = reviewState(review.status);
  const author = review.displayName ?? 'Someone';
  const product = review.productTitle ?? 'a product';

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
        title: `Delete ${author}'s review of ${product}?`,
        description: `Their words, their star rating and any photos they attached are removed for good, and ${product}'s overall rating is worked out again without them. If you only want it off your website, hide it instead — hiding can be undone.`,
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

  const openProduct = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(
      'commerce.product.reviews',
      { productId: review.productId },
      { target: targetFor(event) }
    );
  };

  return (
    <article
      className={`bg-base-100 flex flex-col gap-3 rounded-lg border p-4 ${
        highlighted ? 'border-module' : 'border-base-300'
      }`}
    >
      <div className="flex items-start gap-3">
        {pinned ? null : (
          <Checkbox
            color="module"
            checked={selected}
            aria-label={`Select ${author}'s review of ${product}`}
            onChange={(event) => {
              onToggleSelect(review.id, event.target.checked);
            }}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* The product this review is about, as a link into its full reviews
                pane — a moderator usually wants the rest of the context. */}
            <button
              type="button"
              className="link link-hover min-w-0 truncate text-left text-base font-semibold"
              onClick={(event) => {
                openProduct(event);
              }}
            >
              {product}
            </button>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-2">
            <Rating
              value={review.rating}
              max={5}
              readOnly
              size="sm"
              label={`${String(review.rating)} out of 5`}
            />
            {review.title ? (
              <Heading level={3} className="min-w-0 text-base font-semibold">
                {review.title}
              </Heading>
            ) : null}
          </div>
          <Text className="text-sm">
            {author} · <Timestamp value={review.createdAt} format="relative" />
          </Text>
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
          <Button
            size="sm"
            color="module"
            loading={moderate.isPending}
            onClick={() => {
              setStatus('approved', 'Review published');
            }}
          >
            <Check className="size-4" aria-hidden />
            Publish it
          </Button>
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            loading={moderate.isPending}
            onClick={() => {
              setStatus('rejected', 'Review hidden');
            }}
          >
            <EyeOff className="size-4" aria-hidden />
            Hide it
          </Button>
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            onClick={() => {
              setReplying(true);
            }}
          >
            <Reply className="size-4" aria-hidden />
            {review.response ? 'Edit your reply' : 'Reply'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            shape="square"
            className="ml-auto"
            aria-label={`Delete ${author}'s review`}
            loading={remove.isPending}
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      )}
    </article>
  );
}

export function ReviewsQueueSurface({ ctx }: { ctx: SurfaceContext }) {
  const reviews = usePendingReviews();
  const toast = useToast();
  const confirm = useConfirm();
  const bulkModerate = useBulkModerateReviews();
  const bulkDelete = useBulkDeleteReviews();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => reviews.data ?? [], [reviews.data]);
  const selectedIds = useMemo(
    () => rows.filter((r) => selected.has(r.id)).map((r) => r.id),
    [rows, selected]
  );
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  // The review the queue was opened focused on (a table row click passes it).
  // Highlighted in place if still pending; fetched and pinned above the backlog
  // if it has since been decided — so opening focused on ANY row works.
  const focusId = typeof ctx.params.focusId === 'string' ? ctx.params.focusId : undefined;
  const inBacklog = focusId !== undefined && rows.some((r) => r.id === focusId);
  const focusedQuery = useQueueReview(focusId !== undefined && !inBacklog ? focusId : undefined);
  const focused = focusId !== undefined && !inBacklog ? focusedQuery.data : undefined;
  const focusPending = focusedQuery.isLoading;
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusId === undefined) return;
    if (focused || inBacklog) focusRef.current?.scrollIntoView({ block: 'center' });
  }, [focusId, focused, inBacklog]);

  const toggleSelect = (id: string, next: boolean) => {
    setSelected((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  const bulkSetStatus = (status: 'approved' | 'rejected', done: string) => {
    bulkModerate.mutate(
      { reviewIds: selectedIds, status },
      {
        onSuccess: (result) => {
          clearSelection();
          toast.add({ title: `${done} (${String(result.count)})`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not update those reviews',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onBulkDelete = () => {
    void (async () => {
      const count = selectedIds.length;
      const ok = await confirm({
        title: count === 1 ? 'Delete this review?' : `Delete these ${String(count)} reviews?`,
        description:
          'Their words, ratings and any photos are removed for good, and the affected products have their overall ratings worked out again. Hiding is undoable; deleting is not.',
        confirmLabel: count === 1 ? 'Delete it' : 'Delete them',
        cancelLabel: 'Keep them',
        color: 'danger',
      });
      if (!ok) return;
      bulkDelete.mutate(selectedIds, {
        onSuccess: (result) => {
          clearSelection();
          toast.add({ title: `Deleted ${String(result.count)} reviews`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not delete those reviews',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  const busy = bulkModerate.isPending || bulkDelete.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Reviews queue controls"
        controls={
          <>
            <MessageSquare className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {LABEL}
            </Heading>
            {rows.length > 0 ? (
              <Badge color="warning" variant="soft" size="sm">
                {rows.length === 1 ? '1 waiting' : `${String(rows.length)} waiting`}
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={reviews.isFetching}
            updatedAt={reviews.data ? reviews.dataUpdatedAt : undefined}
            onRefresh={() => {
              void reviews.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {reviews.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load the reviews queue"
              description={productErrorMessage(
                reviews.error,
                'This is a problem reaching the server. Nothing customers wrote has been lost.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void reviews.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : reviews.isLoading ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : rows.length === 0 && !focused && !focusPending ? (
            <EmptyState
              icon={<Check className="size-6" aria-hidden />}
              title="Nothing waiting"
              description="Every review across your whole catalog has had a decision. New ones from customers who didn't buy through a tracked order appear here for you to publish or hide before they go on your website."
            />
          ) : (
            <>
              {focused ? (
                <div ref={focusRef} className="flex flex-col gap-2">
                  <Heading level={1} className="text-2xl font-semibold">
                    This review
                  </Heading>
                  <ReviewCard
                    review={focused}
                    ctx={ctx}
                    selected={false}
                    onToggleSelect={toggleSelect}
                    highlighted
                    pinned
                  />
                </div>
              ) : null}

              {rows.length === 0 ? (
                focused ? (
                  <Text className="text-sm">Nothing else is waiting for you right now.</Text>
                ) : null
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <Heading level={1} className="text-2xl font-semibold">
                      Reviews waiting for you
                    </Heading>
                    <Text className="text-sm">
                      These reviews are from across all your products and are not on your website
                      yet. Publish the ones you’re happy with; hide anything that breaks your rules.
                      A verified badge means the reviewer really bought the product.
                    </Text>
                  </div>

                  {selectedIds.length > 0 ? (
                    <div className="border-base-300 bg-base-100 sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-3">
                      <Text as="span" className="font-medium">
                        {selectedIds.length === 1
                          ? '1 selected'
                          : `${String(selectedIds.length)} selected`}
                      </Text>
                      <Button
                        size="sm"
                        color="module"
                        loading={bulkModerate.isPending}
                        disabled={busy}
                        onClick={() => {
                          bulkSetStatus('approved', 'Published');
                        }}
                      >
                        <Check className="size-4" aria-hidden />
                        Publish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        color="neutral"
                        loading={bulkModerate.isPending}
                        disabled={busy}
                        onClick={() => {
                          bulkSetStatus('rejected', 'Hidden');
                        }}
                      >
                        <EyeOff className="size-4" aria-hidden />
                        Hide
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        loading={bulkDelete.isPending}
                        disabled={busy}
                        onClick={onBulkDelete}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="neutral"
                        className="ml-auto"
                        onClick={clearSelection}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <label className="flex w-fit items-center gap-2">
                      <Checkbox
                        color="module"
                        checked={allSelected}
                        aria-label="Select every waiting review"
                        onChange={(event) => {
                          setSelected(
                            event.target.checked ? new Set(rows.map((r) => r.id)) : new Set()
                          );
                        }}
                      />
                      <Text as="span" className="text-sm">
                        Select all
                      </Text>
                    </label>
                  )}

                  <div className="flex flex-col gap-3">
                    {rows.map((review) => (
                      <div key={review.id} ref={focusId === review.id ? focusRef : undefined}>
                        <ReviewCard
                          review={review}
                          ctx={ctx}
                          selected={selected.has(review.id)}
                          onToggleSelect={toggleSelect}
                          highlighted={focusId === review.id}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
