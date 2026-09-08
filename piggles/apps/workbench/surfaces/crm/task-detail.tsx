'use client';

// One task — add it, then work it.
//
// Add and manage are the SAME surface: `{ id: 'new' }` builds a task, `{ id }`
// manages one. A task is editable, so its title is a field at the top, not a
// repeated heading; its state and the one action that matters most — marking it
// done — live in the toolbar. Completing goes through its own endpoint (it records
// who finished it and when), so it is a button of its own rather than a status
// dropdown buried in the form.

import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  Select,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { faCircleCheck } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useTeamRoster } from '../../lib/api/team';
import { useViewer } from '../../lib/api/shell-data';
import { useCustomers } from './customers-data';
import { customerName } from './customer-display';
import { SaveFailure } from '@/components/save-failure';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  isOverdue,
  taskErrorMessage,
  taskStatusMeta,
  useCompleteTask,
  useCreateTask,
  useDealOptions,
  useTask,
  useUpdateTask,
  type CreateTaskInput,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from './tasks-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'To do',
  completed: 'Done',
  cancelled: 'Cancelled',
};

/* ── datetime-local ⇄ ISO ───────────────────────────────────────────────── */

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (local.trim() === '') return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface Draft {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueLocal: string;
  assignedToUserId: string;
  customerId: string;
  dealId: string;
}

function emptyDraft(): Draft {
  return {
    title: '',
    description: '',
    priority: 'medium',
    status: 'open',
    dueLocal: '',
    assignedToUserId: '',
    customerId: '',
    dealId: '',
  };
}

function toDraft(task: Task): Draft {
  return {
    title: task.title,
    description: task.description ?? '',
    priority: (task.priority as TaskPriority) ?? 'medium',
    status: (task.status as TaskStatus) ?? 'open',
    dueLocal: isoToLocalInput(task.dueAt),
    assignedToUserId: task.assignedToUserId,
    customerId: task.customerId ?? '',
    dealId: task.dealId ?? '',
  };
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function TaskDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <TaskEditor ctx={ctx} id="new" /> : <TaskLoader ctx={ctx} id={id} />;
}

function TaskLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: task, isPending, isError, error, isFetching, dataUpdatedAt, refetch } = useTask(id);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="task"
            title="Could not load this task"
            description="This is a problem reaching the server, or the task has been removed. Nothing has been changed."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !task) {
    return <PaneWaiting />;
  }

  return (
    <TaskEditor
      ctx={ctx}
      id={id}
      task={task}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

function TaskEditor({
  ctx,
  id,
  task,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  task?: Task;
  /** The loader's query, threaded down. Absent while adding — a task that does
   *  not exist yet has nothing to re-read. */
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';
  const toast = useToast();

  const create = useCreateTask();
  const update = useUpdateTask(id);
  const complete = useCompleteTask(id);

  const { members: roster } = useTeamRoster();
  const { data: viewer } = useViewer();
  const { data: customers } = useCustomers({});
  const { data: deals } = useDealOptions();

  const saved = useMemo(() => (task ? toDraft(task) : emptyDraft()), [task]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  // A new task defaults to being assigned to whoever is creating it.
  useEffect(() => {
    if (isNew && !touched && draft.assignedToUserId === '' && viewer?.userId) {
      setDraft((cur) => ({ ...cur, assignedToUserId: viewer.userId }));
    }
  }, [isNew, touched, draft.assignedToUserId, viewer]);

  // Opened from a customer's or deal's profile ("New task"), the task arrives
  // pre-linked — the id rides in on ctx.params, seeded while the form is still
  // untouched so it reads as a starting point, not an unsaved edit.
  const presetCustomerId = typeof ctx.params.customerId === 'string' ? ctx.params.customerId : '';
  const presetDealId = typeof ctx.params.dealId === 'string' ? ctx.params.dealId : '';
  useEffect(() => {
    if (!isNew || touched) return;
    if (presetCustomerId === '' && presetDealId === '') return;
    setDraft((cur) => ({
      ...cur,
      customerId: presetCustomerId !== '' ? presetCustomerId : cur.customerId,
      dealId: presetDealId !== '' ? presetDealId : cur.dealId,
    }));
  }, [isNew, touched, presetCustomerId, presetDealId]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New task' : task ? task.title : 'Task');
  }, [ctx, isNew, task]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This task has not been added yet. Close anyway?'
      : 'This task has unsaved changes. Close anyway?'
  );

  const assigneeItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const m of roster) items[m.userId] = m.name ?? m.email;
    if (draft.assignedToUserId && !items[draft.assignedToUserId]) {
      items[draft.assignedToUserId] = 'A former team member';
    }
    return items;
  }, [roster, draft.assignedToUserId]);

  const customerItems = useMemo(() => {
    const items: Record<string, string> = { '': 'Not linked to a customer' };
    for (const c of customers?.items ?? []) items[c.id] = customerName(c);
    if (draft.customerId && !items[draft.customerId])
      items[draft.customerId] = 'A removed customer';
    return items;
  }, [customers, draft.customerId]);

  const dealItems = useMemo(() => {
    const items: Record<string, string> = { '': 'Not linked to a deal' };
    for (const d of deals?.items ?? []) items[d.id] = d.title ?? d.name ?? 'Untitled deal';
    if (draft.dealId && !items[draft.dealId]) items[draft.dealId] = 'A removed deal';
    return items;
  }, [deals, draft.dealId]);

  /* ── Validation ───────────────────────────────────────────────────────── */

  const titleError = draft.title.trim() === '' ? 'Give the task a title.' : null;
  const assigneeError = draft.assignedToUserId === '' ? 'Choose who should do this.' : null;
  const blocked = titleError ?? assigneeError;

  const failure =
    create.isError || update.isError
      ? taskErrorMessage(
          create.error ?? update.error,
          'The server did not answer. Nothing was changed and your work is still on screen — try again in a moment.'
        )
      : null;

  /* ── Submit ───────────────────────────────────────────────────────────── */

  const submit = () => {
    if (blocked) return;
    const base = {
      title: draft.title.trim(),
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      dueAt: localInputToIso(draft.dueLocal),
      priority: draft.priority,
      customerId: draft.customerId || null,
      dealId: draft.dealId || null,
    };

    if (isNew) {
      const input: CreateTaskInput = { ...base, assignedToUserId: draft.assignedToUserId };
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('crm.task.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${created.title} added`, type: 'success' });
          });
        },
      });
      return;
    }

    update.mutate(
      { ...base, assignedToUserId: draft.assignedToUserId, status: draft.status },
      {
        onSuccess: () => {
          setTouched(false);
          toast.add({ title: 'Task saved', type: 'success' });
        },
      }
    );
  };

  const onComplete = () => {
    complete.mutate(undefined, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Task marked done', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not mark it done',
          description: taskErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const overdue = task
    ? isOverdue({ status: draft.status, dueAt: localInputToIso(draft.dueLocal) })
    : false;
  const meta = taskStatusMeta(draft.status, overdue);
  const isDone = draft.status === 'completed';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Task actions"
        refresh={
          onRefresh ? (
            <RefreshButton
              isFetching={Boolean(isFetching)}
              updatedAt={task ? updatedAt : undefined}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
        status={
          <Badge color={meta.tone} variant="soft" size="sm">
            {meta.label}
          </Badge>
        }
        primary={
          <>
            {!isNew && !isDone ? (
              <Button
                size="sm"
                variant="outline"
                color="success"
                className="ml-auto shrink-0"
                loading={complete.isPending}
                onClick={onComplete}
              >
                <Icon glyph={faCircleCheck} className="size-4" aria-hidden />
                Mark done
              </Button>
            ) : null}
            <Button
              color="module"
              size="sm"
              className={isNew || isDone ? 'ml-auto shrink-0' : 'shrink-0'}
              loading={saving}
              disabled={Boolean(blocked) || (!isNew && !dirty)}
              onClick={submit}
            >
              {isNew ? 'Add task' : 'Save'}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <Text>
              A task is something to do for a customer or a deal — a call to make, a quote to send.
              Give it to someone on your team and, if it matters, a date it is due.
            </Text>
          ) : null}

          <SaveFailure title="Could not save this task" message={failure} />

          <FormSection title="The task">
            <Field>
              <FieldLabel>Title</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={titleError && touched ? 'error' : 'module'}
                    value={draft.title}
                    placeholder="Call back about the quote"
                    onChange={(event) => {
                      set('title', event.target.value);
                    }}
                  />
                }
              />
              {titleError && touched ? (
                <FieldStatus status="error">{titleError}</FieldStatus>
              ) : null}
            </Field>

            <Field>
              <FieldLabel>Notes</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={draft.description}
                    placeholder="Anything worth remembering about this task."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection title="When and who">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Due</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="datetime-local"
                      value={draft.dueLocal}
                      onChange={(event) => {
                        set('dueLocal', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Leave empty for a task with no deadline.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <Select
                  color="module"
                  aria-label="Priority"
                  value={draft.priority}
                  items={Object.fromEntries(TASK_PRIORITIES.map((p) => [p.value, p.label]))}
                  onValueChange={(next) => {
                    set('priority', next as TaskPriority);
                  }}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Assigned to</FieldLabel>
              <Select
                color={assigneeError && touched ? 'error' : 'module'}
                aria-label="Who should do this"
                value={draft.assignedToUserId}
                items={assigneeItems}
                onValueChange={(next) => {
                  set('assignedToUserId', next as string);
                }}
              />
              {assigneeError && touched ? (
                <FieldStatus status="error">{assigneeError}</FieldStatus>
              ) : (
                <FieldDescription>The person on your team who owns this task.</FieldDescription>
              )}
            </Field>

            {!isNew ? (
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select
                  color="module"
                  aria-label="Status"
                  value={draft.status}
                  items={Object.fromEntries(TASK_STATUSES.map((s) => [s, STATUS_LABELS[s]]))}
                  onValueChange={(next) => {
                    set('status', next as TaskStatus);
                  }}
                />
                <FieldDescription>
                  Use “Mark done” in the bar to record who finished it and when; this dropdown is
                  for reopening or cancelling.
                </FieldDescription>
              </Field>
            ) : null}
          </FormSection>

          <FormSection
            title="What it is about"
            description="Link the task to a customer or a deal so it shows on their timeline. Both are optional."
          >
            <Field>
              <FieldLabel>Customer</FieldLabel>
              <Select
                color="module"
                aria-label="Linked customer"
                value={draft.customerId}
                items={customerItems}
                onValueChange={(next) => {
                  set('customerId', next as string);
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Deal</FieldLabel>
              <Select
                color="module"
                aria-label="Linked deal"
                value={draft.dealId}
                items={dealItems}
                onValueChange={(next) => {
                  set('dealId', next as string);
                }}
              />
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}
