// Task input schemas. docs/11 §6.

import { z } from 'zod';

import { TaskPriority, TaskStatus, Uuid } from './common';

export const CreateTaskInput = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  priority: TaskPriority.default('medium'),
  assignedToUserId: Uuid,
  customerId: Uuid.nullable().optional(),
  dealId: Uuid.nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const UpdateTaskInput = CreateTaskInput.omit({ assignedToUserId: true }).partial().extend({
  assignedToUserId: Uuid.optional(),
  status: TaskStatus.optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

// Completing a task is a separate path so we can record the completing
// user and emit crm.task.completed in one place.
export const CompleteTaskInput = z.object({
  taskId: Uuid,
});
export type CompleteTaskInput = z.infer<typeof CompleteTaskInput>;
