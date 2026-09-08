'use client';

// Messages overview — the reporting landing for the chat module.
//
// One read of "how is the conversation load, and who is carrying it": headline
// figures, the volume trend, the split between what AI handled and what a person
// did, where conversations come from, how the team is responding, and a live feed
// of the latest messages. A reporting surface, not a list — stat cards and
// read-only sections in one capped, centred column, like Search performance.
//
// Every figure is a LIVE aggregate the backend already computes over the last 30
// days; nothing here is fabricated. When there is genuinely nothing yet, it says
// so rather than showing a wall of zeros dressed up as data.

import { useMemo } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { MessageCircle, Sparkles, UserRound } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { VolumeChart } from './volume-chart';
import {
  formatCount,
  formatDuration,
  formatPct,
  sourceLabel,
  useChatActivity,
  useChatAgents,
  useChatSummary,
  useChatTimeseries,
  type ChatActivityItem,
  type ChatSource,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A proportion as one of a fixed set of literal width classes — an inline
 *  `style={{ width }}` is banned, and a 5% step is a pixel or two on a short
 *  bar. */
const BAR_WIDTH = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
];

function barWidthClass(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return BAR_WIDTH[0]!;
  const step = Math.round(Math.min(1, fraction) * 20);
  return BAR_WIDTH[step] ?? BAR_WIDTH[BAR_WIDTH.length - 1]!;
}

function ProportionRow({
  label,
  count,
  total,
  tint,
}: {
  label: string;
  count: number;
  total: number;
  /** A literal bar-fill class, e.g. 'bg-module'. */
  tint: string;
}) {
  const fraction = total > 0 ? count / total : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <Text className="text-sm font-medium">{label}</Text>
        <Text className="text-sm tabular-nums">
          {formatCount(count)} · {formatPct(fraction)}
        </Text>
      </div>
      <div className="bg-base-200 h-2 w-full overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${tint} ${barWidthClass(fraction)}`} />
      </div>
    </div>
  );
}

