// Overdue-task reminder scheduler.
//
// Runs daily. For each open task whose dueAt is in the past, publishes
// crm.task.updated with reason: 'overdue_reminder' so the email automation
// engine can fire a templated reminder to the assignee. Idempotent via
// dedupeKey scoped to the day, so a re-fire on the same day is a no-op.

import { withTenant } from '@sparx/db';

import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';

export async function emitOverdueTaskReminders(ctx: ServiceContext): Promise<number> {
  const now = new Date();
  return withTenant(ctx, async (tx) => {
    const overdue = await tx.task.findMany({
      where: { status: 'open', dueAt: { not: null, lt: now } },
      select: {
        id: true,
        assignedToUserId: true,
        title: true,
        dueAt: true,
        customerId: true,
        dealId: true,
      },
      take: 5000,
    });
    for (const t of overdue) {
      const daysOverdue = t.dueAt
        ? Math.floor((now.getTime() - t.dueAt.getTime()) / 86_400_000)
        : 0;
      await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.task.updated',
        payload: {
          taskId: t.id,
          reason: 'overdue_reminder',
          assignedToUserId: t.assignedToUserId,
          title: t.title,
          daysOverdue,
          customerId: t.customerId,
          dealId: t.dealId,
        },
        dedupeKey: `crm.task.overdue_reminder:${t.id}:${now.toISOString().slice(0, 10)}`,
      });
    }
    return overdue.length;
  });
}
