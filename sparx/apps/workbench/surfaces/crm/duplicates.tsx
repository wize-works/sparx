'use client';

// Duplicates — the same person entered twice, so you can merge them into one.
//
// This is one self-contained pane, not a list-and-detail: the whole job (see a
// cluster, pick the record to keep, merge the rest in) happens in view, and
// merging is irreversible, so nothing about it should be a click away in another
// pane. Each cluster is a card; picking the survivor is a click on its row; the
// merge sits behind a confirm that names what is kept and what disappears.
//
// Merge is admin-only on the server, so the surface reads the viewer's role and
// simply does not offer the action to anyone who would be refused — an interface
// that hands out 403s is worse than one that explains the limit up front.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Heading,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Check, CopyCheck } from 'lucide-react';
import { useState } from 'react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useViewer } from '../../lib/api/shell-data';
import {
  customerName,
  customerTypeMeta,
  formatMoney,
  lifecycleStageMeta,
  type Customer,
} from './customers-data';
import {
  confidenceMeta,
  mergeErrorMessage,
  reasonLabel,
  useBulkMerge,
  useDuplicates,
  useMergeCustomers,
  type DuplicateGroup,
} from './duplicates-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function groupKey(group: DuplicateGroup): string {
  return group.customers
    .map((c) => c.id)
    .sort()
    .join('|');
}

