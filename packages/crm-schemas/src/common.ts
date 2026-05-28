// Shared primitive schemas reused across the CRM input types.
//
// These are the small leaf shapes that recur: UUIDs, ISO dates, the tag
// array shape, and the activity-actor type enum. Hoisted to one file so a
// rename or constraint change happens in one place.

import { z } from 'zod';

export const Uuid = z.string().uuid();

export const OptionalUuid = z.string().uuid().optional().nullable();

// Tags are stored as text[] in Postgres with VARCHAR(63) per slot; mirror
// the constraint at validation time so we never accept a tag that won't
// fit in the column.
export const TagList = z
  .array(
    z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Tags must be alphanumeric (plus _ and -)')
  )
  .max(50)
  .default([]);

export const CustomerType = z.enum(['prospect', 'retail', 'b2b']);
export type CustomerType = z.infer<typeof CustomerType>;

export const PreferredContactMethod = z.enum(['email', 'phone', 'sms']);
export type PreferredContactMethod = z.infer<typeof PreferredContactMethod>;

export const B2BAccountStatus = z.enum(['active', 'credit_hold', 'suspended', 'inactive']);
export type B2BAccountStatus = z.infer<typeof B2BAccountStatus>;

export const PaymentTerms = z.enum(['prepay', 'net15', 'net30', 'net60', 'net90']);
export type PaymentTerms = z.infer<typeof PaymentTerms>;

export const StageType = z.enum(['open', 'won', 'lost']);
export type StageType = z.infer<typeof StageType>;

export const TaskPriority = z.enum(['low', 'medium', 'high', 'urgent']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const TaskStatus = z.enum(['open', 'completed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

// Activity actor — set on every CrmActivity. Mirrors the actorType enum in
// docs/16 §7 (audit log) so cross-system events use the same vocabulary.
export const ActorType = z.enum(['staff', 'customer', 'system', 'api', 'mcp']);
export type ActorType = z.infer<typeof ActorType>;

// Activity types — canonical list. Service-layer ENUM check before insert.
// Extended carefully — adding a new value here means downstream consumers
// (timeline UI, MCP filters, segment rule predicates) get the new shape on
// the next build. Removals require a migration to rewrite historical rows.
export const ActivityType = z.enum([
  // Order lifecycle (consumed from Commerce events when that module ships)
  'order.placed',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'order.refunded',
  // Email engagement (consumed from Email module events)
  'email.sent',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.unsubscribed',
  // Quote / invoice lifecycle (consumed from B2B module events)
  'quote.submitted',
  'quote.accepted',
  'quote.declined',
  'quote.expired',
  'invoice.sent',
  'invoice.paid',
  'invoice.overdue',
  // Account / auth events
  'login',
  'password.reset',
  'account.created',
  // Manual staff entries
  'note',
  'call',
  'meeting',
  'file.attached',
  // Task lifecycle
  'task.created',
  'task.completed',
  // CRM-internal lifecycle
  'deal.created',
  'deal.stage.changed',
  'deal.closed',
  'deal.lost',
  'segment.entered',
  'segment.exited',
  'customer.merged',
  'customer.assigned',
  'b2b.credit_hold',
  'b2b.credit_resumed',
]);
export type ActivityType = z.infer<typeof ActivityType>;
