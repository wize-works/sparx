import { z } from 'zod';

export const UpdateAutomationInput = z
  .object({
    enabled: z.boolean().optional(),
    delaySeconds: z.number().int().min(0).max(2592000).optional(), // ≤ 30 days
    frequencyCapSeconds: z.number().int().min(0).max(31536000).nullable().optional(),
    conditions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type UpdateAutomationInput = z.infer<typeof UpdateAutomationInput>;

// Shape of an inbound trigger event the automation engine evaluates.
export const TriggerEventInput = z
  .object({
    type: z.string().min(1).max(63),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type TriggerEventInput = z.infer<typeof TriggerEventInput>;
