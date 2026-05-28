// B2B account input schemas.
//
// docs/10-b2b-wholesale-prd.md §2. Phase 1 ships the record shape; the B2B
// module adds quote / credit-hold / approval workflows later — those tables
// FK back into this row rather than redefining the account.

import { z } from 'zod';

import { B2BAccountStatus, PaymentTerms, TagList, Uuid } from './common';

// Engine profile shape stored in b2b_accounts.engine_profiles JSONB. Used
// by the fitment-aware catalog when Commerce lands. Each profile is one
// engine variant the fleet runs — fleet_size on the parent row is the
// aggregate count, this array describes the variants.
const EngineProfile = z.object({
  year: z.number().int().min(1900).max(2100).optional(),
  make: z.string().max(60),
  model: z.string().max(60),
  engine: z.string().max(120).optional(),
  count: z.number().int().min(0).optional(),
});
export type EngineProfile = z.infer<typeof EngineProfile>;

export const CreateB2BAccountInput = z.object({
  companyName: z.string().min(1).max(255),
  taxId: z.string().max(64).nullable().optional(),
  website: z.string().url().max(2048).nullable().optional(),
  pricingTier: z.string().max(63).nullable().optional(),
  creditLimit: z.number().min(0).max(99_999_999.99).default(0),
  paymentTerms: PaymentTerms.nullable().optional(),
  discountPercent: z.number().min(0).max(100).default(0),
  status: B2BAccountStatus.default('active'),
  assignedRepId: Uuid.nullable().optional(),
  fleetSize: z.number().int().min(0).nullable().optional(),
  engineProfiles: z.array(EngineProfile).max(100).default([]),
  notes: z.string().max(10_000).nullable().optional(),
  tags: TagList.optional(),
});
export type CreateB2BAccountInput = z.infer<typeof CreateB2BAccountInput>;

export const UpdateB2BAccountInput = CreateB2BAccountInput.partial();
export type UpdateB2BAccountInput = z.infer<typeof UpdateB2BAccountInput>;
