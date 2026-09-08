'use client';

// TIME OFF — the request queue (docs/149 §5).
//
// A queue, not a calendar. The question this screen answers is "what is waiting
// on me", so what is waiting leads, and everything already decided sits behind a
// filter. The schedule shows approved leave in place, which is where the "who is
// away on Thursday" question actually gets asked.
//
// APPROVAL REACHES ANOTHER MODULE. If the person is a bookable resource,
// approving writes an availability blackout so the booking engine stops offering
// them — and cancelling takes it back. Most staff are not bookable, and that is
// the ordinary case rather than a failure, so the row says whether the block
// actually happened instead of implying it always does.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldLabel,
  Filter,
  FilterItem,
  Heading,
  Input,
  NativeSelect,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarOff, CheckCircle2, Plus, X } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  staffErrorMessage,
  useDecideTimeOff,
  useRequestTimeOff,
  useStaffMembers,
  useTimeOff,
  type TimeOffKind,
  type TimeOffRequest,
  type TimeOffStatus,
} from './data';
import {
  formatMoment,
  timeOffKindLabel,
  timeOffKindTone,
  timeOffState,
  toDateInput,
} from './format';

const FILTERS = [
  { value: 'requested', label: 'Waiting on you' },
  { value: 'approved', label: 'Approved' },
  { value: 'all', label: 'Everything' },
] as const;

/** Whole days, inclusive — a request that starts and ends on the same day is one
 *  day off, not zero. */
