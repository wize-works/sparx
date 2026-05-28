// Customer merge / dedupe.
//
// The "two customers, one person" problem is real for every CRM the moment
// you accept guest checkouts: same email shows up twice (case difference,
// trailing whitespace), same person uses two emails, same household. The
// merge service collapses N duplicates into a chosen primary by:
//
//   1. Moving ALL activities, deals, tasks from each duplicate onto the
//      primary's customer_id.
//   2. Stitching the duplicate's commerce stats into the primary (sum of
//      total_spent, sum of order_count, min(first_order_at), max(last_order_at)).
//   3. Unifying tags (union).
//   4. Filling primary fields the primary is missing from the most recent
//      duplicate that has them (email, phone, names — but never overwrite
//      existing primary fields).
//   5. Soft-deleting the duplicate, setting merged_into_customer_id so the
//      audit trail survives, and recording a customer.merged activity on
//      the primary.
//
// All of the above runs in a single transaction. If any step fails the
// merge is fully reverted.

import { MergeCustomersInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Customer } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';

export interface MergeResult {
    primary: Customer;
    /** Soft-deleted duplicates — `mergedIntoCustomerId` is set on each. */
    merged: Customer[];
    /** Activity / deal / task rows reattached to the primary. */
    reattached: {
        activities: number;
        deals: number;
        tasks: number;
        addresses: number;
    };
}

/** Collapse `duplicateCustomerIds` into `primaryCustomerId`. All ids must
 *  belong to the caller's tenant (RLS is the backstop; service-layer asserts
 *  the relationship explicitly so we can emit a clean validation error). */
