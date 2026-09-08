'use client';

// Who is in a sequence — the people currently working through it, the ones who
// finished, and the ones who dropped out. Reached from a sequence's own toolbar;
// it is not listed on its own because "enrolled people" only means something
// next to the sequence they are enrolled in.
//
// The only change you make here is enrolling someone by hand, or taking one
// person out — everything else is the backend clock's job. Enrolling is a small
// popup (it earns a modal: an abandoned form loses one typed address, there is
// nothing durable to return to, and it is over in seconds).

import { useMemo, useState } from 'react';
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
  FieldLabel,
  Input,
  SearchInput,
  Select,
  Table,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, UserPlus, Users } from 'lucide-react';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useConfirm } from '../../lib/confirm';
import { RefreshButton } from '../../components/refresh-button';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  customerDisplay,
  enrollmentState,
  enrollReasonText,
  sequenceErrorMessage,
  useCustomerSearch,
  useEnrollInSequence,
  useSequence,
  useSequenceEnrollments,
  useUnenrollFromSequence,
  type EnrollmentRow,
} from './sequences-data';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SequenceEnrollmentsSurface({ ctx }: { ctx: SurfaceContext }) {
  const sequenceId = typeof ctx.params.sequenceId === 'string' ? ctx.params.sequenceId : '';
  const [status, setStatus] = useState('all');
  const [enrollOpen, setEnrollOpen] = useState(false);

  const sequence = useSequence(sequenceId);
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSequenceEnrollments(
    sequenceId,
    { status, limit: 200 }
  );
  const unenroll = useUnenrollFromSequence(sequenceId);
  const confirm = useConfirm();
  const toast = useToast();

  const totalSteps = sequence.data?.steps.length ?? 0;
  const sequenceName = sequence.data?.name ?? 'Sequence';

  const rows = data ?? [];

  const onRemove = async (row: EnrollmentRow) => {
    const ok = await confirm({
      title: `Take ${row.recipientEmail} out of this sequence?`,
      description: 'They stop receiving the rest of the emails. This cannot be undone.',
      confirmLabel: 'Take them out',
      cancelLabel: 'Keep them in',
      color: 'danger',
    });
    if (!ok) return;
    unenroll.mutate(
      row.customerId ? { customerId: row.customerId } : { email: row.recipientEmail },
      {
        onSuccess: () => {
          toast.add({ title: `${row.recipientEmail} removed`, type: 'success' });
        },
        onError: (e) => {
          toast.add({
            title: 'Could not remove them',
            description: sequenceErrorMessage(e, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const filtering = status !== 'all';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`People in ${sequenceName}`}
        status={
          <span className="inline-flex min-w-0 items-center gap-2">
            <Users className="text-module size-4 shrink-0" aria-hidden />
            <span className="truncate font-medium">{sequenceName}</span>
          </span>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0 @md:ml-0"
            onClick={() => {
              setEnrollOpen(true);
            }}
          >
            <UserPlus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Enrol someone</span>
          </Button>
        }
        controls={
          <>
            <div className="ml-auto hidden w-44 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Filter by where they are"
                value={status}
                items={{
                  all: 'Everyone',
                  active: 'In progress',
                  completed: 'Finished',
                  exited: 'Left early',
                  cancelled: 'Cancelled',
                }}
                onValueChange={(next) => {
                  setStatus((next as string) || 'all');
                }}
              />
            </div>
          </>
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

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<Users className="size-6" aria-hidden />}
            title="Could not load who is enrolled"
            description="Something went wrong reaching the server. Try again in a moment."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={filtering}
            noResults={{
              icon: <Users className="size-6" aria-hidden />,
              title: 'Nobody matches that filter',
              description: 'Switch the filter back to Everyone to see all enrolled people.',
            }}
            firstRun={{
              title: 'Nobody is enrolled yet',
              description:
                'People are added automatically by any automation that starts this sequence, or you can add someone by hand.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    setEnrollOpen(true);
                  }}
                >
                  <UserPlus className="size-4" aria-hidden />
                  Enrol someone
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Person</th>
                <th>Where they are</th>
                <th className="hidden @md:table-cell">Progress</th>
                <th className="hidden @xl:table-cell">Enrolled</th>
                <th className="hidden @lg:table-cell">Next email</th>
                <th className="w-0" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = enrollmentState(row.status);
                return (
                  <tr key={row.id}>
                    <td className="max-w-64">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{row.recipientEmail}</span>
                        {row.sourceAutomationId ? (
                          <span className="text-sm">Added by an automation</span>
                        ) : (
                          <span className="text-sm">Added by hand</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <Badge color={state.tone} variant="soft" size="sm">
                          {state.label}
                        </Badge>
                        {row.status === 'exited' && row.exitReason ? (
                          <span className="text-sm">{row.exitReason}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="hidden text-sm tabular-nums @md:table-cell">
                      {totalSteps > 0
                        ? `${String(Math.min(row.currentStep, totalSteps))} of ${String(totalSteps)}`
                        : String(row.currentStep)}
                    </td>
                    <td className="hidden text-sm @xl:table-cell">
                      <Timestamp value={row.enrolledAt} format="relative" />
                    </td>
                    <td className="hidden text-sm @lg:table-cell">
                      {row.status === 'active' ? (
                        <Timestamp value={row.nextRunAt} format="relative" />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-right">
                      {row.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          color="danger"
                          onClick={() => {
                            void onRemove(row);
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <EnrollModal
        sequenceId={sequenceId}
        sequenceName={sequenceName}
        open={enrollOpen}
        onClose={() => {
          setEnrollOpen(false);
        }}
      />
    </div>
  );
}

/* ── Enrol-someone popup ──────────────────────────────────────────────────── */

function EnrollModal({
  sequenceId,
  sequenceName,
  open,
  onClose,
}: {
  sequenceId: string;
  sequenceName: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const enroll = useEnrollInSequence(sequenceId);
  const [mode, setMode] = useState<'email' | 'customer'>('email');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);

  const search = useCustomerSearch(mode === 'customer' ? query : '');

  const trimmed = email.trim();
  const malformed = trimmed !== '' && !EMAIL_PATTERN.test(trimmed);
  const emailError = malformed && touched ? 'Enter an address like sarah@example.com' : null;

  const reset = () => {
    setMode('email');
    setEmail('');
    setTouched(false);
    setQuery('');
    setCustomerId(null);
  };

  const canSubmit = mode === 'email' ? trimmed !== '' && !malformed : customerId !== null;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    const body = mode === 'email' ? { recipientEmail: trimmed } : { customerId: customerId ?? '' };
    enroll.mutate(body, {
      onSuccess: (result) => {
        if (result.enrolled) {
          onClose();
          reset();
          toast.add({
            title: 'Added to the sequence',
            description: `They will start receiving ${sequenceName}.`,
            type: 'success',
          });
        } else {
          // A refusal is not an error — the server has a specific reason (already
          // enrolled, on the do-not-email list, the sequence is off). Say which.
          toast.add({
            title: 'They were not added',
            description: enrollReasonText(result.reason),
            type: 'warning',
          });
        }
      },
      onError: (e) => {
        toast.add({
          title: 'Could not add them',
          description: sequenceErrorMessage(e, 'Nothing was changed — try again in a moment.'),
          type: 'error',
        });
      },
    });
  };

  const results = useMemo(() => search.data ?? [], [search.data]);

  return (
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-md flex-col overflow-hidden">
          <DialogTitle>Add someone to {sequenceName}</DialogTitle>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
            <div className="flex gap-1">
              {(['email', 'customer'] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? 'soft' : 'ghost'}
                  color={mode === m ? 'module' : 'neutral'}
                  onClick={() => {
                    setMode(m);
                  }}
                >
                  {m === 'email' ? 'By email address' : 'Pick a customer'}
                </Button>
              ))}
            </div>

            {mode === 'email' ? (
              <Field>
                <FieldLabel>Email address</FieldLabel>
                <Input
                  color={emailError ? 'error' : 'module'}
                  type="email"
                  value={email}
                  placeholder="sarah@example.com"
                  autoComplete="off"
                  onBlur={() => {
                    setTouched(true);
                  }}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                />
                {emailError ? (
                  <Text className="text-error text-sm">{emailError}</Text>
                ) : (
                  <Text className="text-sm">
                    We will send the sequence to this address. If it matches a customer, their
                    details are used to personalise the emails.
                  </Text>
                )}
              </Field>
            ) : (
              <Field>
                <FieldLabel>Find a customer</FieldLabel>
                <SearchInput
                  aria-label="Search customers"
                  placeholder="Search by name or email…"
                  value={query}
                  onValueChange={(next) => {
                    setQuery(next);
                    setCustomerId(null);
                  }}
                />
                <div className="border-base-300 mt-1 flex max-h-56 flex-col overflow-y-auto rounded-lg border">
                  {query.trim().length < 2 ? (
                    <Text className="p-3 text-sm">Type at least two letters to search.</Text>
                  ) : search.isPending ? (
                    <Text className="p-3 text-sm">Searching…</Text>
                  ) : results.length === 0 ? (
                    <Text className="p-3 text-sm">No customers match that.</Text>
                  ) : (
                    results.map((customer) => {
                      const chosen = customer.id === customerId;
                      return (
                        <button
                          key={customer.id}
                          type="button"
                          className={`hover:bg-base-200 flex items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                            chosen ? 'bg-module/10' : ''
                          }`}
                          onClick={() => {
                            setCustomerId(customer.id);
                          }}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">
                              {customerDisplay(customer)}
                            </span>
                            {customer.email ? (
                              <span className="truncate">{customer.email}</span>
                            ) : null}
                          </span>
                          {chosen ? (
                            <Check className="text-module size-4 shrink-0" aria-hidden />
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </Field>
            )}
          </div>

          <DialogFooter>
            <Button
              color="neutral"
              variant="ghost"
              size="sm"
              onClick={() => {
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              color="module"
              size="sm"
              disabled={!canSubmit || enroll.isPending}
              onClick={submit}
            >
              {enroll.isPending ? 'Adding…' : 'Add to sequence'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}
