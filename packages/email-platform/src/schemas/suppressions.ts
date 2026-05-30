import { z } from 'zod';

export const SUPPRESSION_SCOPES = ['transactional', 'marketing', 'all'] as const;
export const SUPPRESSION_REASONS = ['bounce', 'complaint', 'unsubscribe', 'manual'] as const;

export const AddSuppressionInput = z
  .object({
    email: z.string().email('Enter a valid email address.').toLowerCase(),
    scope: z.enum(SUPPRESSION_SCOPES).default('all'),
    reason: z.enum(SUPPRESSION_REASONS).default('manual'),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type AddSuppressionInput = z.infer<typeof AddSuppressionInput>;

export const ImportSuppressionsInput = z
  .object({
    emails: z.array(z.string().email().toLowerCase()).min(1).max(5000),
    scope: z.enum(SUPPRESSION_SCOPES).default('all'),
    reason: z.enum(SUPPRESSION_REASONS).default('manual'),
  })
  .strict();

export type ImportSuppressionsInput = z.infer<typeof ImportSuppressionsInput>;

export const ListSuppressionsQuery = z
  .object({
    scope: z.enum(SUPPRESSION_SCOPES).optional(),
    q: z.string().max(255).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export type ListSuppressionsQuery = z.infer<typeof ListSuppressionsQuery>;
