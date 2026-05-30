import Link from 'next/link';
import { CheckSquare, Plus, Calendar, AlertCircle } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { CrmTabs } from '../_components/crm-tabs';
import { TaskRow } from './_components/task-row';

interface TaskListItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  customerId: string | null;
  dealId: string | null;
  assignedToUserId: string;
}

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = await searchParams;
  const scope = stringParam(params.scope) ?? 'me';

  const mine = scope === 'me' ? `&assigned_to_user_id=${session.user.id}` : '';
  const overdueQuery = scope === 'me' ? `?user_id=${session.user.id}` : '';
  const [openTasks, overdueTasks, completedTasks] = await Promise.all([
    api.get<TaskListItem[]>(`/v1/crm/tasks?status=open&take=100${mine}`),
    api.get<TaskListItem[]>(`/v1/crm/tasks/overdue${overdueQuery}`),
    api.get<TaskListItem[]>(`/v1/crm/tasks?status=completed&take=25${mine}`),
  ]);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="tasks" />
        <Stack direction="row" align="end" justify="between" wrap>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <CheckSquare className="h-5 w-5" />
              <Heading level={1}>Tasks</Heading>
              <Badge variant="module">{openTasks.length} open</Badge>
              {overdueTasks.length > 0 && (
                <Badge variant="danger">{overdueTasks.length} overdue</Badge>
              )}
            </Stack>
            <Text variant="muted">
              Follow-ups attached to customers, deals, or standalone reminders. Overdue tasks
              trigger an email reminder to the assignee via the automation engine.
            </Text>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button asChild variant={scope === 'me' ? 'module' : 'ghost'}>
              <Link href="/crm/tasks?scope=me">My tasks</Link>
            </Button>
            <Button asChild variant={scope === 'all' ? 'module' : 'ghost'}>
              <Link href="/crm/tasks?scope=all">Team tasks</Link>
            </Button>
            <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/crm/tasks/new">New task</Link>
            </Button>
          </Stack>
        </Stack>

        {overdueTasks.length > 0 && (
          <Card variant="module">
            <CardHeader>
              <CardTitle>
                <Stack direction="row" align="center" gap={2}>
                  <AlertCircle className="h-4 w-4" /> Overdue
                  <Badge variant="danger">{overdueTasks.length}</Badge>
                </Stack>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                {overdueTasks.map((task) => (
                  <TaskRow key={task.id} task={serializeTask(task)} overdue />
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              <Stack direction="row" align="center" gap={2}>
                <Calendar className="h-4 w-4" /> Open
                <Badge variant="outline">{openTasks.length}</Badge>
              </Stack>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openTasks.length === 0 ? (
              <EmptyState
                title="No open tasks"
                description="Create a task to track follow-ups, calls, or to-dos for yourself or your team."
              />
            ) : (
              <Stack gap={2}>
                {openTasks.map((task) => (
                  <TaskRow key={task.id} task={serializeTask(task)} />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        {completedTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recently completed</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                {completedTasks.map((task) => (
                  <TaskRow key={task.id} task={serializeTask(task)} />
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

function serializeTask(task: TaskListItem) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    customerId: task.customerId,
    dealId: task.dealId,
    assignedToUserId: task.assignedToUserId,
  };
}

function stringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
