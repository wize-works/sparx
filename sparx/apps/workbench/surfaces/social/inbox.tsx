'use client';

// Inbox — the other half of social: what people said back.
//
// Publishing without answering is half a tool. A comment under a post is a customer
// talking to the business, and before this it landed somewhere nobody at the business was
// looking. This is where it arrives, and where it gets answered.
//
// Two panes, because a conversation only makes sense in order: the list of what needs a
// reply on the left, the whole thread with a reply box on the right. It is a PANE, not a
// modal — an inbox is the definition of a durable thing you come back to, and a
// half-written reply must survive switching away to check the post it is about.
//
// The audience owns a business, not a support desk. A "review" is a review, "needs a
// reply" is the status, and a one-star review is colored like a problem because it is
// one.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Heading,
  Text,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  useToast,
} from '@wizeworks/silicaui-react';
import { Archive, ExternalLink, Inbox, RotateCcw, Send, ServerCrash, Star } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useViewer } from '../../lib/api/shell-data';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  canCompose,
  catalogByPlatform,
  platformName,
  socialErrorMessage,
  useSocialOverview,
} from './data';
import {
  formatWhen,
  inboxKindLabel,
  inboxStatusMeta,
  ratingTone,
  useInbox,
  useInboxThread,
  useReplyToInboxItem,
  useSetInboxItemStatus,
  type InboxFilter,
  type InboxItem,
} from './inbox-data';
import { PaneLoadError } from '../../components/pane-load-error';

/* ── Filters ──────────────────────────────────────────────────────────────── */

const STATUS_FILTERS = [
  { value: 'open', label: 'Needs a reply' },
  { value: 'replied', label: 'Answered' },
  { value: 'archived', label: 'Archived' },
] as const;

/* ── One row in the list ──────────────────────────────────────────────────── */

/** Tone → a STATIC ink class. Tailwind cannot compile an interpolated class name, so the
 *  mapping is spelled out rather than built from the tone string. */
const RATING_INK: Record<string, string> = {
  error: 'text-error',
  warning: 'text-warning',
  success: 'text-success',
  info: 'text-info',
  neutral: '',
};

/** A review's stars, drawn rather than described — five little marks read faster than
 *  "4 out of 5" and carry the tone of the thing at a glance. */
