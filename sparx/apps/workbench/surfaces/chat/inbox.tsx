'use client';

// The inbox — every conversation with someone on your site, newest activity
// first.
//
// Per-SITE by default (docs/131 §3.7): the queue you open is the site you are
// working in, because a donut shop's owner should never triage a machine shop's
// chats. "All sites" widens it, and only then does each row say which site the
// conversation happened on — on a single-site queue that column would repeat the
// same name down the page.
//
// Deliberately a list of rows, not a table: a conversation's content is a person
// and the last thing they said, and a preview line reads far better stacked under
// the name than crammed into a cell. Each row is a real <button> so it is
// keyboard-reachable; opening one docks the thread BESIDE this list so the queue
// never leaves the screen.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  SearchInput,
} from '@wizeworks/silicaui-react';
import { Globe, Inbox, UserCheck } from 'lucide-react';
import { useSites } from '../../lib/api/shell-data';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { describeAgo } from '../../lib/api/activity';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  conversationName,
  statusLabel,
  statusTone,
  useConversations,
  type ConversationStatus,
  type ConversationSummary,
} from './data';
import { useChatLive } from './live';
import { RowOpenHint } from '../../components/row-open-hint';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const STATUS_FILTERS: { value: string; label: string; status?: ConversationStatus }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open', status: 'open' },
  { value: 'pending', label: 'Waiting', status: 'pending' },
  { value: 'resolved', label: 'Resolved', status: 'resolved' },
  { value: 'spam', label: 'Spam', status: 'spam' },
];

function ConversationRow({
  conversation,
  siteName,
  onOpen,
}: {
  conversation: ConversationSummary;
  /** Set only in all-sites mode — the site's name to show on the row. */
  siteName: string | null;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const name = conversationName(conversation);
  const hasUnread = conversation.unreadStaff > 0;
  const when = conversation.lastMessageAt ?? conversation.createdAt;

  return (
    <li className="border-base-300 border-b last:border-b-0">
      <button
        type="button"
        className="hover:bg-base-200 flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={onOpen}
      >
        {/* An unread dot in a fixed-width gutter, so every row's text starts on
            the same line whether or not it has one. */}
        <span className="flex w-2 shrink-0 justify-center pt-2">
          {hasUnread ? (
            <span className="bg-module size-2 rounded-full" aria-label="Unread" />
          ) : null}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`min-w-0 truncate ${hasUnread ? 'font-semibold' : 'font-medium'}`}>
              {name}
            </span>
            {conversation.subject ? (
              <span className="min-w-0 truncate text-sm">· {conversation.subject}</span>
            ) : null}
            {siteName ? (
              <Badge color="neutral" variant="outline" size="sm">
                {siteName}
              </Badge>
            ) : null}
          </span>
          {conversation.lastMessageSnippet ? (
            <span className="line-clamp-1 text-sm">{conversation.lastMessageSnippet}</span>
          ) : (
            <span className="text-sm italic">No messages yet</span>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <Badge color={statusTone(conversation.status)} variant="soft" size="sm">
            {statusLabel(conversation.status)}
          </Badge>
          <span className="flex items-center gap-1 text-xs whitespace-nowrap">
            {conversation.assignedToId ? (
              <UserCheck className="size-3" aria-label="Assigned" />
            ) : null}
            {describeAgo(when)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function ChatInboxSurface({ ctx }: { ctx: SurfaceContext }) {
  // Hold the chat socket open while the inbox is on screen: every staff socket
  // joins the tenant room, so new conversations and unread counts arrive live
  // here even before a thread is opened.
  useChatLive();

  const [search, setSearch] = useState('');
  const [statusValue, setStatusValue] = useState('all');
  const [mine, setMine] = useState(false);
  const [allSites, setAllSites] = useState(false);

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const { data: sites } = useSites();

  const activeStatus = STATUS_FILTERS.find((entry) => entry.value === statusValue);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useConversations({
    ...(allSites ? { property: 'all' } : {}),
    status: activeStatus?.status,
    mine,
    q: search.trim() || undefined,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = statusValue !== 'all' || mine || search.trim() !== '';

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites ?? []) map.set(site.id, site.name);
    return map;
  }, [sites]);

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (
    conversation: ConversationSummary,
    event: { shiftKey: boolean; altKey: boolean }
  ) => {
    ctx.open('chat.inbox.thread', { id: conversation.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Inbox controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search conversations"
              placeholder="Name, email or subject…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        controls={
          <>
            <Filter
              color="module"
              value={statusValue}
              onValueChange={(next) => {
                setStatusValue((next as string | null) ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((entry) => (
                <FilterItem key={entry.value} value={entry.value}>
                  {entry.label}
                </FilterItem>
              ))}
            </Filter>
            {/* Two scope toggles, phrased as questions the operator actually asks:
            "just mine?" and "across all my sites?". Soft-filled when on so the
            active scope reads at a glance. */}
            <Button
              size="sm"
              variant={mine ? 'soft' : 'ghost'}
              color={mine ? 'module' : 'neutral'}
              aria-pressed={mine}
              className="shrink-0"
              onClick={() => {
                setMine((v) => !v);
                resetWindow();
              }}
            >
              <UserCheck className="size-4" aria-hidden />
              Mine
            </Button>
            <Button
              size="sm"
              variant={allSites ? 'soft' : 'ghost'}
              color={allSites ? 'module' : 'neutral'}
              aria-pressed={allSites}
              className="shrink-0"
              title="Show conversations from every one of your sites"
              onClick={() => {
                setAllSites((v) => !v);
                resetWindow();
              }}
            >
              <Globe className="size-4" aria-hidden />
              All sites
            </Button>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title="Could not load your conversations"
            description="This is a problem reaching the server. Your conversations are unaffected — nothing has been lost."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading conversations…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title={filtered ? 'No conversations match that' : 'No conversations yet'}
            description={
              filtered
                ? 'Try a different status, turn off “Mine”, or clear the search. Turn on “All sites” to look across every site you run.'
                : 'When someone starts a chat on your site, it shows up here so you can reply. Add the chat box to your site from Chat settings.'
            }
          />
        ) : (
          <ul>
            {rows.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                siteName={
                  allSites && conversation.propertyId
                    ? (siteNameById.get(conversation.propertyId) ?? null)
                    : null
                }
                onOpen={(event) => {
                  open(conversation, event);
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        <RowOpenHint />
      </div>
    </div>
  );
}
