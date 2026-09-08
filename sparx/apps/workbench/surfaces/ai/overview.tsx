'use client';

// AI overview — the home for the one thing this module is: a private bridge that
// lets the owner's OWN AI app (Claude, ChatGPT, Microsoft Copilot) work with
// their live business data.
//
// So this is a usage home, not a teaching essay. It shows how that connection is
// being used — how much connected apps have called, how often it worked, which
// tools they reach for, and the latest calls — then how to set one up. Every
// figure is a LIVE aggregate the backend already computes over the audit trail;
// nothing is fabricated, and where there is no traffic yet a section says so
// plainly rather than showing zeros dressed as data.
//
// The two AI *concepts* must never blur, so the page ends by mapping the two
// areas apart in one line each: Instructions (sparx writing for you with your own
// AI account) and Permissions (an app you connect acting in your
// business). Connecting an app / issuing a key lives in AI connections
// (platform.settings.ai), which every call-to-action here opens. Read-only and
// viewer-safe.

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import {
  ArrowRight,
  Clock,
  KeyRound,
  PenLine,
  Plug,
  Server,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { UsageChart } from './usage-chart';
import {
  formatCount,
  formatPercent,
  humanizeTool,
  isFailedOutcome,
  useAiActivity,
  useAiSummary,
  useAiTimeseries,
  useAiTopTools,
  type AiActivityItem,
  type AiTopTool,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';
const CONNECTIONS_SURFACE = 'platform.settings.ai';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A proportion as one of a fixed set of literal width classes — an inline
 *  `style={{ width }}` is banned, and a 5% step is a pixel or two on a short
 *  bar. Same pattern the chat overview uses. */
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

// The three steps every AI app follows to connect — plain-language, no jargon
// except the one word ("MCP") the owner will see inside their own AI app.
const CONNECT_STEPS: { title: string; body: string }[] = [
  {
    title: 'Create a key',
    body: 'In AI connections, make a key that says exactly what an app may see and change.',
  },
  {
    title: 'Add sparx to your AI app',
    body: 'Paste the key into your app as an MCP connection — the standard way AI apps plug into other services.',
  },
  {
    title: 'Put it to work',
    body: 'Ask your app about your orders, customers, or products. Everything it does shows up here.',
  },
];

export function AiOverviewSurface({ ctx }: { ctx: SurfaceContext }) {
  const summary = useAiSummary();
  const timeseries = useAiTimeseries();
  const topTools = useAiTopTools();
  const activity = useAiActivity();

  const refreshAll = () => {
    void summary.refetch();
    void timeseries.refetch();
    void topTools.refetch();
    void activity.refetch();
  };

  const open = (surface: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(surface, {}, { target: targetFor(event) });
  };

  // A connected app reports the raw tool name (e.g. `publish_silica_site`); show a
  // short, humanised label. The tool-policy DESCRIPTIONS are full developer
  // paragraphs — fine on the Permissions screen, unreadable in a compact row here.
  const labelFor = (tool: string): string => humanizeTool(tool);

  const points = timeseries.data?.points ?? [];
  const hasVolume = (timeseries.data?.totals.requests ?? 0) > 0;
  const tools = topTools.data ?? [];
  const feed = activity.data ?? [];
  const topCalls = tools.length > 0 ? Math.max(...tools.map((t) => t.calls)) : 0;

  const body = () => {
    if (summary.isError) {
      return (
        <PaneLoadError
          icon={<Server className="size-6" aria-hidden />}
          title="Could not load your AI usage"
          description="This is a problem reaching the server. Your connected apps and keys are unaffected."
          onRetry={() => {
            void summary.refetch();
          }}
        />
      );
    }

    if (summary.isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading your AI usage…
        </p>
      );
    }

    const s = summary.data;
    const keysHint =
      s.apiKeysTotal === 0
        ? 'No keys yet'
        : `${formatCount(s.apiKeysActive)} active · ${formatCount(s.apiKeysTotal)} total`;

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            AI overview
          </Heading>
          <Text>
            Connect your own AI app — Claude, ChatGPT, or Microsoft Copilot — so it can work with
            your live business data. This page shows how that connection is being used, and helps
            you set one up.
          </Text>
        </div>

        {/* Headline usage — live from the summary; 0 is a real number, so no
            dashes here once the summary has loaded. */}
        <section className="card bg-base-100">
          <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @lg:grid-cols-2 @3xl:grid-cols-4">
            <Stat>
              <StatTitle>Requests · 30 days</StatTitle>
              <StatValue className="text-2xl tabular-nums">{formatCount(s.mcpRequests)}</StatValue>
              <StatDesc>across every connected app</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Worked as asked</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatPercent(s.successRate)}
              </StatValue>
              <StatDesc>of calls in the last 30 days</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Tools used</StatTitle>
              <StatValue className="text-2xl tabular-nums">{formatCount(s.uniqueTools)}</StatValue>
              <StatDesc>different tools called · 30 days</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Keys in use</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {formatCount(s.apiKeysActive)}
              </StatValue>
              <StatDesc>{keysHint}</StatDesc>
            </Stat>
          </Stats>
        </section>

        {/* Usage over time */}
        <section className="card bg-base-100 flex flex-col gap-3 p-4">
          <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
            <Heading level={2} className="text-lg font-semibold">
              How much your connected apps have worked
            </Heading>
            <Text className="text-sm">Requests each day over the last 30 days.</Text>
          </div>
          {timeseries.isPending ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : hasVolume ? (
            <UsageChart points={points} />
          ) : (
            <EmptyState
              icon={<Server className="size-5" aria-hidden />}
              title="No activity yet"
              description="This fills in once a connected app starts working with your data. Connect one below to begin."
            />
          )}
        </section>

        <div className="grid gap-4 @3xl:grid-cols-2">
          {/* Recent activity */}
          <section className="card bg-base-100 flex flex-col overflow-hidden">
            <header className="border-base-300 flex flex-col gap-0.5 border-b px-4 py-3">
              <Heading level={2} className="text-base font-semibold">
                Latest activity
              </Heading>
              <Text className="text-sm">The most recent things your connected apps did.</Text>
            </header>
            {activity.isPending ? (
              <p className="p-4 text-sm" role="status">
                Loading…
              </p>
            ) : feed.length === 0 ? (
              <div className="p-4">
                <Text className="text-sm">
                  Nothing yet — this shows a live trail once an app connects.
                </Text>
              </div>
            ) : (
              <ul>
                {feed.map((item) => (
                  <ActivityRow key={item.id} item={item} label={labelFor(item.tool)} />
                ))}
              </ul>
            )}
          </section>

          {/* Top tools */}
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
              <Heading level={2} className="text-base font-semibold">
                Most-used tools
              </Heading>
              <Text className="text-sm">What your connected apps reach for most.</Text>
            </div>
            {topTools.isPending ? (
              <p className="text-sm" role="status">
                Loading…
              </p>
            ) : tools.length === 0 ? (
              <Text className="text-sm">No tools have been used yet.</Text>
            ) : (
              <div className="flex flex-col gap-3">
                {tools.map((tool) => (
                  <TopToolRow
                    key={tool.tool}
                    tool={tool}
                    label={labelFor(tool.tool)}
                    max={topCalls}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Connect an AI app — the page's call to action and empty-state hero. */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="bg-module soft flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Plug className="text-module size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col">
              <Heading level={2} className="text-lg font-semibold">
                Connect your AI app
              </Heading>
              <Text className="text-sm">Three steps, and your app is working with your data.</Text>
            </div>
          </div>

          <ol className="grid gap-4 @xl:grid-cols-3">
            {CONNECT_STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="bg-module text-module-content flex size-6 items-center justify-center rounded-full text-sm font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <Text as="span" className="font-medium">
                    {step.title}
                  </Text>
                </div>
                <Text className="text-sm">{step.body}</Text>
              </li>
            ))}
          </ol>

          <div className="border-base-300 flex flex-wrap items-center gap-3 border-t pt-3">
            <Button
              color="module"
              size="sm"
              onClick={(event) => {
                open(CONNECTIONS_SURFACE, event);
              }}
            >
              {s.apiKeysTotal > 0 ? 'Open AI connections' : 'Create your first key'}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <div className="flex items-start gap-2">
              <ShieldCheck className="text-module mt-0.5 size-4 shrink-0" aria-hidden />
              <Text className="text-sm">
                Keys are limited and can be switched off, so an app only ever does what you allow.
              </Text>
            </div>
          </div>
        </Card>

        {/* Map the two areas apart — the whole anti-confusion point, in one line
            each. These are the two different ways AI touches the business. */}
        <div className="grid gap-4 @3xl:grid-cols-2">
          <AreaLink
            icon={<PenLine className="text-module size-5" aria-hidden />}
            title="Instructions"
            description="The voice and rules sparx follows when it writes for you using your own AI account — like your site's chat personality."
            cta="Open Instructions"
            onOpen={(event) => {
              open('ai.prompts', event);
            }}
          />
          <AreaLink
            icon={<Wrench className="text-module size-5" aria-hidden />}
            title="Permissions"
            description="What an AI app you've connected may look up or change in your business — switch off anything it shouldn't reach."
            cta="Open Permissions"
            onOpen={(event) => {
              open('ai.tools', event);
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="AI overview controls"
        primary={
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            className="ml-auto shrink-0"
            onClick={(event) => {
              open(CONNECTIONS_SURFACE, event);
            }}
          >
            <KeyRound className="size-4" aria-hidden />
            AI connections
          </Button>
        }
        controls={
          <>
            <Badge color="success" variant="soft" size="sm">
              <span className="bg-success mr-1 inline-block size-2 rounded-full" aria-hidden />
              Bridge online
            </Badge>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={
              summary.isFetching ||
              timeseries.isFetching ||
              topTools.isFetching ||
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

/* ── Rows ──────────────────────────────────────────────────────────────────── */

function ActivityRow({ item, label }: { item: AiActivityItem; label: string }) {
  const failed = isFailedOutcome(item.outcome);
  return (
    <li className="border-base-300 flex items-start gap-3 border-b px-4 py-2.5 last:border-b-0">
      <Clock className="text-module mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate font-medium">{label}</span>
          {failed ? (
            <Badge color="error" variant="soft" size="sm">
              Failed
            </Badge>
          ) : null}
        </span>
        <span className="text-sm">
          <Timestamp value={item.createdAt} format="relative" />
        </span>
      </span>
    </li>
  );
}

function TopToolRow({ tool, label, max }: { tool: AiTopTool; label: string; max: number }) {
  const fraction = max > 0 ? tool.calls / max : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <Text className="min-w-0 truncate text-sm font-medium">{label}</Text>
        <Text className="shrink-0 text-sm tabular-nums">
          {formatCount(tool.calls)} · {formatPercent(tool.successRate)} ok
        </Text>
      </div>
      <div className="bg-base-200 h-2 w-full overflow-hidden rounded-full">
        <div className={`bg-module h-full rounded-full ${barWidthClass(fraction)}`} />
      </div>
    </div>
  );
}

/* ── The two-areas map card ────────────────────────────────────────────────── */

function AreaLink({
  icon,
  title,
  description,
  cta,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span className="bg-module soft flex size-10 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </span>
        <Heading level={2} className="text-lg font-semibold">
          {title}
        </Heading>
      </div>
      <Text className="text-sm">{description}</Text>
      <div className="mt-auto">
        <Button color="module" variant="soft" size="sm" onClick={onOpen}>
          {cta}
        </Button>
      </div>
    </Card>
  );
}
