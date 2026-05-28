// taskService — staff tasks (docs/11 §6).
//
// Tasks have three side effects that matter:
//   1. Creating a task drops a "task.created" CrmActivity so the customer/
//      deal timeline shows it.
//   2. Completing a task drops "task.completed" and emits
//      crm.task.completed (Phase 5 reminder worker subscribes).
//   3. Overdue tasks are read by the Phase 5 scheduler — getOverdue() is
//      what that worker calls.

import { CompleteTaskInput, CreateTaskInput, UpdateTaskInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, Task } from '@sparx/db';

import { writeAuditLog } from '../audit.js';
import { publishCrmEvent } from '../events.js';
import type { ServiceContext } from '../errors.js';
import { CrmNotFoundError } from '../errors.js';

export interface ListTasksFilter {
  assignedToUserId?: string;
  customerId?: string;
  dealId?: string;
  status?: 'open' | 'completed' | 'cancelled';
  dueBefore?: Date;
  take?: number;
}

export async function list(ctx: ServiceContext, filter: ListTasksFilter = {}): Promise<Task[]> {
  return withTenant(ctx, (tx) =>
    tx.task.findMany({
      where: {
        ...(filter.assignedToUserId ? { assignedToUserId: filter.assignedToUserId } : {}),
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
        ...(filter.dealId ? { dealId: filter.dealId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.dueBefore ? { dueAt: { lte: filter.dueBefore } } : {}),
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: Math.min(filter.take ?? 50, 250),
    })
  );
}

export async function get(ctx: ServiceContext, taskId: string): Promise<Task> {
  const task = await withTenant(ctx, (tx) => tx.task.findUnique({ where: { id: taskId } }));
  if (!task) throw new CrmNotFoundError('Task', taskId);
  return task;
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<Task> {
  const input = CreateTaskInput.parse(rawInput);
  if (!ctx.userId) {
    // createdBy is NOT NULL — refuse rather than write a system-created task
    // for a path that's supposed to have a logged-in user.
    throw new Error('taskService.create requires ctx.userId');
  }
  const userId = ctx.userId;

  const task = await withTenant(ctx, async (tx) => {
    const created = await tx.task.create({
      data: {
        tenantId: ctx.tenantId,
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        priority: input.priority,
        assignedToUserId: input.assignedToUserId,
        createdByUserId: userId,
        customerId: input.customerId ?? null,
        dealId: input.dealId ?? null,
      },
    });

    // Timeline entry. Anchored to whichever entity the task is scoped to.
    if (created.customerId || created.dealId) {
      await tx.crmActivity.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: created.customerId,
          dealId: created.dealId,
          type: 'task.created',
          description: `Task created: ${created.title}`,
          actorId: userId,
          actorType: 'staff',
          occurredAt: created.createdAt,
          linkedEntityType: 'Task',
          linkedEntityId: created.id,
        },
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: userId,
      actorType: 'user',
      action: 'crm.task.created',
      entityType: 'Task',
      entityId: created.id,
      diff: {
        after: {
          title: created.title,
          assignedToUserId: created.assignedToUserId,
          dueAt: created.dueAt?.toISOString() ?? null,
        },
      },
    });

    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.task.created',
    payload: {
      taskId: task.id,
      assignedToUserId: task.assignedToUserId,
      dueAt: task.dueAt?.toISOString() ?? null,
    },
    dedupeKey: `crm.task.created:${task.id}`,
  });

  return task;
}

export async function update(
  ctx: ServiceContext,
  taskId: string,
  rawInput: unknown
): Promise<Task> {
  const input = UpdateTaskInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const before = await tx.task.findUnique({ where: { id: taskId } });
    if (!before) throw new CrmNotFoundError('Task', taskId);

    const data: Prisma.TaskUncheckedUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.dealId !== undefined ? { dealId: input.dealId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    const updated = await tx.task.update({ where: { id: taskId }, data });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.task.updated',
      entityType: 'Task',
      entityId: updated.id,
      diff: null,
    });
    return updated;
  });
}

export async function complete(ctx: ServiceContext, rawInput: unknown): Promise<Task> {
  const { taskId } = CompleteTaskInput.parse(rawInput);
  if (!ctx.userId) {
    throw new Error('taskService.complete requires ctx.userId');
  }
  const userId = ctx.userId;

  const task = await withTenant(ctx, async (tx) => {
    const before = await tx.task.findUnique({ where: { id: taskId } });
    if (!before) throw new CrmNotFoundError('Task', taskId);
    if (before.status === 'completed') return before; // idempotent

    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completedByUserId: userId,
      },
    });

    if (updated.customerId || updated.dealId) {
      await tx.crmActivity.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: updated.customerId,
          dealId: updated.dealId,
          type: 'task.completed',
          description: `Task completed: ${updated.title}`,
          actorId: userId,
          actorType: 'staff',
          occurredAt: updated.completedAt ?? new Date(),
          linkedEntityType: 'Task',
          linkedEntityId: updated.id,
        },
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: userId,
      actorType: 'user',
      action: 'crm.task.completed',
      entityType: 'Task',
      entityId: updated.id,
      diff: null,
    });
    return updated;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.task.completed',
    payload: { taskId: task.id, completedByUserId: userId },
    dedupeKey: `crm.task.completed:${task.id}`,
  });

  return task;
}

/** Tasks past their due date for the supplied user (or every user if
 *  omitted). The Phase 5 overdue-reminder worker calls this. */
export async function getOverdue(
  ctx: ServiceContext,
  args: { userId?: string } = {}
): Promise<Task[]> {
  return withTenant(ctx, (tx) =>
    tx.task.findMany({
      where: {
        status: 'open',
        dueAt: { lt: new Date() },
        ...(args.userId ? { assignedToUserId: args.userId } : {}),
      },
      orderBy: { dueAt: 'asc' },
    })
  );
}

/** Tasks due today for the supplied user — drives the "Today's Tasks"
 *  dashboard widget. */
export async function getTodayForUser(
  ctx: ServiceContext,
  args: { userId: string }
): Promise<Task[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  return withTenant(ctx, (tx) =>
    tx.task.findMany({
      where: {
        assignedToUserId: args.userId,
        status: 'open',
        OR: [
          { dueAt: { gte: startOfDay, lte: endOfDay } },
          { dueAt: { lt: startOfDay } }, // overdue still surfaces in "Today"
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
    })
  );
}
