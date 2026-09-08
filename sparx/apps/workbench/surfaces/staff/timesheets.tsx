'use client';

// TIMESHEETS — the period grid, and the act that releases the labour deriver.
//
// This screen has ONE job beyond adding up hours: it must show what CANNOT be
// costed as clearly as what can.
//
// A person with fourteen approved hours and no pay rate is not a zero on this
// grid. They are a row that says "no pay rate set", and the period total says
// "so far" rather than pretending to be complete. A zero here becomes a zero in
// the profit figure, and an owner reads that as a month where labour was free —
// which is precisely the confidently-wrong number this whole module exists to
// prevent (docs/149, and the platform's never-present-absence rule).
//
// APPROVAL IS DELIBERATE. It is what pushes wages into the ledger, so it is a
// button somebody presses on purpose rather than something that happens when a
// shift ends. Entries still on the clock are skipped and named, because they
// have no duration yet and approving one would bank a zero.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Heading,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  RefreshCw,
  Users,
} from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  downloadPayrollHours,
  isForbidden,
  staffErrorMessage,
  useDeriveLabor,
  useTimeDecision,
  useTimeEntries,
  useTimesheet,
  type TimesheetRow,
} from './data';
import { formatCostOrNothing, formatMinutes, monthRange, monthShift, periodLabel } from './format';

function PersonRow({
  row,
  selected,
  onToggle,
  onOpen,
}: {
  row: TimesheetRow;
  selected: boolean;
  onToggle: (next: boolean) => void;
  onOpen: () => void;
}) {
  const unpriced = row.unpricedMinutes > 0;
  const waiting = row.submittedMinutes > 0;

  return (
    <tr>
      <td className="w-8">
        <Checkbox
          color="module"
          aria-label={`Select ${row.name}'s hours`}
          checked={selected}
          disabled={!waiting}
          onChange={(event) => {
            onToggle(event.target.checked);
          }}
        />
      </td>
      <td className="max-w-48 min-w-0">
        <button type="button" className="link truncate text-left font-medium" onClick={onOpen}>
          {row.name}
        </button>
        {row.openEntries > 0 ? (
          <div className="mt-1">
            <Badge color="info" size="sm">
              <Clock className="size-3.5" aria-hidden />
              {row.openEntries === 1
                ? 'Still clocked in'
                : `${String(row.openEntries)} clocks open`}
            </Badge>
          </div>
        ) : null}
      </td>
      <td className="tabular-nums">{formatMinutes(row.totalMinutes)}</td>
      <td>
        {waiting ? (
          <Badge color="warning" variant="soft" size="sm">
            {formatMinutes(row.submittedMinutes)} waiting
          </Badge>
        ) : row.approvedMinutes > 0 ? (
          <Badge color="success" variant="soft" size="sm">
            All approved
          </Badge>
        ) : null}
      </td>
      <td className="text-right">
        {unpriced ? (
          // NOT a number. This person's hours cannot be costed, and the only
          // honest cell is the reason why.
          <Badge color="error" size="sm">
            {formatMinutes(row.unpricedMinutes)} unpriced
          </Badge>
        ) : (
          <span className="font-medium tabular-nums">{formatCostOrNothing(row.costCents)}</span>
        )}
      </td>
    </tr>
  );
}

