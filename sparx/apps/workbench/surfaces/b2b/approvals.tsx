'use client';

// Approvals — orders held for someone to say yes.
//
// The top half is the QUEUE: orders a trade account placed that went over a
// threshold, so checkout held them instead of placing them. Each waits for a
// yes or a no — approving places the order (and invoices it if they're on
// terms), rejecting cancels it. The bottom half is the RULES that decide when an
// order gets held: a spending limit, either across every account or on one.
//
// Approving and rejecting each take an optional reason, so they're a short modal
// — nothing to return to, over in seconds — rather than a bare confirm.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  SearchInput,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { CheckCircle, Plus, Trash2 } from 'lucide-react';
import { afterPaneChange } from '../../lib/defer';
import { PaneScope } from '../../lib/dock/window-boundary';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { MoneyInput } from '@/components/money-input';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  approvalErrorMessage,
  formatCents,
  formatDateTime,
  queueBuyer,
  useApprovalAccountChoices,
  useApprovalQueue,
  useApprovalRules,
  useApproveOrder,
  useCreateRule,
  useDeleteRule,
  useRejectOrder,
  useUpdateRule,
  type ApprovalRule,
  type QueueItem,
} from './approvals-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

type Decision = { item: QueueItem; action: 'approve' | 'reject' } | null;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function ApprovalsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<Decision>(null);

  const queue = useApprovalQueue(search.trim());
  const items = queue.data?.items ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Approval controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search held orders"
              placeholder="Order number or company…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        refresh={
          <RefreshButton
            isFetching={queue.isFetching}
            updatedAt={queue.data ? queue.dataUpdatedAt : undefined}
            onRefresh={() => {
              void queue.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <FormSection
            title="Waiting for sign-off"
            description="Orders held because they went over a limit. Approve to place them, or reject to cancel."
          >
            {queue.isError ? (
              <Text className="text-sm">
                The queue could not be loaded just now. Your orders are unaffected.
              </Text>
            ) : queue.isPending ? (
              <Text className="text-sm" role="status">
                Loading…
              </Text>
            ) : items.length === 0 ? (
              <div className="py-2">
                <EmptyState
                  icon={<CheckCircle className="size-6" aria-hidden />}
                  title={search.trim() ? 'Nothing matches that' : 'Nothing waiting'}
                  description={
                    search.trim()
                      ? 'No held order matches that. Clear the search to see the whole queue.'
                      : 'No orders are held for sign-off right now. When one goes over a limit you set below, it lands here.'
                  }
                />
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    onOpen={(event) => {
                      ctx.open(
                        'commerce.order.detail',
                        { id: item.id },
                        { target: targetFor(event) }
                      );
                    }}
                    onApprove={() => {
                      setDecision({ item, action: 'approve' });
                    }}
                    onReject={() => {
                      setDecision({ item, action: 'reject' });
                    }}
                  />
                ))}
              </ul>
            )}
          </FormSection>

          <RulesSection />
        </div>
      </div>

      {decision ? (
        <DecisionDialog
          decision={decision}
          onDone={() => {
            setDecision(null);
          }}
        />
      ) : null}
    </div>
  );
}

function QueueRow({
  item,
  onOpen,
  onApprove,
  onReject,
}: {
  item: QueueItem;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <li className="border-base-300 flex flex-col gap-3 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <button
          type="button"
          className="link link-hover font-mono text-sm"
          onClick={(event) => {
            onOpen(event);
          }}
        >
          {item.orderNumber}
        </button>
        <span className="min-w-0 flex-1 font-medium">{queueBuyer(item)}</span>
        <Text as="span" className="font-semibold tabular-nums">
          {formatCents(item.totalCents, item.currency)}
        </Text>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="span" className="text-sm">
          Placed {formatDateTime(item.createdAt)}
        </Text>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" color="danger" onClick={onReject}>
            Reject
          </Button>
          <Button size="sm" color="module" onClick={onApprove}>
            <CheckCircle className="size-4" aria-hidden />
            Approve
          </Button>
        </div>
      </div>
    </li>
  );
}

/* ── Decision dialog ────────────────────────────────────────────────────── */

