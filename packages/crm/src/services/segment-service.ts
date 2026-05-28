// segmentService — segment CRUD + membership reads.
//
// Phase 1 ships the CRUD shape and the membership read; the Pub/Sub
// evaluator that populates segment_members and the previewCount /
// recomputeFull paths land in Phase 4 (locked decision #4: incremental
// materialization). Until then, the only writes to segment_members come
// from external callers / tests. Keeping the read API stable now means
// the dashboard "members" UI and email broadcast targeting can be built
// before the evaluator exists.

import { CreateSegmentInput, UpdateSegmentInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Customer, Segment, SegmentMember } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError } from '../errors';

export async function list(
    ctx: ServiceContext,
    args: { includeArchived?: boolean } = {}
): Promise<Segment[]> {
    return withTenant(ctx, (tx) =>
        tx.segment.findMany({
            where: args.includeArchived ? {} : { archivedAt: null },
            orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
        })
    );
}

export async function get(ctx: ServiceContext, segmentId: string): Promise<Segment> {
    const segment = await withTenant(ctx, (tx) =>
        tx.segment.findUnique({ where: { id: segmentId } })
    );
    if (!segment) throw new CrmNotFoundError('Segment', segmentId);
    return segment;
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<Segment> {
    const input = CreateSegmentInput.parse(rawInput);

    const segment = await withTenant(ctx, async (tx) => {
        const created = await tx.segment.create({
            data: {
                tenantId: ctx.tenantId,
                name: input.name,
                slug: input.slug,
                description: input.description ?? null,
                rules: input.rules,
                color: input.color ?? null,
                isSystem: false,
                isBuiltIn: false,
            },
        });
        await writeAuditLog({
            tx,
            tenantId: ctx.tenantId,
            actorId: ctx.userId ?? null,
            actorType: ctx.userId ? 'user' : 'system',
            action: 'crm.segment.created',
            entityType: 'Segment',
            entityId: created.id,
            diff: { after: { slug: created.slug, name: created.name } },
        });
        return created;
    });

    await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.segment.created',
        payload: { segmentId: segment.id, slug: segment.slug },
        dedupeKey: `crm.segment.created:${segment.id}`,
    });

    return segment;
}

export async function update(
    ctx: ServiceContext,
    segmentId: string,
    rawInput: unknown
): Promise<Segment> {
    const input = UpdateSegmentInput.parse(rawInput);

    const result = await withTenant(ctx, async (tx) => {
        const before = await tx.segment.findUnique({ where: { id: segmentId } });
        if (!before) throw new CrmNotFoundError('Segment', segmentId);
        const updated = await tx.segment.update({
            where: { id: segmentId },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.slug !== undefined ? { slug: input.slug } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
                ...(input.rules !== undefined ? { rules: input.rules } : {}),
                ...(input.color !== undefined ? { color: input.color } : {}),
            },
        });
        await writeAuditLog({
            tx,
            tenantId: ctx.tenantId,
            actorId: ctx.userId ?? null,
            actorType: ctx.userId ? 'user' : 'system',
            action: 'crm.segment.updated',
            entityType: 'Segment',
            entityId: updated.id,
            diff: null,
        });
        return updated;
    });

    // If rules changed, downstream evaluators (Phase 4) need to recompute
    // membership. The event carries that signal; the evaluator subscribes.
    await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.segment.updated',
        payload: {
            segmentId: result.id,
            rulesChanged: input.rules !== undefined,
        },
        dedupeKey: `crm.segment.updated:${result.id}:${result.updatedAt.toISOString()}`,
    });

    return result;
}

export async function archive(ctx: ServiceContext, segmentId: string): Promise<Segment> {
    return withTenant(ctx, async (tx) => {
        const before = await tx.segment.findUnique({ where: { id: segmentId } });
        if (!before) throw new CrmNotFoundError('Segment', segmentId);
        const updated = await tx.segment.update({
            where: { id: segmentId },
            data: { archivedAt: new Date() },
        });
        await writeAuditLog({
            tx,
            tenantId: ctx.tenantId,
            actorId: ctx.userId ?? null,
            actorType: ctx.userId ? 'user' : 'system',
            action: 'crm.segment.archived',
            entityType: 'Segment',
            entityId: updated.id,
            diff: null,
        });
        return updated;
    });
}

/** Members materialized into segment_members by the Phase 4 evaluator.
 *  Pre-Phase-4 this returns whatever's been written manually (typically
 *  zero rows) — the read shape is stable so dashboard / email-broadcast
 *  targeting can join against it today. */
export async function members(
    ctx: ServiceContext,
    segmentId: string,
    args: { limit?: number; offset?: number } = {}
): Promise<(SegmentMember & { customer: Customer })[]> {
    return withTenant(ctx, (tx) =>
        tx.segmentMember.findMany({
            where: { segmentId },
            include: { customer: true },
            orderBy: { enteredAt: 'desc' },
            take: Math.min(args.limit ?? 100, 1000),
            skip: args.offset ?? 0,
        })
    );
}

/** Count of members. Phase 4 will also add previewCount() which evaluates
 *  the rule tree against a sample without materializing. */
export async function memberCount(ctx: ServiceContext, segmentId: string): Promise<number> {
    return withTenant(ctx, (tx) => tx.segmentMember.count({ where: { segmentId } }));
}
