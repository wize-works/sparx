'use client';

// Merge candidates UI — pick a primary from the group, mark the others as
// duplicates, fire the mergeCustomersAction. Refresh after success.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import type { Customer } from '@sparx/db';
import { Badge, Button, Stack, Text } from '@sparx/ui';

import { mergeCustomersAction } from '../../actions';

interface Props {
  customers: Customer[];
}

export function MergeCandidatesGroup({ customers }: Props) {
  const router = useRouter();
  const [primaryId, setPrimaryId] = useState<string>(customers[0]?.id ?? '');
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(
    () => new Set(customers.slice(1).map((c) => c.id))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function selectPrimary(id: string) {
    setPrimaryId(id);
    const nextDups = new Set(duplicateIds);
    nextDups.delete(id);
    // If only one duplicate would remain after promoting, restore the
    // previous primary as a duplicate so the merge still has something to do.
    if (nextDups.size === 0) {
      for (const c of customers) {
        if (c.id !== id) nextDups.add(c.id);
      }
    }
    setDuplicateIds(nextDups);
  }

  function toggleDuplicate(id: string) {
    if (id === primaryId) return;
    const next = new Set(duplicateIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDuplicateIds(next);
  }

  function onMerge() {
    setError(null);
    if (!primaryId || duplicateIds.size === 0) {
      setError('Pick a primary and at least one duplicate.');
      return;
    }
    startTransition(async () => {
      const result = await mergeCustomersAction({
        primaryCustomerId: primaryId,
        duplicateCustomerIds: [...duplicateIds],
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        {customers.map((c) => {
          const isPrimary = c.id === primaryId;
          const isDup = duplicateIds.has(c.id);
          return (
            <Stack
              key={c.id}
              direction="row"
              align="center"
              justify="between"
              className={`rounded-md border p-3 ${
                isPrimary
                  ? 'border-[var(--module-active)] bg-[var(--module-active-subtle,transparent)]'
                  : 'border-[var(--color-border-default)]'
              }`}
            >
              <Stack gap={1}>
                <Stack direction="row" align="center" gap={2} wrap>
                  <Link
                    href={`/crm/customers/${c.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {customerDisplayName(c)}
                  </Link>
                  <Badge variant="outline">{c.type}</Badge>
                  {c.email && (
                    <Text size="xs" variant="muted">
                      {c.email}
                    </Text>
                  )}
                  {c.orderCount > 0 && (
                    <Badge variant="success">
                      {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                    </Badge>
                  )}
                </Stack>
                <Text size="xs" variant="muted">
                  Updated {c.updatedAt.toLocaleString()} · Total spent $
                  {Number(c.totalSpent).toLocaleString()}
                </Text>
              </Stack>
              <Stack direction="row" gap={2}>
                <Button
                  size="sm"
                  variant={isPrimary ? 'module' : 'secondary'}
                  onClick={() => selectPrimary(c.id)}
                  disabled={pending}
                >
                  {isPrimary ? 'Primary' : 'Make primary'}
                </Button>
                <Button
                  size="sm"
                  variant={isDup ? 'danger' : 'secondary'}
                  onClick={() => toggleDuplicate(c.id)}
                  disabled={pending || isPrimary}
                >
                  {isDup ? 'Will merge' : 'Skip'}
                </Button>
              </Stack>
            </Stack>
          );
        })}
      </Stack>

      {error && (
        <Text size="sm" variant="danger">
          {error}
        </Text>
      )}

      <Stack direction="row" gap={2}>
        <Button onClick={onMerge} variant="module" disabled={pending}>
          {pending ? 'Merging…' : `Merge ${duplicateIds.size} into primary`}
        </Button>
        <Text size="xs" variant="muted">
          Activities, deals, tasks, and addresses on the duplicates reattach to the primary. The
          duplicates are soft-deleted with a pointer to the primary.
        </Text>
      </Stack>
    </Stack>
  );
}

function customerDisplayName(c: Customer): string {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (c.company) return c.company;
  if (c.email) return c.email;
  return 'Unnamed customer';
}