function dayCount(request: TimeOffRequest): number {
  const start = new Date(request.startsAt).getTime();
  const end = new Date(request.endsAt).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function TimeOffSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<string>('requested');
  const [composing, setComposing] = useState(false);
  const [staffMemberId, setStaffMemberId] = useState('');
  const [kind, setKind] = useState<TimeOffKind>('vacation');
  const [startsAt, setStartsAt] = useState(toDateInput(new Date()));
  const [endsAt, setEndsAt] = useState(toDateInput(new Date()));
  const [reason, setReason] = useState('');

  const query = filter === 'all' ? {} : { status: filter as TimeOffStatus };
  const requests = useTimeOff(query);
  const people = useStaffMembers({ status: 'active' });
  const create = useRequestTimeOff();
  const { decide, cancel } = useDecideTimeOff();

  const items = requests.data?.items ?? [];
  const waiting = requests.data?.requestedCount ?? 0;

  const reset = () => {
    setComposing(false);
    setKind('vacation');
    setStartsAt(toDateInput(new Date()));
    setEndsAt(toDateInput(new Date()));
    setReason('');
  };

  const submit = () => {
    const person = staffMemberId || (people.data?.items[0]?.id ?? '');
    if (person === '') return;
    create.mutate(
      {
        staffMemberId: person,
        kind,
        startsAt: new Date(`${startsAt}T00:00:00`).toISOString(),
        endsAt: new Date(`${endsAt}T23:59:59`).toISOString(),
        reason: reason.trim() === '' ? null : reason.trim(),
      },
      {
        onSuccess: () => {
          reset();
          afterPaneChange(() => {
            toast.add({ title: 'Request logged', type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not log that request',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const respond = (request: TimeOffRequest, status: 'approved' | 'denied') => {
    decide.mutate(
      { id: request.id, status },
      {
        onSuccess: (updated) => {
          afterPaneChange(() => {
            toast.add({
              title:
                status === 'approved'
                  ? `${request.staffMemberName ?? 'Their'} time off approved`
                  : 'Request declined',
              description:
                status === 'approved'
                  ? updated.blocksBookings
                    ? 'They are off the rota for those dates and the booking system will stop offering them.'
                    : 'They are off the rota for those dates.'
                  : undefined,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not record that decision',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const withdraw = async (request: TimeOffRequest) => {
    const ok = await confirm({
      title: 'Withdraw this time off?',
      description: request.blocksBookings
        ? 'The dates come back onto the rota and the booking system will start offering them again.'
        : 'The dates come back onto the rota.',
      confirmLabel: 'Withdraw it',
      cancelLabel: 'Leave it',
      color: 'warning',
    });
    if (!ok) return;
    cancel.mutate(request.id, {
      onError: (error) => {
        toast.add({
          title: 'Could not withdraw that',
          description: staffErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Time off controls"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto"
            onClick={() => {
              setStaffMemberId(people.data?.items[0]?.id ?? '');
              setComposing(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Log time off</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={filter}
              onValueChange={(next) => {
                setFilter(typeof next === 'string' ? next : 'requested');
              }}
              showReset={false}
              aria-label="Filter requests"
            >
              {FILTERS.map((option) => (
                <FilterItem key={option.value} value={option.value}>
                  {option.label}
                </FilterItem>
              ))}
            </Filter>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={requests.isFetching}
            updatedAt={requests.data ? requests.dataUpdatedAt : undefined}
            onRefresh={() => {
              void requests.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {requests.isError ? (
          <EmptyState
            icon={<CalendarOff className="size-6" aria-hidden />}
            title="Could not load requests"
            description="The server could not be reached. Nothing already agreed is affected."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void requests.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : requests.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<CheckCircle2 className="size-6" aria-hidden />}
              title={filter === 'requested' ? 'Nothing waiting on you' : 'No requests yet'}
              description={
                filter === 'requested'
                  ? 'Every request has been answered. Switch to Everything to see what has already been decided.'
                  : 'When someone asks for time off — or you log it for them — it appears here, and approved dates show on the schedule.'
              }
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {waiting > 0 && filter !== 'requested' ? (
              <Card className="flex items-center justify-between gap-3 p-4">
                <div>
                  <Heading level={2} className="text-lg font-semibold">
                    {waiting === 1 ? '1 request waiting' : `${String(waiting)} requests waiting`}
                  </Heading>
                  <Text className="text-sm">Nobody knows their answer until you give one.</Text>
                </div>
                <Button
                  size="sm"
                  color="warning"
                  onClick={() => {
                    setFilter('requested');
                  }}
                >
                  Answer them
                </Button>
              </Card>
            ) : null}

            <Card className="overflow-hidden">
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>When</th>
                    <th>Kind</th>
                    <th>State</th>
                    <th className="text-right">Decide</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((request) => {
                    const state = timeOffState(request.status);
                    const days = dayCount(request);
                    return (
                      <tr key={request.id}>
                        <td className="max-w-40 min-w-0">
                          <button
                            type="button"
                            className="link truncate text-left font-medium"
                            onClick={() => {
                              ctx.open(
                                'staff.person',
                                { id: request.staffMemberId },
                                { target: 'beside' }
                              );
                            }}
                          >
                            {request.staffMemberName ?? 'Someone'}
                          </button>
                          {request.reason ? (
                            <div className="truncate text-sm">{request.reason}</div>
                          ) : null}
                        </td>
                        <td className="text-sm whitespace-nowrap">
                          {formatMoment(request.startsAt)}
                          {days > 1 ? ` · ${String(days)} days` : ' · 1 day'}
                        </td>
                        <td>
                          <Badge color={timeOffKindTone(request.kind)} variant="soft" size="sm">
                            {timeOffKindLabel(request.kind)}
                          </Badge>
                        </td>
                        <td>
                          <Badge
                            color={state.tone}
                            variant={request.status === 'requested' ? 'solid' : 'soft'}
                            size="sm"
                          >
                            {state.label}
                          </Badge>
                        </td>
                        <td className="text-right">
                          {request.status === 'requested' ? (
                            <div className="flex justify-end gap-1">
                              {/* A decision PAIR: the affirmative half is solid
                                  and colored, the dismiss half is the one place
                                  neutral is earned (DESIGN.md RULE #4). */}
                              <Button
                                size="sm"
                                color="success"
                                loading={decide.isPending}
                                onClick={() => {
                                  respond(request, 'approved');
                                }}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                color="neutral"
                                aria-label="Decline this request"
                                onClick={() => {
                                  respond(request, 'denied');
                                }}
                              >
                                <X className="size-4" aria-hidden />
                              </Button>
                            </div>
                          ) : request.status === 'approved' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              color="neutral"
                              onClick={() => {
                                void withdraw(request);
                              }}
                            >
                              Withdraw
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          </div>
        )}
      </div>

      {/* Five fields, seconds of work, nothing to come back to — and the queue
          behind it is the context that matters while filling it in. */}
      <Dialog
        open={composing}
        onOpenChange={(open) => {
          if (!open) reset();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-md flex-col overflow-hidden">
          <DialogTitle>Log time off</DialogTitle>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
            <Field>
              <FieldLabel>Who</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={staffMemberId}
                    onChange={(event) => {
                      setStaffMemberId(event.target.value);
                    }}
                  >
                    {(people.data?.items ?? []).map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
            </Field>

            <Field>
              <FieldLabel>What kind</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={kind}
                    onChange={(event) => {
                      setKind(event.target.value as TimeOffKind);
                    }}
                  >
                    <option value="vacation">Holiday</option>
                    <option value="sick">Off sick</option>
                    <option value="unpaid">Unpaid leave</option>
                    <option value="other">Something else</option>
                  </NativeSelect>
                }
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>First day</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      type="date"
                      value={startsAt}
                      onChange={(event) => {
                        setStartsAt(event.target.value);
                        if (event.target.value > endsAt) setEndsAt(event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Last day</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      type="date"
                      value={endsAt}
                      min={startsAt}
                      onChange={(event) => {
                        setEndsAt(event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Reason</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    rows={2}
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </div>

          <DialogFooter>
            <Button size="sm" variant="ghost" color="neutral" onClick={reset}>
              Cancel
            </Button>
            <Button
              size="sm"
              color="module"
              disabled={endsAt < startsAt}
              loading={create.isPending}
              onClick={submit}
            >
              Log it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
