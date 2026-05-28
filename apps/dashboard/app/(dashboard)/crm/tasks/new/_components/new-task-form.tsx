'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createTaskAction } from '../../../activity-task-actions';

interface NewTaskFormProps {
  currentUserId: string;
  users: { id: string; label: string }[];
  customers: { id: string; label: string }[];
  preselectedCustomerId: string | null;
  preselectedDealId: string | null;
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export function NewTaskForm({
  currentUserId,
  users,
  customers,
  preselectedCustomerId,
  preselectedDealId,
}: NewTaskFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = {
      title: nonEmpty(form.get('title')),
      description: nonEmpty(form.get('description')),
      dueAt: toIsoDateTime(form.get('dueAt')),
      priority: nonEmpty(form.get('priority')) ?? 'medium',
      assignedToUserId: form.get('assignedToUserId') as string,
      customerId: nonEmpty(form.get('customerId')) ?? preselectedCustomerId ?? undefined,
      dealId: preselectedDealId ?? undefined,
    };

    startTransition(async () => {
      const result = await createTaskAction(input);
      if (result.ok) {
        router.push('/crm/tasks');
        router.refresh();
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Task details</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <Stack gap={2}>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="Follow up on Acme renewal" />
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} />
            </Stack>
            <Stack direction="row" gap={4}>
              <Stack gap={2} className="flex-1">
                <Label htmlFor="assignedToUserId">Assigned to</Label>
                <select
                  id="assignedToUserId"
                  name="assignedToUserId"
                  defaultValue={currentUserId}
                  className={SELECT_CLASS}
                  required
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Stack>
              <Stack gap={2} className="w-40">
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue="medium"
                  className={SELECT_CLASS}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </Stack>
              <Stack gap={2} className="w-44">
                <Label htmlFor="dueAt">Due date</Label>
                <Input id="dueAt" name="dueAt" type="date" />
              </Stack>
            </Stack>
            {!preselectedDealId && (
              <Stack gap={2}>
                <Label htmlFor="customerId">Customer</Label>
                <select
                  id="customerId"
                  name="customerId"
                  defaultValue={preselectedCustomerId ?? ''}
                  className={SELECT_CLASS}
                >
                  <option value="">(none)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Stack>
            )}

            {error && (
              <Text size="sm" variant="danger" role="alert" aria-live="polite">
                {error}
              </Text>
            )}
          </Stack>
        </CardContent>
        <CardFooter>
          <Button variant="ghost" asChild>
            <Link href="/crm/tasks">Cancel</Link>
          </Button>
          <Button type="submit" variant="module" disabled={pending} loading={pending}>
            Create task
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toIsoDateTime(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return undefined;
  return new Date(`${s}T00:00:00Z`).toISOString();
}
