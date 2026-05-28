// Customer input schemas.
//
// Validation contract for the customer write path. The service layer wraps
// every Prisma write with one of these schemas — the locked customers-table
// architecture (decision #1: one table, type-aware) means every customer
// goes through these same shapes regardless of whether they originate as a
// prospect, a guest checkout, or a B2B contact.

import { z } from 'zod';

import { CustomerType, PreferredContactMethod, TagList, Uuid } from './common.js';

// GDPR consent shape (stored in customers.gdpr_consent JSONB).
// Captured at the moment consent was granted; never mutated retroactively.
const GdprConsent = z.object({
  grantedAt: z.string().datetime().optional(),
  source: z.enum(['signup', 'checkout', 'import', 'admin', 'api']).optional(),
  scope: z.array(z.enum(['marketing', 'transactional', 'profiling'])).optional(),
  ipAddress: z.string().optional(),
});
export type GdprConsent = z.infer<typeof GdprConsent>;

export const CreateCustomerInput = z.object({
  type: CustomerType.default('prospect'),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  firstName: z.string().max(255).nullable().optional(),
  lastName: z.string().max(255).nullable().optional(),
  company: z.string().max(255).nullable().optional(),
  jobTitle: z.string().max(255).nullable().optional(),
  b2bAccountId: Uuid.nullable().optional(),
  assignedRepId: Uuid.nullable().optional(),
  preferredContactMethod: PreferredContactMethod.nullable().optional(),
  doNotContact: z.boolean().default(false),
  gdprConsent: GdprConsent.optional(),
  tags: TagList.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;

export const UpdateCustomerInput = CreateCustomerInput.partial();
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerInput>;

// Merge — picks a primary and a list of duplicates to fold into it.
// Service-layer enforces tenant-id match on every id; database-layer RLS is
// the backstop.
export const MergeCustomersInput = z.object({
  primaryCustomerId: Uuid,
  duplicateCustomerIds: z.array(Uuid).min(1).max(20),
});
export type MergeCustomersInput = z.infer<typeof MergeCustomersInput>;

// Bulk operations — used by the dashboard's bulk-action menu and by the
// MCP bulk_assign_customers / bulk_tag_customers tools.
export const BulkAssignCustomersInput = z.object({
  customerIds: z.array(Uuid).min(1).max(500),
  assignedRepId: Uuid.nullable(),
});
export type BulkAssignCustomersInput = z.infer<typeof BulkAssignCustomersInput>;

export const BulkTagCustomersInput = z.object({
  customerIds: z.array(Uuid).min(1).max(500),
  addTags: z.array(z.string().min(1).max(63)).optional(),
  removeTags: z.array(z.string().min(1).max(63)).optional(),
});
export type BulkTagCustomersInput = z.infer<typeof BulkTagCustomersInput>;

// Customer address — separate row in customer_addresses.
export const CreateCustomerAddressInput = z.object({
  customerId: Uuid,
  type: z.enum(['shipping', 'billing', 'both']),
  label: z.string().max(120).optional(),
  isDefault: z.boolean().default(false),
  recipientName: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).optional(),
  city: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  postalCode: z.string().max(32).optional(),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/, 'Country must be ISO 3166-1 alpha-2 (e.g. "US")'),
  phone: z.string().max(50).optional(),
});
export type CreateCustomerAddressInput = z.infer<typeof CreateCustomerAddressInput>;

export const UpdateCustomerAddressInput = CreateCustomerAddressInput.omit({
  customerId: true,
}).partial();
export type UpdateCustomerAddressInput = z.infer<typeof UpdateCustomerAddressInput>;
