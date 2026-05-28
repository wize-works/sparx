// CRM activity input schemas.
//
// Activities are an append-only event log (locked decision #3). The single
// write path is activityService.record(), which validates against this
// schema. Edits to existing notes never mutate the row — they insert a new
// row with correctsActivityId pointing at the original.

import { z } from 'zod';

import { ActivityType, ActorType, Uuid } from './common';

export const CreateActivityInput = z
  .object({
    type: ActivityType,
    description: z.string().max(10_000).nullable().optional(),

    // At least one anchor — customer, deal, or b2bAccount. Service layer
    // enforces this with a refinement so we can't insert orphan activities.
    customerId: Uuid.nullable().optional(),
    dealId: Uuid.nullable().optional(),
    b2bAccountId: Uuid.nullable().optional(),

    actorId: Uuid.nullable().optional(),
    actorType: ActorType,

    // Defaults to now if omitted — historical imports can backfill.
    occurredAt: z.string().datetime().optional(),

    linkedEntityType: z.string().max(63).nullable().optional(),
    linkedEntityId: Uuid.nullable().optional(),

    metadata: z.record(z.string(), z.unknown()).optional(),
    correctsActivityId: Uuid.nullable().optional(),
  })
  .refine(
    (input) => input.customerId != null || input.dealId != null || input.b2bAccountId != null,
    {
      message: 'Activity must anchor to at least one of: customerId, dealId, b2bAccountId',
    }
  );
export type CreateActivityInput = z.infer<typeof CreateActivityInput>;

// List filters — used by activityService.list (Server Action + MCP).
export const ListActivitiesInput = z.object({
  customerId: Uuid.optional(),
  dealId: Uuid.optional(),
  b2bAccountId: Uuid.optional(),
  type: ActivityType.optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
});
export type ListActivitiesInput = z.infer<typeof ListActivitiesInput>;