function DecisionDialog({
  decision,
  onDone,
}: {
  decision: NonNullable<Decision>;
  onDone: () => void;
}) {
  const toast = useToast();
  const approve = useApproveOrder();
  const reject = useRejectOrder();
  const [reason, setReason] = useState('');

  const isApprove = decision.action === 'approve';
  const mutation = isApprove ? approve : reject;
  const buyer = queueBuyer(decision.item);

  const submit = () => {
    mutation.mutate(
      { orderId: decision.item.id, reason: reason.trim() === '' ? undefined : reason.trim() },
      {
        onSuccess: () => {
          onDone();
          afterPaneChange(() => {
            toast.add({
              title: isApprove
                ? `Order ${decision.item.orderNumber} approved`
                : `Order ${decision.item.orderNumber} rejected`,
              description: isApprove ? 'The order is placed.' : 'The order has been cancelled.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: isApprove ? 'Could not approve this order' : 'Could not reject this order',
            description: approvalErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <PaneScope>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onDone();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>{isApprove ? 'Approve this order?' : 'Reject this order?'}</DialogTitle>
          <DialogDescription>
            {isApprove
              ? `Order ${decision.item.orderNumber} from ${buyer}, for ${formatCents(decision.item.totalCents, decision.item.currency)}, will be placed${''}. If they're on terms, it will be invoiced.`
              : `Order ${decision.item.orderNumber} from ${buyer}, for ${formatCents(decision.item.totalCents, decision.item.currency)}, will be cancelled. This can't be undone.`}
          </DialogDescription>

          <div className="py-2">
            <Field>
              <FieldLabel>Reason</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={reason}
                    placeholder={
                      isApprove
                        ? 'Optional — noted against the order.'
                        : 'Optional — why it was turned down.'
                    }
                    onChange={(event) => {
                      setReason(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>Kept on the order&apos;s history.</FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <DialogClose>
              <Button color="neutral" variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              color={isApprove ? 'module' : 'danger'}
              size="sm"
              loading={mutation.isPending}
              onClick={submit}
            >
              {isApprove ? 'Approve order' : 'Reject order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

/* ── Rules ──────────────────────────────────────────────────────────────── */

function RulesSection() {
  const toast = useToast();
  const rulesQuery = useApprovalRules();
  const accountsQuery = useApprovalAccountChoices();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();

  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [accountId, setAccountId] = useState('');

  const rules = rulesQuery.data ?? [];

  const accountItems = useMemo(
    () => [
      { value: '', label: 'Every account' },
      ...(accountsQuery.data?.items ?? []).map((account) => ({
        value: account.id,
        label: account.companyName,
      })),
    ],
    [accountsQuery.data]
  );

  const onCreate = () => {
    createRule.mutate(
      { accountId: accountId === '' ? null : accountId, minAmountCents: Math.round(amount * 100) },
      {
        onSuccess: () => {
          setAdding(false);
          setAmount(1000);
          setAccountId('');
          toast.add({ title: 'Rule added', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that rule',
            description: approvalErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <FormSection
      title="When sign-off is needed"
      description="Hold any order over a set amount for approval — across every account, or just one."
      action={
        !adding ? (
          <Button
            size="sm"
            variant="soft"
            color="module"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a rule
          </Button>
        ) : null
      }
    >
      {adding ? (
        <div className="border-base-300 flex flex-col gap-3 rounded border p-3">
          <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
            <Field>
              <FieldLabel>Hold orders over</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-40">
                    <MoneyInput
                      color="module"
                      value={amount}
                      aria-label="Threshold amount"
                      onValueChange={setAmount}
                    />
                  </div>
                }
              />
            </Field>
            <Field>
              <FieldLabel>For which account</FieldLabel>
              <FieldControl
                render={
                  <Select
                    color="module"
                    aria-label="Which account this applies to"
                    value={accountId}
                    items={accountItems}
                    onValueChange={(next) => {
                      setAccountId((next as string | null) ?? '');
                    }}
                  />
                }
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              color="module"
              disabled={amount <= 0}
              loading={createRule.isPending}
              onClick={onCreate}
            >
              Add rule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={() => {
                setAdding(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {rulesQuery.isError ? (
        <Text className="text-sm">The rules could not be loaded just now.</Text>
      ) : rulesQuery.isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : rules.length === 0 ? (
        !adding ? (
          <Text className="text-sm">
            No rules yet, so no orders are held — everything a trade account places goes straight
            through. Add a rule to hold big orders for sign-off.
          </Text>
        ) : null
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              busy={updateRule.isPending || deleteRule.isPending}
              onToggle={(next) => {
                updateRule.mutate({ id: rule.id, isActive: next });
              }}
              onDelete={() => {
                deleteRule.mutate(rule.id);
              }}
            />
          ))}
        </ul>
      )}
    </FormSection>
  );
}

function RuleRow({
  rule,
  busy,
  onToggle,
  onDelete,
}: {
  rule: ApprovalRule;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <li className="border-base-300 flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3 last:border-b-0 last:pb-0">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Over {rule.minAmountFormatted}</span>
        <Text as="span" className="block text-sm">
          {rule.accountName ?? 'Every account'}
          {rule.requiredApproverName ? ` · ${rule.requiredApproverName} signs off` : ''}
        </Text>
      </span>
      {!rule.isActive ? (
        <Badge color="neutral" variant="soft" size="sm">
          Off
        </Badge>
      ) : null}
      <Switch
        color="module"
        checked={rule.isActive}
        disabled={busy}
        aria-label={`Turn this rule ${rule.isActive ? 'off' : 'on'}`}
        onCheckedChange={onToggle}
      />
      <Button
        size="sm"
        variant="ghost"
        color="danger"
        shape="square"
        disabled={busy}
        aria-label="Remove this rule"
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