export function TimesheetsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [range, setRange] = useState(() => monthRange(new Date()));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const timesheet = useTimesheet(range);
  const { approve } = useTimeDecision();
  const derive = useDeriveLabor();

  // The entry ids behind the people who are selected. The grid reasons in
  // PEOPLE (that is how a manager approves — "Sam's week, yes"), and the API
  // takes entries, so the translation happens once, here.
  const waitingEntries = useTimeEntries({
    from: range.from,
    to: range.to,
    status: 'submitted',
  });

  const loaded = timesheet.data?.rows;
  const rows = useMemo(() => loaded ?? [], [loaded]);
  const forbidden = isForbidden(timesheet.error);

  const selectableIds = useMemo(
    () => rows.filter((row) => row.submittedMinutes > 0).map((row) => row.staffMemberId),
    [rows]
  );

  const idsFor = (staffMemberIds: Set<string>) =>
    (waitingEntries.data?.items ?? [])
      .filter((entry) => staffMemberIds.has(entry.staffMemberId))
      .map((entry) => entry.id);

  const toggle = (staffMemberId: string, next: boolean) => {
    setSelected((current) => {
      const copy = new Set(current);
      if (next) copy.add(staffMemberId);
      else copy.delete(staffMemberId);
      return copy;
    });
  };

  const doApprove = () => {
    const ids = idsFor(selected);
    if (ids.length === 0) return;
    approve.mutate(ids, {
      onSuccess: (result) => {
        setSelected(new Set());
        afterPaneChange(() => {
          toast.add({
            title:
              result.approvedIds.length === 1
                ? '1 entry approved'
                : `${String(result.approvedIds.length)} entries approved`,
            description:
              result.skippedOpen.length > 0
                ? `${String(result.skippedOpen.length)} were skipped because someone is still clocked in — approving those would record no hours at all. Their wages will appear in your spending shortly.`
                : 'Their wages are on their way into your spending, filed under Wages.',
            type: 'success',
          });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not approve those hours',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const doDerive = () => {
    derive.mutate(
      { from: range.from, to: range.to },
      {
        onSuccess: (result) => {
          afterPaneChange(() => {
            toast.add({
              title:
                result.expenses === 0
                  ? 'Nothing to file'
                  : `${String(result.expenses)} wage ${result.expenses === 1 ? 'cost' : 'costs'} filed`,
              description:
                result.unpricedMinutes > 0
                  ? `${formatMinutes(result.unpricedMinutes)} could not be costed — somebody has no pay rate covering this period, so the total is short by whatever that time is worth.`
                  : 'Your spending and profit figures now include this period’s wages.',
              type: result.unpricedMinutes > 0 ? 'warning' : 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not file those wages',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const doExport = async () => {
    setDownloading(true);
    try {
      const result = await downloadPayrollHours(range);
      toast.add({
        title: `${result.filename} downloaded`,
        // The unpriced count is the one thing that would make somebody distrust
        // the file, so it is said out loud rather than left in a header.
        description:
          result.unpricedMinutes > 0
            ? `${formatMinutes(result.unpricedMinutes)} are in the hours column but not the cost column — nobody has a pay rate covering them. They still have to be paid.`
            : 'Approved hours per person, with their payroll id.',
        type: result.unpricedMinutes > 0 ? 'warning' : 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Could not build the hours file',
        description: staffErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    } finally {
      setDownloading(false);
    }
  };

  if (forbidden) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full items-center justify-center p-8">
          <Alert color="info" className="max-w-md">
            <AlertContent>
              <AlertTitle>Only an account admin can open timesheets</AlertTitle>
              <AlertDescription>
                This grid shows what each person’s hours cost, which is their pay rate with one
                division undone. Hours on their own — without the money — are on each person’s
                record and on the schedule.
              </AlertDescription>
            </AlertContent>
          </Alert>
        </div>
      </div>
    );
  }

  const data = timesheet.data;
  const anySelected = selected.size > 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Timesheet controls"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto"
            disabled={!anySelected}
            loading={approve.isPending}
            onClick={doApprove}
          >
            {anySelected
              ? `Approve ${String(selected.size)} ${selected.size === 1 ? 'person' : 'people'}`
              : 'Approve'}
          </Button>
        }
        controls={
          <>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                aria-label="Previous month"
                onClick={() => {
                  setSelected(new Set());
                  setRange((current) => monthShift(current, -1));
                }}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Text as="span" className="min-w-32 text-center text-sm font-medium">
                {periodLabel(range.from, range.to)}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                aria-label="Next month"
                onClick={() => {
                  setSelected(new Set());
                  setRange((current) => monthShift(current, 1));
                }}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={() => {
                setSelected(new Set());
                setRange(monthRange(new Date()));
              }}
            >
              This month
            </Button>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={timesheet.isFetching}
            updatedAt={data ? timesheet.dataUpdatedAt : undefined}
            onRefresh={() => {
              void timesheet.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {timesheet.isError ? (
          <EmptyState
            icon={<CalendarDays className="size-6" aria-hidden />}
            title="Could not load this period"
            description="The server could not be reached. No hours are affected."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void timesheet.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : timesheet.isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<Users className="size-6" aria-hidden />}
              title="No hours in this period"
              description="Once people clock in, or somebody types in the time they worked, it appears here for you to check and approve."
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <Card className="p-4">
              <Text className="text-sm">
                {data.complete ? 'Labour cost this period' : 'Labour cost this period — so far'}
              </Text>
              <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                {formatCostOrNothing(data.costCents)}
              </Heading>
              <Text className="mt-1 text-sm">
                {formatMinutes(data.approvedMinutes)} approved
                {data.pendingMinutes > 0
                  ? ` · ${formatMinutes(data.pendingMinutes)} still waiting on you`
                  : ''}
              </Text>

              {!data.complete ? (
                <Alert color="warning" className="mt-3">
                  <AlertContent>
                    <AlertTitle>
                      {data.rowsNeedingRates === 1
                        ? 'One person has no pay rate'
                        : `${String(data.rowsNeedingRates)} people have no pay rate`}
                    </AlertTitle>
                    <AlertDescription>
                      Their hours are counted but not costed, so the figure above is short by
                      whatever that time is worth. Open their record and add a rate — it applies
                      from whatever date you give it, so past periods stay as they were.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-base-300 flex items-center gap-2 border-b px-3 py-2">
                <Checkbox
                  color="module"
                  aria-label="Select everyone with hours waiting"
                  checked={selected.size > 0 && selected.size === selectableIds.length}
                  disabled={selectableIds.length === 0}
                  onChange={(event) => {
                    setSelected(event.target.checked ? new Set(selectableIds) : new Set());
                  }}
                />
                <Text className="text-sm">
                  {selectableIds.length === 0
                    ? 'Nothing waiting to be approved'
                    : `${String(selectableIds.length)} ${selectableIds.length === 1 ? 'person has' : 'people have'} hours waiting`}
                </Text>
              </div>
              <Table size="sm">
                <thead>
                  <tr>
                    <th />
                    <th>Who</th>
                    <th>Logged</th>
                    <th>State</th>
                    <th className="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PersonRow
                      key={row.staffMemberId}
                      row={row}
                      selected={selected.has(row.staffMemberId)}
                      onToggle={(next) => {
                        toggle(row.staffMemberId, next);
                      }}
                      onOpen={() => {
                        ctx.open('staff.person', { id: row.staffMemberId }, { target: 'beside' });
                      }}
                    />
                  ))}
                </tbody>
              </Table>
            </Card>

            <Card className="flex flex-col gap-2 p-4">
              <Heading level={3} className="text-base font-semibold">
                Wages in your spending
              </Heading>
              <Text className="text-sm">
                Approving hours files them as a wage cost automatically. If your spending looks out
                of date — a rate added after the fact, or a hiccup reaching the server — you can
                re-file this period by hand. It is safe to press twice: it updates the same records
                rather than adding more.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="module"
                className="self-start"
                loading={derive.isPending}
                onClick={doDerive}
              >
                <RefreshCw className="size-4" aria-hidden />
                Re-file this period
              </Button>
            </Card>

            <Card className="flex flex-col gap-2 p-4">
              <Heading level={3} className="text-base font-semibold">
                Hours for payroll
              </Heading>
              <Text className="text-sm">
                sparx does not run payroll and is not going to. What it can do is hand whoever does
                a file of this period’s approved hours per person, with their id in your payroll
                system so nobody has to match names in a spreadsheet.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="module"
                className="self-start"
                loading={downloading}
                onClick={() => {
                  void doExport();
                }}
              >
                <Download className="size-4" aria-hidden />
                Download the hours
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
