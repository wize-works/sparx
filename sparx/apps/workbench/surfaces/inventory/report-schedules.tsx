'use client';

// SEND ME THE FIGURES — standing instructions to email a report (docs/146 Phase 10.4).
//
// ── Why this screen exists at all ────────────────────────────────────────
//
// The reports in this module are good and nobody opens them, because opening
// them means remembering to log in on a Monday morning. A report nobody reads is
// a report that does not exist. The only reliable way to be read is to arrive.
//
// ── What the list has to say, and what it must not hide ──────────────────
//
// Two things kill a schedule quietly: it stops sending, or it sends to a mailbox
// nobody reads. The first is detectable and is shown — a schedule that fails
// four times running is PAUSED, and the row says so with the count, rather than
// showing an off switch nobody remembers touching. The second is not detectable,
// which is why the recipients are on the row rather than behind a click.
//
// A create is a PANE, not a modal: create and edit are the same form, so a modal
// would mean writing it twice forever.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Table,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarClock, Plus, Send } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage } from './data';
import {
  cadenceSentence,
  deliveryStatusLabel,
  deliveryStatusTone,
  useReportSchedules,
  useRunReportSchedule,
  type ReportSchedule,
} from './reporting-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** "Send it now" on a row. Its own component because the mutation is per-id and
 *  a hook cannot be called in a loop from the parent. */
function SendNowButton({ schedule }: { schedule: ReportSchedule }) {
  const toast = useToast();
  const run = useRunReportSchedule(schedule.id);
  return (
    <Button
      color="module"
      variant="soft"
      size="sm"
      disabled={run.isPending}
      onClick={(event) => {
        event.stopPropagation();
        run.mutate(undefined, {
          onSuccess: (result) => {
            afterCommit(() => {
              if (result.status === 'skipped') {
                toast.add({
                  title: 'Nothing to send',
                  description: 'That report came back empty, so no email went out.',
                  type: 'info',
                });
              } else if (result.status === 'failed') {
                toast.add({
                  title: 'Could not send it',
                  description: result.error ?? 'Nothing was delivered.',
                  type: 'error',
                });
              } else {
                toast.add({
                  title: `Sent to ${plural(result.recipients, 'person', 'people')}`,
                  ...(result.rowCount === null
                    ? {}
                    : { description: `${plural(result.rowCount, 'row', 'rows')} in the report.` }),
                  type: 'success',
                });
              }
            });
          },
          onError: (error) => {
            afterCommit(() => {
              toast.add({
                title: 'Could not send it',
                description: stockErrorMessage(error, 'Nothing was delivered.'),
                type: 'error',
              });
            });
          },
        });
      }}
    >
      <Send className="size-4" aria-hidden />
      Send now
    </Button>
  );
}

export function ReportSchedulesSurface({ ctx }: { ctx: SurfaceContext }) {
  const schedules = useReportSchedules();
  const [showPaused, setShowPaused] = useState(true);

  const items = schedules.data?.items ?? [];
  const paused = items.filter((s) => s.pausedByFailures);
  const visible = showPaused ? items : items.filter((s) => !s.pausedByFailures);

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.reports.schedule', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (schedules.isError) {
      return (
        <EmptyState
          icon={<CalendarClock className="size-6" aria-hidden />}
          title="Could not load your scheduled reports"
          description="This is a problem reaching the server. Nothing has stopped sending — the list just could not be loaded."
        />
      );
    }
    if (schedules.isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      );
    }
    if (items.length === 0) {
      return (
        <EmptyState
          icon={<CalendarClock className="size-6" aria-hidden />}
          title="Nothing is being sent to anyone"
          description="Pick a report, say who should get it and how often, and it arrives in their inbox — the spreadsheet attached and the headline numbers in the body. An accountant who wants the month-end valuation does not need a login to receive one."
        >
          <Button
            color="module"
            onClick={() => {
              ctx.open('inventory.reports.schedule', { id: 'new' });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Send a report to someone
          </Button>
        </EmptyState>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {paused.length > 0 ? (
          <Alert color="danger" variant="soft">
            <AlertContent>
              <AlertTitle>
                {plural(paused.length, 'report has', 'reports have')} stopped sending
              </AlertTitle>
              <AlertDescription>
                Each one failed four times in a row and was paused so it would not keep trying into
                a mailbox that is not there. Open it to see why and switch it back on.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <Table hover>
          <thead>
            <tr>
              <th>What gets sent</th>
              <th className="hidden @lg:table-cell">When</th>
              <th className="hidden @xl:table-cell">Who gets it</th>
              <th className="whitespace-nowrap">Next</th>
              <th className="text-right">Last time</th>
              <th className="w-0" />
            </tr>
          </thead>
          <tbody>
            {visible.map((schedule) => (
              <tr
                key={schedule.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(schedule.id, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(schedule.id, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{schedule.name}</span>
                    <span className="truncate text-sm">{schedule.reportLabel}</span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap @lg:table-cell">
                  {cadenceSentence(schedule)}
                </td>
                <td className="hidden max-w-48 truncate @xl:table-cell">
                  {schedule.recipients.join(', ')}
                </td>
                <td className="whitespace-nowrap">
                  {schedule.pausedByFailures ? (
                    <Badge color="danger" variant="soft" size="sm">
                      Stopped after {schedule.consecutiveFailures} failures
                    </Badge>
                  ) : !schedule.isActive ? (
                    <Badge color="neutral" variant="soft" size="sm">
                      Switched off
                    </Badge>
                  ) : schedule.nextRunAt ? (
                    <Timestamp value={schedule.nextRunAt} format="relative" />
                  ) : (
                    <Text className="text-sm">Not scheduled</Text>
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  {schedule.lastRunAt && schedule.lastRunStatus ? (
                    <Badge
                      color={deliveryStatusTone(
                        schedule.lastRunStatus as 'success' | 'partial' | 'failed' | 'skipped'
                      )}
                      variant="soft"
                      size="sm"
                    >
                      {deliveryStatusLabel(
                        schedule.lastRunStatus as 'success' | 'partial' | 'failed' | 'skipped'
                      )}
                    </Badge>
                  ) : (
                    <Text className="text-sm">Never sent</Text>
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  <SendNowButton schedule={schedule} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Scheduled report controls"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            onClick={() => {
              ctx.open('inventory.reports.schedule', { id: 'new' });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Send a report
          </Button>
        }
        controls={
          <>
            {paused.length > 0 ? (
              <Button
                color={showPaused ? 'danger' : 'neutral'}
                variant={showPaused ? 'soft' : 'outline'}
                size="sm"
                onClick={() => {
                  setShowPaused((current) => !current);
                }}
              >
                {showPaused ? 'Hide' : 'Show'} the {paused.length} that stopped
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={schedules.isFetching}
            updatedAt={schedules.data ? schedules.dataUpdatedAt : undefined}
            onRefresh={() => {
              void schedules.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
