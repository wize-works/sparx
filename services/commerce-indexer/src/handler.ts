// Event router. Maps each commerce event type to either a product
// reprojection, a collection reprojection, or both. The router is
// idempotent — receiving the same event twice produces the same final
// state in Typesense.

import {
  projectAllCollectionRulesForTenant,
  projectCollectionRules,
  projectProduct,
} from '@sparx/commerce';
import { deleteProduct, upsertProduct } from '@sparx/search';
import type { Logger as PinoLogger } from 'pino';

export interface CommerceEventEnvelope {
  type: string;
  tenantId?: string;
  actorId?: string | null;
  occurredAt?: string;
  data?: Record<string, unknown>;
}

interface HandleResult {
  outcome: 'indexed' | 'deleted' | 'reprojected' | 'skipped';
  details?: Record<string, unknown>;
}

/**
 * Route one event. Throws to nack only when a transient error makes the
 * message worth retrying; logical failures (product no longer exists,
 * unknown event type) are skips, not retries.
 */
export async function handleEvent(
  event: CommerceEventEnvelope,
  logger: PinoLogger
): Promise<HandleResult> {
  const tenantId = event.tenantId;
  if (!tenantId) {
    logger.warn({ type: event.type }, 'event missing tenantId; skipping');
    return { outcome: 'skipped' };
  }
  const ctx = { tenantId, userId: event.actorId ?? undefined };

  switch (event.type) {
    case 'product.created':
    case 'product.updated':
    case 'variant.created':
    case 'variant.updated':
    case 'variant.deleted':
    case 'inventory.adjusted':
    case 'inventory.low':
    case 'inventory.depleted': {
      const productId = stringProp(event.data, 'productId');
      if (!productId) {
        // collectionService publishes 'product.updated' on collection
        // create/edit with { collectionId, change } and no productId —
        // treat that as a rules-projection trigger.
        const collectionId = stringProp(event.data, 'collectionId');
        if (collectionId) {
          const diff = await projectCollectionRules(ctx, collectionId);
          for (const id of [...diff.added, ...diff.removed]) {
            const { document } = await projectProduct(ctx, id);
            if (document) await upsertProduct(document);
          }
          return { outcome: 'reprojected', details: { ...diff } };
        }
        logger.warn({ type: event.type }, 'event missing productId/collectionId; skipping');
        return { outcome: 'skipped' };
      }
      const { document } = await projectProduct(ctx, productId);
      if (!document) {
        await deleteProduct(tenantId, productId);
        logger.info({ tenantId, productId }, 'product not found; deleted from index');
        return { outcome: 'deleted', details: { productId } };
      }
      await upsertProduct(document);
      // A product write can also affect rule-driven collection memberships.
      // Cheaper than recompiling every tenant collection: only re-run when
      // the event is `product.created/updated` (variant pings tend to be
      // identity-preserving on the product face). The reprojection itself
      // is fast for the typical tenant (<50 rules-driven collections).
      let reprojection: unknown = undefined;
      if (event.type === 'product.created' || event.type === 'product.updated') {
        const diffs = await projectAllCollectionRulesForTenant(ctx);
        const meaningful = diffs.filter((d) => d.added.length > 0 || d.removed.length > 0);
        if (meaningful.length > 0) {
          reprojection = meaningful;
          // Reproject the changed product again — rule membership lives
          // in CollectionProduct, which the search projection reads. A
          // second pass picks up new collection_ids for the index.
          const { document: refreshed } = await projectProduct(ctx, productId);
          if (refreshed) await upsertProduct(refreshed);
        }
      }
      return {
        outcome: 'indexed',
        details: { productId, reprojection },
      };
    }

    case 'product.deleted': {
      const productId = stringProp(event.data, 'productId');
      if (!productId) return { outcome: 'skipped' };
      await deleteProduct(tenantId, productId);
      return { outcome: 'deleted', details: { productId } };
    }

    default:
      logger.debug({ type: event.type }, 'event type not routed; skipping');
      return { outcome: 'skipped' };
  }
}

function stringProp(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = data?.[key];
  return typeof v === 'string' ? v : undefined;
}
