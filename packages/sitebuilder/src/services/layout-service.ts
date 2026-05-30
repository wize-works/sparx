// layoutService — header / footer / announcement composition.
//
// A layout block points at an existing CMS NavigationMenu (reference only —
// the CMS nav API stays the sole writer of nav rows) and carries slot extras
// in `config`, validated against the slot's schema in @sparx/sitebuilder-schemas.

import { UpsertLayoutInput, parseLayoutConfig } from '@sparx/sitebuilder-schemas';
import type { SiteLayoutBlock } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { getOrCreateConfig } from './_config';

export function list(ctx: ServiceContext): Promise<SiteLayoutBlock[]> {
  return withTenant(ctx, (tx) => tx.siteLayoutBlock.findMany({ orderBy: { slot: 'asc' } }));
}

export function get(ctx: ServiceContext, slot: string): Promise<SiteLayoutBlock | null> {
  return withTenant(ctx, (tx) =>
    tx.siteLayoutBlock.findUnique({ where: { tenantId_slot: { tenantId: ctx.tenantId, slot } } })
  );
}

export async function upsert(ctx: ServiceContext, rawInput: unknown): Promise<SiteLayoutBlock> {
  const input = UpsertLayoutInput.parse(rawInput);
  const config = parseLayoutConfig(input.slot, input.config ?? {});

  return withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    const block = await tx.siteLayoutBlock.upsert({
      where: { tenantId_slot: { tenantId: ctx.tenantId, slot: input.slot } },
      create: {
        tenantId: ctx.tenantId,
        slot: input.slot,
        navigationMenuId: input.navigationMenuId ?? null,
        config,
        visible: input.visible ?? true,
      },
      update: {
        navigationMenuId: input.navigationMenuId ?? null,
        config,
        ...(input.visible !== undefined ? { visible: input.visible } : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.layout.upserted',
      entityType: 'SiteLayoutBlock',
      entityId: block.id,
      diff: { after: { slot: block.slot, navigationMenuId: block.navigationMenuId } },
    });
    return block;
  });
}
