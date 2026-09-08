'use client';

// Sample data — fill the account with realistic made-up records to try things
// out before the real ones exist, and remove them again on request.
//
// A singleton PANE. The two operations are REAL and consequential — load stamps
// a full cross-module dataset, clear deletes every sample row — so both sit
// behind a confirm that names the scope in plain words, and the destructive one
// gets a quiet plain row after the work rather than equal weight beside the
// positive action.
//
// One centred column: this is a status and two actions, not a form. The counts
// are the evidence that something real happened, so when data is loaded they are
// shown as the body of the screen.

import { useEffect } from 'react';
import { Badge, Button, Heading, Text, useToast } from '@wizeworks/silicaui-react';
import { Database, FlaskConical, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  COUNT_LABELS,
  countsTotal,
  moduleHue,
  moduleLabel,
  summarizeCounts,
  useClearSampleData,
  useLoadSampleData,
  useSampleDataStatus,
  type SampleDataCounts,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

function ModuleChip({ slug }: { slug: string }) {
  return (
    <ModuleScope module={moduleHue(slug)} className="inline-flex">
      <Badge color="module" variant="soft" size="sm">
        {moduleLabel(slug)}
      </Badge>
    </ModuleScope>
  );
}

/** The non-zero counts as a grid of small figures — the proof that real records
 *  exist. Zeroes are dropped so the grid shows what is there, not a wall of 0s. */
function CountsGrid({ counts }: { counts: SampleDataCounts }) {
  const present = COUNT_LABELS.filter(({ key }) => (counts[key] || 0) > 0);
  return (
    <div className="grid grid-cols-2 gap-2 @sm:grid-cols-3">
      {present.map(({ key, label }) => (
        <div key={key} className="border-base-300 flex flex-col gap-0.5 rounded-lg border p-3">
          <span className="text-2xl font-semibold tabular-nums">{String(counts[key])}</span>
          <span className="text-sm">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function SampleDataSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSampleDataStatus();
  const load = useLoadSampleData();
  const clear = useClearSampleData();

  useEffect(() => {
    ctx.setTitle('Sample data');
  }, [ctx]);

  const busy = load.isPending || clear.isPending;
  // A load/clear in flight is real work the operator should be warned about
  // before closing — it is a running job, not just an edited field.
  useDirtySource(busy, 'Sample data is still being changed. Close anyway?');

  if (isError) {
    return (
      <PaneLoadError
        title="Could not load the sample-data status"
        description="This is a problem reaching the server. Any sample data you have is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const loaded = data?.loaded ?? false;
  const modules = data?.modules ?? [];

  const onLoad = async () => {
    if (!data) return;
    const scope = modules.length > 0 ? modules.map(moduleLabel).join(', ') : 'your account';
    const ok = await confirm({
      title: loaded ? 'Replace the sample data with a fresh set?' : 'Load sample data?',
      description: loaded
        ? `This clears the current sample records and stamps a fresh ${data.packLabel.toLowerCase()} set across ${scope}. Every record it adds is marked as a sample, and none of your real records are touched.`
        : `This fills ${scope} with a full, realistic ${data.packLabel.toLowerCase()} set — products, customers, orders and more — so you can see how sparx works with real-looking records. Everything it adds is clearly marked as a sample and can be removed in one step.`,
      confirmLabel: loaded ? 'Replace it' : 'Load sample data',
      cancelLabel: 'Not now',
      color: 'primary',
    });
    if (!ok) return;

    load.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title: 'Sample data loaded',
          description: `Added ${summarizeCounts(result.counts)}.`,
          type: 'success',
        });
      },
      onError: () => {
        toast.add({
          title: 'Could not load sample data',
          description: 'Nothing was changed. Try again in a moment.',
          type: 'error',
        });
      },
    });
  };

  const onClear = async () => {
    if (!data) return;
    const ok = await confirm({
      title: 'Remove all sample data?',
      description: `This permanently deletes the ${summarizeCounts(
        data.counts
      )} that were added as samples. Your real records are not touched, and this cannot be undone.`,
      confirmLabel: 'Remove sample data',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;

    clear.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title: 'Sample data removed',
          description: `Removed ${summarizeCounts(result.counts)}.`,
          type: 'success',
        });
      },
      onError: () => {
        toast.add({
          title: 'Could not remove sample data',
          description: 'Nothing was changed. Try again in a moment.',
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Sample data actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={load.isPending}
            disabled={busy}
            onClick={() => {
              void onLoad();
            }}
          >
            <Database className="size-4" aria-hidden />
            {load.isPending
              ? loaded
                ? 'Replacing…'
                : 'Loading…'
              : loaded
                ? 'Reload sample data'
                : 'Load sample data'}
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level={1} className="text-2xl font-semibold">
                  Sample data
                </Heading>
                <Badge color={loaded ? 'success' : 'neutral'} variant="soft" size="sm">
                  {loaded ? 'Loaded' : 'Not loaded'}
                </Badge>
              </div>
              <Text>
                Fill your account with realistic made-up records so you can try things out before
                your real ones exist. Everything added is clearly marked as a sample, and you can
                remove it all whenever you like.
              </Text>
            </div>

            <FormSection
              title={loaded ? "What's loaded now" : 'What would be added'}
              description={
                data.packSummary ||
                `A ${data.packLabel} set built to show sparx working with real-looking records.`
              }
            >
              {modules.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <Text className="text-sm">
                    {loaded
                      ? 'Sample records are in place across:'
                      : 'A load would fill the parts of sparx you have switched on:'}
                  </Text>
                  <div className="flex flex-wrap gap-1.5">
                    {modules.map((slug) => (
                      <ModuleChip key={slug} slug={slug} />
                    ))}
                  </div>
                </div>
              ) : (
                <Text className="text-sm">
                  You have no matching parts of sparx switched on yet, so a load would add only a
                  small baseline. Switch on a module like the online store or bookings first to get
                  a fuller set.
                </Text>
              )}

              {loaded ? (
                countsTotal(data.counts) > 0 ? (
                  <CountsGrid counts={data.counts} />
                ) : null
              ) : (
                <Text className="text-sm">
                  Nothing is loaded right now. Loading is safe to undo — one click removes every
                  sample record and leaves your real ones exactly as they are.
                </Text>
              )}
            </FormSection>

            {/* Destructive action: a quiet row after the work, under a divider —
                never a card competing with the positive action above it. */}
            {loaded ? (
              <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="flex min-w-0 flex-col">
                  <span className="text-base font-medium">Remove all sample data</span>
                  <Text className="text-sm">
                    Deletes every sample record. Your real records are left untouched.
                  </Text>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  color="error"
                  loading={clear.isPending}
                  disabled={busy}
                  onClick={() => {
                    void onClear();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remove sample data
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <p className="shrink-0 px-1 text-xs">
        <FlaskConical className="mr-1 inline size-3 align-[-2px]" aria-hidden />
        Sample records are marked behind the scenes, so removing them never catches your real data.
      </p>
    </div>
  );
}