function shortDate(iso: string | null): string {
  if (!iso) return 'no orders';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'no orders';
  return `last order ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function DuplicatesSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data: groups, isPending, isError, isFetching, dataUpdatedAt, refetch } = useDuplicates();
  const { data: viewer } = useViewer();
  const canMerge = viewer?.role === 'admin' || viewer?.role === 'owner';
  const bulkMerge = useBulkMerge();
  const toast = useToast();
  const confirm = useConfirm();

  // Only the CERTAIN ones are offered in bulk. A button that swept up the
  // "worth a look" groups too would be a button that merges two colleagues, and
  // the whole point of a confidence is that it stops that being one click.
  const clusters = groups?.items ?? [];
  const certainCount = clusters.filter((group) => group.confidence >= 100).length;

  const mergeCertain = async (): Promise<void> => {
    const ok = await confirm({
      title: `Merge ${String(certainCount)} certain duplicates?`,
      description:
        'Each group has one email address shared by two or more records. The most recently updated record in each survives and absorbs the others — their orders, spend, deals and tasks move onto it, and anything it was missing is filled in from them. This cannot be undone.',
      confirmLabel: 'Merge them',
      cancelLabel: 'Not now',
      color: 'danger',
    });
    if (!ok) return;
    bulkMerge.mutate(100, {
      onSuccess: (result) => {
        toast.add({
          title: `${String(result.merged)} merged`,
          description:
            result.absorbed === 1
              ? '1 record was folded in.'
              : `${String(result.absorbed)} records were folded in.`,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not merge those',
          description: mergeErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Duplicate controls"
        status={
          <Text as="span" className="shrink-0 text-sm">
            {isPending
              ? 'Checking…'
              : clusters.length === 0
                ? 'None found'
                : clusters.length === 1
                  ? '1 possible duplicate'
                  : `${String(clusters.length)} possible duplicates`}
          </Text>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={groups ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<CopyCheck className="size-6" aria-hidden />}
              title="Could not check for duplicates"
              description="Something went wrong reaching the server. It may be a temporary problem — try again in a moment."
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
          </div>
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Checking your customers for duplicates…
          </p>
        ) : clusters.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<CopyCheck className="size-6" aria-hidden />}
              title="No duplicates found"
              description="Every customer looks unique — nobody shares an email address, or a name and company. We check whenever you reopen this, so come back after a busy spell."
            />
          </div>
        ) : (
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Possible duplicates
              </Heading>
              <Text>
                Each group below looks like one person entered more than once. Choose the record to
                keep, then merge the others into it — their orders, spending and history all move
                across, and the extra records are retired.
              </Text>
            </div>

            {canMerge && certainCount > 0 ? (
              <div className="border-base-300 rounded-box flex flex-wrap items-center justify-between gap-3 border px-4 py-3">
                <Text className="text-sm">
                  {certainCount === 1
                    ? '1 of these is an identical email address'
                    : `${String(certainCount)} of these are identical email addresses`}{' '}
                  — the same person by any definition.
                </Text>
                <Button
                  color="module"
                  size="sm"
                  loading={bulkMerge.isPending}
                  onClick={() => void mergeCertain()}
                >
                  <CopyCheck className="size-4" aria-hidden />
                  Merge {certainCount === 1 ? 'it' : 'all ' + String(certainCount)}
                </Button>
              </div>
            ) : null}

            {!canMerge ? (
              <Alert color="info">
                <AlertContent>
                  <AlertTitle>Merging is limited to owners and admins</AlertTitle>
                  <AlertDescription>
                    You can review the groups below, but combining records permanently changes them,
                    so it is left to an owner or admin.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {clusters.map((group) => (
              <DuplicateCard key={groupKey(group)} ctx={ctx} group={group} canMerge={canMerge} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DuplicateCard({
  ctx,
  group,
  canMerge,
}: {
  ctx: SurfaceContext;
  group: DuplicateGroup;
  canMerge: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const merge = useMergeCustomers();

  // The server orders newest-first, so the first record is the natural survivor.
  const [primaryId, setPrimaryId] = useState(group.customers[0]?.id ?? '');
  const primary = group.customers.find((c) => c.id === primaryId) ?? group.customers[0];
  // The server only returns clusters of two or more, so this never fires — it is
  // the type-level proof that `primary` exists before it is read below.
  if (!primary) return null;
  const duplicates = group.customers.filter((c) => c.id !== primary.id);

  const onMerge = async () => {
    const keepName = customerName(primary);
    const ok = await confirm({
      title: `Merge ${duplicates.length === 1 ? '1 record' : `${String(duplicates.length)} records`} into ${keepName}?`,
      description: `Everything from the other ${duplicates.length === 1 ? 'record' : 'records'} — orders, spending, notes and addresses — moves onto ${keepName}. The ${duplicates.length === 1 ? 'other record is' : 'others are'} then retired and drop out of your lists. This cannot be undone.`,
      confirmLabel: 'Merge them',
      cancelLabel: 'Leave them separate',
      color: 'danger',
    });
    if (!ok) return;
    merge.mutate(
      { primaryCustomerId: primary.id, duplicateCustomerIds: duplicates.map((d) => d.id) },
      {
        onSuccess: () => {
          toast.add({
            title: `Merged into ${keepName}`,
            description: 'The other records were retired and their history moved across.',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not merge those records',
            description: mergeErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <section className="card bg-base-100 overflow-hidden">
      <header className="border-base-300 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Badge color={confidenceMeta(group.confidence).tone} variant="soft" size="sm">
          {confidenceMeta(group.confidence).label}
        </Badge>
        <Text className="text-sm">{reasonLabel(group.reason)}</Text>
        <div className="flex-1" />
        <Text className="text-sm">{group.customers.length} records</Text>
      </header>

      <ul className="divide-base-300 divide-y">
        {group.customers.map((customer) => (
          <CandidateRow
            key={customer.id}
            ctx={ctx}
            customer={customer}
            isPrimary={customer.id === primary.id}
            selectable={canMerge}
            onKeep={() => {
              setPrimaryId(customer.id);
            }}
          />
        ))}
      </ul>

      {canMerge ? (
        <footer className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
          <Text className="text-sm">
            Keeping <span className="font-semibold">{customerName(primary)}</span> — the other{' '}
            {duplicates.length === 1
              ? 'record merges'
              : `${String(duplicates.length)} records merge`}{' '}
            in.
          </Text>
          <Button
            size="sm"
            color="danger"
            loading={merge.isPending}
            disabled={duplicates.length === 0}
            onClick={() => {
              void onMerge();
            }}
          >
            <CopyCheck className="size-4" aria-hidden />
            Merge into this one
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

function CandidateRow({
  ctx,
  customer,
  isPrimary,
  selectable,
  onKeep,
}: {
  ctx: SurfaceContext;
  customer: Customer;
  isPrimary: boolean;
  selectable: boolean;
  onKeep: () => void;
}) {
  const meta = customerTypeMeta(customer.type);
  const stage = lifecycleStageMeta(customer.lifecycleStage);
  const spent = Number(customer.totalSpent);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      {selectable ? (
        <Button
          size="sm"
          variant={isPrimary ? 'soft' : 'outline'}
          color={isPrimary ? 'success' : 'neutral'}
          className="shrink-0"
          aria-pressed={isPrimary}
          onClick={onKeep}
        >
          {isPrimary ? <Check className="size-4" aria-hidden /> : null}
          {isPrimary ? 'Keeping' : 'Keep this one'}
        </Button>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="truncate text-left text-sm font-medium underline-offset-2 hover:underline"
            title="Open this customer"
            onClick={(event) => {
              ctx.open('crm.customer.detail', { id: customer.id }, { target: targetFor(event) });
            }}
          >
            {customerName(customer)}
          </button>
          {/* STAGE FIRST — it is the fact this choice turns on. The two records
              in a group are usually the same relationship type (both retail),
              so a pair of identical "Individual" chips told somebody nothing
              while the thing that actually differed — one is a paying customer,
              the other a lead somebody typed in last week — was not on screen at
              all. Type still shows when it is not the plain default. */}
          <Badge color={stage.color} variant="soft" size="sm">
            {stage.label}
          </Badge>
          {customer.type !== 'retail' ? (
            <Badge color={meta.color} variant="soft" size="sm">
              {meta.label}
            </Badge>
          ) : null}
          {customer.doNotContact ? (
            <Badge color="warning" variant="soft" size="sm">
              Asked not to be contacted
            </Badge>
          ) : null}
        </div>
        <Text className="truncate text-sm">
          {customer.email ?? 'No email'}
          {customer.company !== null ? ` · ${customer.company}` : ''}
        </Text>
      </div>

      <div className="shrink-0 text-right">
        <span className="block font-mono text-sm tabular-nums">{formatMoney(spent)}</span>
        <Text className="text-sm">{shortDate(customer.lastOrderAt)}</Text>
      </div>
    </li>
  );
}
