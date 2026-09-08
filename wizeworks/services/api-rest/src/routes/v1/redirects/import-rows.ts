// Importing a pasted list of redirects, one row at a time, without letting one
// bad row destroy the rest.
//
// THE BUG THIS FILE EXISTS FOR. The bulk route used to loop over the rows inside
// a single `withRequestTenant` transaction with a try/catch around each `create`,
// and record the failures in a `skipped` array. That reads correctly and is
// wrong: a unique-constraint violation aborts the whole POSTGRES transaction, and
// catching the error in JavaScript does not revive it. Every later statement —
// the remaining rows AND the audit write — then fails with "current transaction
// is aborted", so the request 500s and NOTHING is imported. The surface promises
// "the rest will still import without them"; that promise could not be kept for
// the commonest failure there is, re-importing a list that overlaps rules you
// already have.
//
// Two things fix it, and both are here on purpose:
//
//   • A SAVEPOINT per row. Postgres' own answer to "continue after a failed
//     statement" — a failure rolls back to the savepoint and the transaction is
//     healthy again. This is what makes the partial-import promise structurally
//     true rather than true for the failures someone thought of.
//   • The same duplicate pre-check the single create already does, so the
//     commonest refusal never reaches the constraint at all and can be explained
//     in a sentence naming where the existing rule points.

import type { TxClient } from '@wizeworks/db';
import { ApiError, conflict } from '@wizeworks/api-core/errors';

export interface ImportRowInput {
  from_path: string;
  to_path: string;
  status_code: number;
  property_id?: string | null;
}

export interface ImportedRedirect {
  id: string;
  fromPath: string;
  toPath: string;
}

export interface ImportRowsResult {
  imported: ImportedRedirect[];
  /** `row` is the index in the submitted list, so the surface can point back at
   *  the line the person typed. */
  skipped: { row: number; reason: string }[];
}

/** One name, established and ended on every iteration, so the savepoint stack
 *  never grows past depth 1 even on a 5000-row import. */
const POINT = 'sx_import_row';

/**
 * What to tell the person about a row that did not go in.
 *
 * An `ApiError` was raised deliberately by this code and its message is already
 * a sentence written for them. Anything else is a database or driver failure
 * whose text is developer noise, so it gets a plain sentence instead: the row is
 * named beside it in the surface, which is the part they need.
 */
function reasonFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'This one could not be added. Nothing else on your list was affected.';
}

/**
 * Import every row, keeping the ones that work.
 *
 * `checkChain` is passed in rather than imported so the loop and the chain walk
 * stay in the files that own them; it must throw to refuse a row.
 */
export async function importRedirectRows(
  tx: TxClient,
  input: {
    tenantId: string;
    rows: ImportRowInput[];
    /** The site an unscoped row lands on. */
    scopeId: string | null;
    checkChain: (
      tx: TxClient,
      propertyId: string | null,
      fromPath: string,
      toPath: string
    ) => Promise<void>;
  }
): Promise<ImportRowsResult> {
  const imported: ImportedRedirect[] = [];
  const skipped: { row: number; reason: string }[] = [];

  for (let i = 0; i < input.rows.length; i++) {
    const r = input.rows[i];
    if (!r) continue;
    const propertyId = r.property_id === undefined ? input.scopeId : r.property_id;

    await tx.$executeRawUnsafe(`SAVEPOINT ${POINT}`);
    try {
      await input.checkChain(tx, propertyId, r.from_path, r.to_path);
      const existing = await tx.redirect.findFirst({
        where: { fromPath: r.from_path, propertyId },
      });
      if (existing) {
        throw conflict(
          `A redirect from "${r.from_path}" already exists — it goes to "${existing.toPath}".`
        );
      }
      const row = await tx.redirect.create({
        data: {
          tenantId: input.tenantId,
          propertyId,
          fromPath: r.from_path,
          toPath: r.to_path,
          statusCode: r.status_code,
        },
      });
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${POINT}`);
      imported.push({ id: row.id, fromPath: row.fromPath, toPath: row.toPath });
    } catch (err) {
      // Back to a healthy transaction before the next row touches it. Without
      // this line every statement after the first failure is refused.
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${POINT}`);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${POINT}`);
      skipped.push({ row: i, reason: reasonFor(err) });
    }
  }

  return { imported, skipped };
}
