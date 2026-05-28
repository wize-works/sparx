// Maintain the `content_references` edge list for an entry.
//
// On every entry save (create or update) the previous reference rows for
// `fromEntryId` are deleted and rebuilt from the current body. This is
// O(n) in the entry's reference count, which is small (low double-digits
// per entry in practice), and lets us avoid trying to diff JSONB.
//
// We walk the body using the type's schema to identify reference + asset
// fields, then collect target ids regardless of nesting depth.

import type { TxClient } from '@sparx/db';
import type { ContentTypeSchema, FieldDef } from '@sparx/cms-schemas';

interface CollectedRef {
  field: string; // dot-path into body
  toEntryId?: string;
  toAssetId?: string;
}

function walk(
  body: Record<string, unknown> | undefined | null,
  fields: FieldDef[],
  path: string,
  out: CollectedRef[],
): void {
  if (!body) return;
  for (const def of fields) {
    const value = body[def.key];
    if (value === undefined || value === null) continue;
    const subPath = path ? `${path}.${def.key}` : def.key;

    switch (def.type) {
      case 'reference': {
        if (def.multiple) {
          const arr = Array.isArray(value) ? value : [];
          arr.forEach((v, i) => {
            if (typeof v === 'string') {
              out.push({ field: `${subPath}[${i}]`, toEntryId: v });
            }
          });
        } else if (typeof value === 'string') {
          out.push({ field: subPath, toEntryId: value });
        }
        break;
      }
      case 'asset': {
        if (def.multiple) {
          const arr = Array.isArray(value) ? value : [];
          arr.forEach((v, i) => {
            if (typeof v === 'string') {
              out.push({ field: `${subPath}[${i}]`, toAssetId: v });
            }
          });
        } else if (typeof value === 'string') {
          out.push({ field: subPath, toAssetId: value });
        }
        break;
      }
      case 'object': {
        walk(value as Record<string, unknown>, def.fields, subPath, out);
        break;
      }
      case 'repeater': {
        const arr = Array.isArray(value) ? value : [];
        arr.forEach((item, i) => {
          walk(item as Record<string, unknown>, def.fields, `${subPath}[${i}]`, out);
        });
        break;
      }
      default:
        break;
    }
  }
}

export async function rebuildReferences(
  tx: TxClient,
  tenantId: string,
  fromEntryId: string,
  schema: ContentTypeSchema,
  body: Record<string, unknown>,
): Promise<void> {
  const refs: CollectedRef[] = [];
  walk(body, schema.fields, '', refs);

  await tx.contentReference.deleteMany({ where: { fromEntryId } });
  if (refs.length === 0) return;

  await tx.contentReference.createMany({
    data: refs.map((r) => ({
      tenantId,
      fromEntryId,
      field: r.field,
      toEntryId: r.toEntryId ?? null,
      toAssetId: r.toAssetId ?? null,
    })),
  });
}