function Stars({ rating }: { rating: number }) {
  const ink = RATING_INK[ratingTone(rating)] ?? '';
  return (
    <span className={`${ink} inline-flex items-center gap-0.5`} aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-3.5 ${n <= rating ? 'fill-current' : ''}`} aria-hidden />
      ))}
    </span>
  );
}

function InboxRow({
  item,
  active,
  platformLabel,
  onOpen,
}: {
  item: InboxItem;
  active: boolean;
  platformLabel: string;
  onOpen: () => void;
}) {
  const meta = inboxStatusMeta(item.status);
  return (
    <li className="border-base-300 border-b last:border-b-0">
      <button
        type="button"
        aria-current={active}
        onClick={onOpen}
        className={`hover:bg-base-200 flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left ${
          active ? 'bg-module bg-soft' : ''
        }`}
      >
        <Avatar
          size="sm"
          src={item.authorAvatarUrl ?? undefined}
          alt={item.authorName ?? 'Someone'}
        >
          {(item.authorName ?? '?').charAt(0).toUpperCase()}
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate font-medium">
              {item.authorName ?? item.authorHandle ?? 'Someone'}
            </span>
            {item.rating !== null ? <Stars rating={item.rating} /> : null}
            <Badge color={meta.tone} variant="soft" size="sm">
              {meta.label}
            </Badge>
          </span>
          <span className="line-clamp-2 text-base break-words">
            {item.text ?? <span className="italic">No words — just a rating.</span>}
          </span>
          <span className="text-sm">
            {inboxKindLabel(item.kind)} on {item.targetName} · {platformLabel} ·{' '}
            {formatWhen(item.receivedAt)}
          </span>
        </span>
      </button>
    </li>
  );
}

/* ── The conversation ─────────────────────────────────────────────────────── */

function ThreadMessage({ item }: { item: InboxItem }) {
  const ours = item.direction === 'outbound';
  const meta = inboxStatusMeta(item.status);
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-3 ${
        ours ? 'border-module bg-module bg-soft ml-6' : 'border-base-300 mr-6'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Text as="span" className="font-medium">
          {ours ? 'You' : (item.authorName ?? item.authorHandle ?? 'Someone')}
        </Text>
        {item.rating !== null ? <Stars rating={item.rating} /> : null}
        <Text className="text-sm">{formatWhen(item.receivedAt)}</Text>
        {ours && item.status !== 'replied' ? (
          <Badge color={meta.tone} variant="soft" size="sm">
            {meta.label}
          </Badge>
        ) : null}
      </div>
      <Text className="whitespace-pre-wrap">
        {item.text ?? <span className="italic">No words — just a rating.</span>}
      </Text>
    </div>
  );
}

function Conversation({
  itemId,
  canReply,
  onArchive,
  archiving,
}: {
  itemId: string;
  canReply: boolean;
  onArchive: (status: 'open' | 'archived') => void;
  archiving: boolean;
}) {
  const toast = useToast();
  const thread = useInboxThread(itemId);
  const reply = useReplyToInboxItem();
  const [draft, setDraft] = useState('');

  // A half-written reply is real work — the pane must not close out from under it.
  useDirtySource(draft.trim().length > 0, 'You have a reply you have not sent. Close anyway?');

  // Switching to another conversation starts a new reply, never inherits the last one.
  useEffect(() => {
    setDraft('');
  }, [itemId]);

  const root = thread.data?.find((i) => i.direction === 'inbound') ?? thread.data?.[0];
  const archived = root?.status === 'archived';

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    reply.mutate(
      { id: itemId, text },
      {
        onSuccess: () => {
          setDraft('');
          toast.add({ title: 'Reply sent', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not send that reply',
            description: socialErrorMessage(error, 'Nothing was sent.'),
            type: 'error',
          });
        },
      }
    );
  };

  if (thread.isPending) {
    return (
      <p className="p-4 text-base" role="status">
        Loading…
      </p>
    );
  }
  if (thread.isError || !thread.data || thread.data.length === 0) {
    return (
      <div className="p-4">
        <Alert color="error">
          <AlertContent>
            <AlertTitle>Could not open this conversation</AlertTitle>
            <AlertDescription>
              {socialErrorMessage(thread.error, 'This is a problem reaching the server.')}
            </AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4">
          {root?.permalink ? (
            <a
              href={root.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="text-module inline-flex w-fit items-center gap-0.5 text-sm underline"
            >
              See it on {root.targetName}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
          {thread.data.map((item) => (
            <ThreadMessage key={item.id} item={item} />
          ))}
        </div>
      </div>

      <div className="border-base-300 flex flex-col gap-2 border-t p-4">
        {canReply ? (
          <>
            <Textarea
              color="module"
              rows={3}
              value={draft}
              placeholder="Write a reply…"
              aria-label="Your reply"
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                color="module"
                disabled={draft.trim().length === 0 || reply.isPending}
                loading={reply.isPending}
                onClick={send}
              >
                <Send className="size-4" aria-hidden />
                Send reply
              </Button>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={archiving}
                onClick={() => {
                  onArchive(archived ? 'open' : 'archived');
                }}
              >
                {archived ? (
                  <>
                    <RotateCcw className="size-4" aria-hidden />
                    Put back in the inbox
                  </>
                ) : (
                  <>
                    <Archive className="size-4" aria-hidden />
                    Nothing to do
                  </>
                )}
              </Button>
            </div>
            <Text className="text-sm">
              Your reply is posted publicly on {root?.targetName}, as your business.
            </Text>
          </>
        ) : (
          <Text className="text-sm">
            Replying needs an editor or admin role. Ask a teammate with those permissions.
          </Text>
        )}
      </div>
    </div>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function SocialInboxSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const viewer = useViewer();
  const overview = useSocialOverview();
  const [status, setStatus] = useState<'open' | 'replied' | 'archived'>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filter = useMemo<InboxFilter>(() => ({ status }), [status]);
  const items = useInbox(filter);
  const setItemStatus = useSetInboxItemStatus();

  const canReply = canCompose(viewer.data?.role);
  const catalogMap = useMemo(
    () => catalogByPlatform(overview.data?.catalog ?? []),
    [overview.data]
  );

  useEffect(() => {
    ctx.setTitle('Inbox');
  }, [ctx]);

  // Keep a selection that still exists in the current filter; otherwise fall to the
  // first row, so switching tabs lands on something rather than an empty right pane.
  const list = items.data ?? [];
  const selected = list.find((i) => i.id === selectedId) ?? list[0] ?? null;

  const archive = (nextStatus: 'open' | 'archived') => {
    if (!selected) return;
    setItemStatus.mutate(
      { id: selected.id, status: nextStatus },
      {
        onSuccess: () => {
          toast.add({
            title: nextStatus === 'archived' ? 'Moved out of the inbox' : 'Back in the inbox',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not change that',
            description: socialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Inbox controls"
        controls={
          <>
            <Inbox className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              Inbox
            </Heading>
            <ToggleGroup
              color="module"
              size="sm"
              value={[status]}
              aria-label="Which messages to show"
              onValueChange={(value: string[]) => {
                const next = value[value.length - 1];
                if (next) setStatus(next as 'open' | 'replied' | 'archived');
              }}
            >
              {STATUS_FILTERS.map((f) => (
                <ToggleGroupItem key={f.value} value={f.value}>
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={items.isFetching}
            updatedAt={items.data ? items.dataUpdatedAt : undefined}
            onRefresh={() => {
              void items.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {items.isError ? (
          <PaneLoadError
            icon={<ServerCrash className="size-6" aria-hidden />}
            title="Could not load your inbox"
            description={socialErrorMessage(
              items.error,
              'This is a problem reaching the server. Nothing has changed.'
            )}
            onRetry={() => {
              void items.refetch();
            }}
          />
        ) : items.isPending ? (
          <p className="p-4 text-base" role="status">
            Loading…
          </p>
        ) : list.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<Inbox className="size-6" aria-hidden />}
              title={status === 'open' ? 'Nothing waiting for a reply' : 'Nothing here'}
              description={
                status === 'open'
                  ? 'Comments on your posts, mentions and reviews land here so you can answer them without leaving sparx.'
                  : 'Nothing in this view yet.'
              }
            />
          </div>
        ) : (
          // Two panes on a wide screen; on a narrow one the list stacks above the
          // conversation, so the whole thing still works on a phone.
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            <div className="border-base-300 min-h-0 shrink-0 overflow-y-auto border-b lg:w-[380px] lg:border-r lg:border-b-0">
              <ul>
                {list.map((item) => (
                  <InboxRow
                    key={item.id}
                    item={item}
                    active={selected?.id === item.id}
                    platformLabel={platformName(item.platform, catalogMap)}
                    onOpen={() => {
                      setSelectedId(item.id);
                    }}
                  />
                ))}
              </ul>
            </div>

            <div className="min-h-0 min-w-0 flex-1">
              {selected ? (
                <Conversation
                  key={selected.id}
                  itemId={selected.id}
                  canReply={canReply}
                  onArchive={archive}
                  archiving={setItemStatus.isPending}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SocialInboxSurface;
