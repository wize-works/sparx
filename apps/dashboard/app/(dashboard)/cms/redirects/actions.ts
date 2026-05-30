'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

const PathSchema = z.string().min(1).max(2048).startsWith('/', 'Paths must begin with "/".');
const StatusSchema = z
  .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
  .default(301);

const CreateBody = z.object({
  from_path: PathSchema,
  to_path: PathSchema,
  status_code: StatusSchema,
});

const BulkRow = z.object({
  from_path: PathSchema,
  to_path: PathSchema,
  status_code: StatusSchema,
});

export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

function friendly(err: unknown): string {
  const e = err as ApiRestError;
  if (e?.code === 'VALIDATION_ERROR' && Array.isArray(e.details) && e.details.length) {
    const first = e.details[0] as { path?: string; message?: string };
    return first.message ?? e.message ?? 'Invalid input.';
  }
  if (typeof e?.message === 'string') return e.message;
  return 'An error occurred.';
}

function readString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createRedirect(formData: FormData): Promise<ActionResult> {
  const parsed = CreateBody.safeParse({
    from_path: readString(formData, 'from_path'),
    to_path: readString(formData, 'to_path'),
    status_code: Number(readString(formData, 'status_code') || 301),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  try {
    await api.post('/v1/redirects', parsed.data);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath('/cms/redirects');
  return { ok: true };
}

export async function deleteRedirect(id: string): Promise<ActionResult> {
  try {
    await api.delete(`/v1/redirects/${id}`);
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
  revalidatePath('/cms/redirects');
  return { ok: true };
}

// Bulk import. Accepts a CSV blob with header row:
//   from_path,to_path,status_code
// Status code is optional and defaults to 301. Lines are validated row-by
// -row so a single bad row doesn't kill the whole import — invalid rows
// surface in `failed` so the user knows which ones to fix.
//
// Two-phase import (audit F-21): we still try /v1/redirects/bulk first for
// the fast path, but if the API rejects (e.g. one row creates a loop and the
// bulk endpoint is all-or-nothing for business rules), we fall back to
// posting each candidate row individually so partial success + per-row
// diagnostics survive. The line numbers reported in `failed` always trace
// back to the original CSV row.
export async function bulkImportRedirects(
  csv: string
): Promise<
  ActionResult<{ imported: number; failed: { line: number; from_path: string; reason: string }[] }>
> {
  const lines = csv
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { ok: false, error: 'CSV is empty.' };
  }
  // Detect header row by looking for the literal token "from_path".
  const startIdx = lines[0]?.toLowerCase().includes('from_path') ? 1 : 0;

  interface Candidate {
    line: number;
    data: z.infer<typeof BulkRow>;
  }
  const candidates: Candidate[] = [];
  const failed: { line: number; from_path: string; reason: string }[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i]!.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    const raw = {
      from_path: parts[0] ?? '',
      to_path: parts[1] ?? '',
      status_code: Number(parts[2] ?? 301),
    };
    const parsed = BulkRow.safeParse(raw);
    if (!parsed.success) {
      failed.push({
        line: i + 1,
        from_path: raw.from_path,
        reason: parsed.error.issues[0]?.message ?? 'Invalid row.',
      });
      continue;
    }
    candidates.push({ line: i + 1, data: parsed.data });
  }

  if (candidates.length === 0) {
    return { ok: false, error: 'No valid rows found in CSV.', data: { imported: 0, failed } };
  }

  // Fast path: bulk endpoint.
  try {
    await api.post('/v1/redirects/bulk', { rows: candidates.map((c) => c.data) });
    revalidatePath('/cms/redirects');
    return { ok: true, data: { imported: candidates.length, failed } };
  } catch {
    // Fall through to per-row. We discard the bulk error message — the
    // per-row pass surfaces accurate per-line diagnostics instead.
  }

  // Slow-but-accurate path: one POST per row. Each failure is annotated with
  // its original CSV line so the editor can fix the offending row.
  let imported = 0;
  for (const c of candidates) {
    try {
      await api.post('/v1/redirects', c.data);
      imported += 1;
    } catch (err) {
      failed.push({
        line: c.line,
        from_path: c.data.from_path,
        reason: friendly(err),
      });
    }
  }
  revalidatePath('/cms/redirects');
  return { ok: imported > 0, data: { imported, failed } };
}
