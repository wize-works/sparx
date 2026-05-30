import { z } from 'zod';

export const CreateBroadcastInput = z
  .object({
    name: z.string().min(1).max(160),
    subject: z.string().min(1).max(255),
    preheader: z.string().max(255).optional(),
    templateId: z.string().uuid().optional(),
    segmentId: z.string().uuid().optional(),
  })
  .strict();

export type CreateBroadcastInput = z.infer<typeof CreateBroadcastInput>;

export const UpdateBroadcastInput = z
  .object({
    name: z.string().min(1).max(160).optional(),
    subject: z.string().min(1).max(255).optional(),
    preheader: z.string().max(255).nullable().optional(),
    templateId: z.string().uuid().nullable().optional(),
    segmentId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type UpdateBroadcastInput = z.infer<typeof UpdateBroadcastInput>;

export const ScheduleBroadcastInput = z.object({ scheduledAt: z.string().datetime() }).strict();

export type ScheduleBroadcastInput = z.infer<typeof ScheduleBroadcastInput>;