function ActivityRow({
  item,
  onOpen,
}: {
  item: ChatActivityItem;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const isAi = item.senderType === 'ai' || item.aiGenerated;
  const isCustomer = item.senderType === 'customer';
  return (
    <li className="border-base-300 border-b last:border-b-0">
      <button
        type="button"
        className="hover:bg-base-200 flex w-full items-start gap-3 px-4 py-2.5 text-left"
        onClick={onOpen}
      >
        <span className="mt-0.5 shrink-0">
          {isAi ? (
            <Sparkles className="text-info size-4" aria-hidden />
          ) : isCustomer ? (
            <MessageCircle className="text-module size-4" aria-hidden />
          ) : (
            <UserRound className="size-4" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{item.who}</span>
            <span className="shrink-0 text-sm">
              <Timestamp value={item.createdAt} format="relative" />
            </span>
          </span>
          <span className="line-clamp-1 text-sm">{item.snippet}</span>
        </span>
      </button>
    </li>
  );
}

export function ChatOverviewSurface({ ctx }: { ctx: SurfaceContext }) {
  const summary = useChatSummary();
  const timeseries = useChatTimeseries();
  const agents = useChatAgents();
  const activity = useChatActivity();

  const refreshAll = () => {
    void summary.refetch();
    void timeseries.refetch();
    void agents.refetch();
    void activity.refetch();
  };

  const resolvedClassified = useMemo(() => {
    const s = summary.data;
    return s ? s.aiResolved + s.humanResolved : 0;
  }, [summary.data]);

  const channelTotal = useMemo(
    () => (summary.data?.byChannel ?? []).reduce((sum, c) => sum + c.count, 0),
    [summary.data]
  );

  const hasData = (summary.data?.startedInRange ?? 0) > 0 || (summary.data?.openNow ?? 0) > 0;

  const openThread = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('chat.inbox.thread', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (summary.isError) {
      return (
        <PaneLoadError
          icon={<MessageCircle className="size-6" aria-hidden />}
          title="Could not load your chat report"
          description="This is a problem reaching the server. Your conversations are unaffected."
          onRetry={() => {
            void summary.refetch();
          }}
        />
      );
    }

    if (summary.isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading your chat report…
        </p>
      );
    }

    if (!hasData) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState
            className="max-w-md"
            icon={<MessageCircle className="size-6" aria-hidden />}
            title="No conversations to report on yet"
            description="Once people start chatting on your site, this page fills in with how many conversations you get, how fast you reply, and who is handling them."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={(event) => {
                  ctx.open('chat.inbox', {}, { target: targetFor(event) });
                }}
              >
                Open the inbox
              </Button>
            }
          />
        </div>
      );
    }

    const s = summary.data;

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            Messages overview
          </Heading>
          <Text>
            How busy your live chat has been over the last 30 days, and who has been handling it.
          </Text>
        </div>

        <section className="card bg-base-100">
          <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @lg:grid-cols-2 @3xl:grid-cols-4">
            <Stat>
              <StatTitle>Conversations started</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatCount(s.startedInRange)}
              </StatValue>
              <StatDesc>in the last 30 days</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Resolved</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatCount(s.resolvedInRange)}
              </StatValue>
              <StatDesc>closed out in the same period</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Open now</StatTitle>
              <StatValue className="text-2xl tabular-nums">{formatCount(s.openNow)}</StatValue>
              <StatDesc>waiting for a reply</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Average first reply</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatDuration(s.avgFirstResponseSeconds)}
              </StatValue>
              <StatDesc>how fast the first response goes out</StatDesc>
            </Stat>
          </Stats>
        </section>

        <section className="card bg-base-100 flex flex-col gap-3 p-4">
          <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
            <Heading level={2} className="text-lg font-semibold">
              Conversation volume
            </Heading>
            <Text className="text-sm">
              How many conversations started and were resolved each day.
            </Text>
          </div>
          {timeseries.isPending ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : (timeseries.data?.points ?? []).length === 0 ? (
            <Text className="text-sm">No conversations recorded in this period yet.</Text>
          ) : (
            <VolumeChart points={timeseries.data?.points ?? []} />
          )}
        </section>

        <div className="grid gap-4 @3xl:grid-cols-2">
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
              <Heading level={2} className="text-lg font-semibold">
                Who resolved them
              </Heading>
              <Text className="text-sm">
                Of the {formatCount(resolvedClassified)} resolved, how many the assistant closed on
                its own.
              </Text>
            </div>
            {resolvedClassified === 0 ? (
              <Text className="text-sm">Nothing has been resolved in this period yet.</Text>
            ) : (
              <div className="flex flex-col gap-3">
                <ProportionRow
                  label="Handled by AI"
                  count={s.aiResolved}
                  total={resolvedClassified}
                  tint="bg-info"
                />
                <ProportionRow
                  label="Handled by your team"
                  count={s.humanResolved}
                  total={resolvedClassified}
                  tint="bg-module"
                />
                <Text className="text-sm">
                  The assistant handled {formatPct(s.aiHandledPct)} of resolved conversations.
                </Text>
              </div>
            )}
          </section>

          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
              <Heading level={2} className="text-lg font-semibold">
                Where they come from
              </Heading>
              <Text className="text-sm">Which part of your presence people are chatting from.</Text>
            </div>
            {s.byChannel.length === 0 ? (
              <Text className="text-sm">No conversations recorded in this period yet.</Text>
            ) : (
              <div className="flex flex-col gap-3">
                {s.byChannel.map((channel) => (
                  <ProportionRow
                    key={channel.source}
                    label={sourceLabel(channel.source as ChatSource)}
                    count={channel.count}
                    total={channelTotal}
                    tint="bg-module"
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="card bg-base-100 flex flex-col gap-3 p-4">
          <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
            <Heading level={2} className="text-lg font-semibold">
              Who is responding
            </Heading>
            <Text className="text-sm">
              Everyone who answered first on a conversation, and how quickly.
            </Text>
          </div>
          {agents.isPending ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : (agents.data ?? []).length === 0 ? (
            <Text className="text-sm">
              Nobody has responded to a conversation in this period yet.
            </Text>
          ) : (
            <Table size="sm">
              <thead>
                <tr>
                  <th>Responder</th>
                  <th className="text-right whitespace-nowrap">Handled</th>
                  <th className="text-right whitespace-nowrap">Avg reply</th>
                </tr>
              </thead>
              <tbody>
                {(agents.data ?? []).map((agent) => (
                  <tr key={agent.id ?? agent.kind}>
                    <td>
                      <span className="flex items-center gap-2">
                        {agent.kind === 'ai' ? (
                          <Badge color="info" variant="soft" size="sm">
                            <Sparkles className="size-3" aria-hidden />
                            AI
                          </Badge>
                        ) : null}
                        <span className="truncate">{agent.name}</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{formatCount(agent.handled)}</td>
                    <td className="text-right tabular-nums">
                      {formatDuration(agent.avgResponseSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section className="card bg-base-100 overflow-hidden">
          <header className="border-base-300 flex items-center gap-2 border-b px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Heading level={2} className="text-base font-semibold">
                Latest activity
              </Heading>
              <Text className="text-sm">The most recent messages across your conversations.</Text>
            </div>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={(event) => {
                ctx.open('chat.inbox', {}, { target: targetFor(event) });
              }}
            >
              Open inbox
            </Button>
          </header>
          {activity.isPending ? (
            <p className="p-4 text-sm" role="status">
              Loading…
            </p>
          ) : (activity.data ?? []).length === 0 ? (
            <div className="p-4">
              <Text className="text-sm">No messages yet.</Text>
            </div>
          ) : (
            <ul>
              {(activity.data ?? []).map((item) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  onOpen={(event) => {
                    openThread(item.conversationId, event);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Messages overview controls"
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={
              summary.isFetching ||
              timeseries.isFetching ||
              agents.isFetching ||
              activity.isFetching
            }
            updatedAt={summary.data ? summary.dataUpdatedAt : undefined}
            onRefresh={refreshAll}
          />
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
