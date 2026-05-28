// Content type resolution + body validation.
//
// `resolveType` implements the two-step lookup the schema-of-schemas relies
// on: a tenant-owned `content_types` row (custom type) takes precedence
// over the sentinel platform tenant's built-in row of the same key. The
// `content_types` RLS policy exposes both rows to a tenant read, so the
// query is a single round-trip with ORDER BY making sure the tenant row
// wins.
//
// `validateAndNormalizeBody` runs the user-submitted body through the Zod
// validator built from the type's schemaJson. Unknown keys are stripped
// (forgiving on dropped fields); required-field errors and shape mismatches
// surface as VALIDATION_ERROR (422).

import type { ContentType, TxClient } from '@sparx/db';
import {
  ContentTypeSchema,
  bodyValidatorFor,
  type ContentTypeSchema as ContentTypeSchemaT,
} from '@sparx/cms-schemas';
import { notFound, validationError } from '../errors.js';
import { PLATFORM_TENANT_ID } from './db.js';

export async function resolveType(tx: TxClient, key: string): Promise<ContentType> {
  // Both the tenant-owned row and the platform-owned row are visible thanks
  // to the content_types RLS policy. Order by `is_built_in` ASC so a
  // tenant-owned override (is_built_in = false) wins over a built-in
  // (is_built_in = true) when both exist with the same key.
  const row = await tx.contentType.findFirst({
    where: { key },
    orderBy: [{ isBuiltIn: 'asc' }, { updatedAt: 'desc' }],
  });
  if (!row) throw notFound('Content type', key);
  return row;
}

export function parseTypeSchema(row: ContentType): ContentTypeSchemaT {
  const parsed = ContentTypeSchema.safeParse(row.schemaJson);
  if (!parsed.success) {
    // A malformed schemaJson is a server-side bug — the API must never
    // return a 422 caused by its own data corruption. Surface as 500 so
    // ops can investigate; details go to the request logger.
    throw new Error(
      `Content type ${row.key} has an invalid schemaJson: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function validateAndNormalizeBody(
  schema: ContentTypeSchemaT,
  body: unknown,
): Record<string, unknown> {
  const validator = bodyValidatorFor(schema);
  const result = validator.safeParse(body ?? {});
  if (!result.success) {
    throw validationError(
      'Body does not match the content type schema.',
      result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    );
  }
  return result.data as Record<string, unknown>;
}
