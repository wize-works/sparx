'use client';

// Task row — title + priority + due date + complete button.
// Complete is an inline action that hits taskService.complete via the
// Server Action; no navigation required.

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Calendar } from 'lucide-react';

import { Badge, Button, Stack, Text, toast } from '@sparx/ui';

import { completeTaskAction } from '../../activity-task-actions';

export interface TaskCard {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  customerId: string | null;
  dealId: string | null;
  assignedToUserId: string;
}

const PRIORITY_VARIANT: Record<string, 'outline' | 'warning' | 'danger' | 'success'> = {
  low: 'outline',
  medium: 'outline',
  high: 'warning',
  urgent: 'danger',
};

export function TaskRow({ task, overdue }: { task: TaskCard; overdue?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const isOpen = task.status === 'open';

  function complete() {
    startTransition(async () => {
      const result = await completeTaskAction(task.id);
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not complete task');
        return;
      }
      toast.success('Task completed');
      router.refresh();
    });
  }

  const dueText = task.dueAt
    ? new Date(task.dueAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <Stack
      direction="row"
      align="center"
      gap={3}
      className={`rounded-md border p-3 ${
        overdue
          ? 'border-[var(--color-danger-500)] bg-[var(--color-danger-soft)]'
          : 'border-[var(--color-border-default)]'
      }`}
    >
      {isOpen && (
        <button
          type="button"
          onClick={complete}
          disabled={pending}
          aria-label="Complete task"
          className="flex h-5 w-5 items-center justify-center rounded-md border border-[var(--color-border-default)] hover:border-[var(--module-active)] disabled:opacity-50"
        >
          {pending && <Check className="h-3 w-3 animate-pulse" />}
        </button>
      )}
      {!isOpen && (
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-success-500)] text-white">
          <Check className="h-3 w-3" />
        </div>
      )}
      <Stack gap={1} className="min-w-0 flex-1">
        <Text
          size="sm"
          weight="medium"
          className={isOpen ? '' : 'text-[var(--color-text-tertiary)] line-through'}
        >
          {task.title}
        </Text>
        <Stack direction="row" align="center" gap={2} wrap>
          <Badge color={PRIORITY_VARIANT[task.priority] ?? 'outline'} className="text-xs">
            {task.priority}
          </Badge>
          {task.customerId && (
            <Link
              href={`/crm/customers/${task.customerId}`}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--module-active)] hover:underline"
            >
              Customer
            </Link>
          )}
          {task.dealId && (
            <Link
              href={`/crm/deals/${task.dealId}`}
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--module-active)] hover:underline"
            >
              Deal
            </Link>
          )}
        </Stack>
      </Stack>
      {dueText && (
        <Stack direction="row" align="center" gap={1}>
          <Calendar className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
          <Text size="xs" variant="muted">
            {dueText}
          </Text>
        </Stack>
      )}
      {isOpen && !pending && (
        <Button variant="ghost" size="sm" onClick={complete}>
          Complete
        </Button>
      )}
    </Stack>
  );
}