export async function merge(ctx: ServiceContext, rawInput: unknown): Promise<MergeResult> {
    const input = MergeCustomersInput.parse(rawInput);
    if (input.duplicateCustomerIds.includes(input.primaryCustomerId)) {
        throw new CrmValidationError('Primary cannot also be in duplicates list', [
            { field: 'duplicateCustomerIds', message: 'must not include primaryCustomerId' },
        ]);
    }

    const result = await withTenant(ctx, async (tx) => {
        const primary = await tx.customer.findUnique({
            where: { id: input.primaryCustomerId },
        });
        if (primary?.deletedAt !== null) {
            throw new CrmNotFoundError('Customer', input.primaryCustomerId);
        }

        const duplicates = await tx.customer.findMany({
            where: { id: { in: input.duplicateCustomerIds } },
        });
        if (duplicates.length !== input.duplicateCustomerIds.length) {
            const found = new Set(duplicates.map((d) => d.id));
            const missing = input.duplicateCustomerIds.find((id) => !found.has(id))!;
            throw new CrmNotFoundError('Customer', missing);
        }
        const liveDuplicates = duplicates.filter((d) => d.deletedAt === null);
        if (liveDuplicates.length === 0) {
            // Nothing to merge — surface as a no-op rather than an error so the
            // caller can be idempotent.
            return {
                primary,
                merged: [],
                reattached: { activities: 0, deals: 0, tasks: 0, addresses: 0 },
            };
        }

        const duplicateIds = liveDuplicates.map((d) => d.id);

        // 1. Reattach child rows to the primary. Each updateMany is one query.
        const [activities, deals, tasks, addresses] = await Promise.all([
            tx.crmActivity.updateMany({
                where: { customerId: { in: duplicateIds } },
                data: { customerId: input.primaryCustomerId },
            }),
            tx.deal.updateMany({
                where: { customerId: { in: duplicateIds }, deletedAt: null },
                data: { customerId: input.primaryCustomerId },
            }),
            tx.task.updateMany({
                where: { customerId: { in: duplicateIds } },
                data: { customerId: input.primaryCustomerId },
            }),
            tx.customerAddress.updateMany({
                where: { customerId: { in: duplicateIds } },
                data: { customerId: input.primaryCustomerId },
            }),
        ]);

        // 2. Roll up commerce stats. Sum across primary + duplicates.
        const totalSpent = liveDuplicates.reduce(
            (acc, d) => acc + Number(d.totalSpent),
            Number(primary.totalSpent)
        );
        const orderCount = liveDuplicates.reduce((acc, d) => acc + d.orderCount, primary.orderCount);
        const allFirstOrderAts = [
            primary.firstOrderAt,
            ...liveDuplicates.map((d) => d.firstOrderAt),
        ].filter((d): d is Date => d != null);
        const allLastOrderAts = [
            primary.lastOrderAt,
            ...liveDuplicates.map((d) => d.lastOrderAt),
        ].filter((d): d is Date => d != null);
        const firstOrderAt =
            allFirstOrderAts.length > 0
                ? new Date(Math.min(...allFirstOrderAts.map((d) => d.getTime())))
                : null;
        const lastOrderAt =
            allLastOrderAts.length > 0
                ? new Date(Math.max(...allLastOrderAts.map((d) => d.getTime())))
                : null;

        // 3. Union tags. 4. Pick up missing scalar fields from the most recent
        // duplicate. Sort newest-first so the "first non-null wins" rule picks
        // the freshest value.
        const sortedDups = [...liveDuplicates].sort(
            (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        );
        const mergedTags = new Set<string>(primary.tags);
        for (const d of liveDuplicates) for (const t of d.tags) mergedTags.add(t);

        const filledScalar = <T>(primary: T | null, candidates: (T | null)[]): T | null =>
            primary ?? candidates.find((c) => c != null) ?? null;
        const dupFields = (k: keyof Customer) => sortedDups.map((d) => d[k] as string | null);

        const updatedPrimary = await tx.customer.update({
            where: { id: primary.id },
            data: {
                totalSpent,
                orderCount,
                firstOrderAt,
                lastOrderAt,
                tags: [...mergedTags],
                email: filledScalar(primary.email, dupFields('email')),
                phone: filledScalar(primary.phone, dupFields('phone')),
                firstName: filledScalar(primary.firstName, dupFields('firstName')),
                lastName: filledScalar(primary.lastName, dupFields('lastName')),
                company: filledScalar(primary.company, dupFields('company')),
                jobTitle: filledScalar(primary.jobTitle, dupFields('jobTitle')),
                b2bAccountId: filledScalar(primary.b2bAccountId, dupFields('b2bAccountId')),
                authUserId: filledScalar(primary.authUserId, dupFields('authUserId')),
            },
        });

        // 5. Soft-delete the duplicates and stamp the merge target.
        const now = new Date();
        await tx.customer.updateMany({
            where: { id: { in: duplicateIds } },
            data: {
                deletedAt: now,
                mergedIntoCustomerId: primary.id,
            },
        });
        const mergedDups = await tx.customer.findMany({
            where: { id: { in: duplicateIds } },
        });

        // Activity on the primary recording the merge — captures the duplicate
        // ids in metadata so a future un-merge tool (out of scope today) can
        // walk the history.
        await tx.crmActivity.create({
            data: {
                tenantId: ctx.tenantId,
                customerId: primary.id,
                type: 'customer.merged',
                description: `Merged ${liveDuplicates.length} duplicate customer record${liveDuplicates.length === 1 ? '' : 's'}`,
                actorId: ctx.userId ?? null,
                actorType: ctx.userId ? 'staff' : 'system',
                occurredAt: now,
                linkedEntityType: 'Customer',
                linkedEntityId: primary.id,
                metadata: {
                    duplicateIds,
                    reattached: {
                        activities: activities.count,
                        deals: deals.count,
                        tasks: tasks.count,
                        addresses: addresses.count,
                    },
                },
            },
        });

        await writeAuditLog({
            tx,
            tenantId: ctx.tenantId,
            actorId: ctx.userId ?? null,
            actorType: ctx.userId ? 'user' : 'system',
            action: 'crm.customer.merged',
            entityType: 'Customer',
            entityId: primary.id,
            diff: { after: { mergedDuplicateIds: duplicateIds } },
        });

        return {
            primary: updatedPrimary,
            merged: mergedDups,
            reattached: {
                activities: activities.count,
                deals: deals.count,
                tasks: tasks.count,
                addresses: addresses.count,
            },
        };
    });

    if (result.merged.length > 0) {
        await publishCrmEvent({
            tenantId: ctx.tenantId,
            topic: 'crm.customer.merged',
            payload: {
                primaryCustomerId: result.primary.id,
                duplicateCustomerIds: result.merged.map((d) => d.id),
            },
            dedupeKey: `crm.customer.merged:${result.primary.id}:${result.merged
                .map((d) => d.id)
                .sort()
                .join(',')}`,
        });
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Duplicate detection
// ─────────────────────────────────────────────────────────────────────────

export interface DuplicateGroup {
    reason: 'email' | 'name+company';
    customers: Customer[];
}

/** Naive but effective: group on case-insensitive email, or on
 *  (lower(lastName), lower(company)) when both fields are present. Returns
 *  groups with at least two live members. Pagination is up to the caller —
 *  this is a tenant-wide scan, intended for the dashboard's "Find duplicates"
 *  page or a periodic cleanup job. */
export async function findLikelyDuplicates(
    ctx: ServiceContext,
    args: { limit?: number } = {}
): Promise<DuplicateGroup[]> {
    return withTenant(ctx, async (tx) => {
        const customers = await tx.customer.findMany({
            where: { deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            take: Math.min(args.limit ?? 5000, 10_000),
        });

        const byEmail = new Map<string, Customer[]>();
        const byNameCompany = new Map<string, Customer[]>();

        for (const c of customers) {
            if (c.email) {
                const key = c.email.trim().toLowerCase();
                const bucket = byEmail.get(key);
                if (bucket) bucket.push(c);
                else byEmail.set(key, [c]);
            }
            if (c.lastName && c.company) {
                const key = `${c.lastName.trim().toLowerCase()}|${c.company.trim().toLowerCase()}`;
                const bucket = byNameCompany.get(key);
                if (bucket) bucket.push(c);
                else byNameCompany.set(key, [c]);
            }
        }

        const groups: DuplicateGroup[] = [];
        const seen = new Set<string>(); // dedupe groups already covered by email
        for (const bucket of byEmail.values()) {
            if (bucket.length < 2) continue;
            const sorted = bucket.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            groups.push({ reason: 'email', customers: sorted });
            for (const c of sorted) seen.add(c.id);
        }
        for (const bucket of byNameCompany.values()) {
            if (bucket.length < 2) continue;
            // Skip if all members already appear in an email group — no new info.
            if (bucket.every((c) => seen.has(c.id))) continue;
            const sorted = bucket.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
            groups.push({ reason: 'name+company', customers: sorted });
        }

        return groups;
    });
}
