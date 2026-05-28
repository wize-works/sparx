// Success-envelope helper. Every successful API response is
// `{ success: true, data, meta? }` per docs/06-api-specification.md §3.
// Routes call `ok(data, meta?)` rather than constructing the object inline
// so the shape stays consistent across the surface.

export interface SuccessEnvelope<T, M = undefined> {
  success: true;
  data: T;
  meta?: M;
}

export interface PaginationMeta {
  page?: number;
  per_page?: number;
  total?: number;
  total_pages?: number;
  next_cursor?: string | null;
}

export function ok<T>(data: T): SuccessEnvelope<T> {
  return { success: true, data };
}

export function paged<T>(data: T, meta: PaginationMeta): SuccessEnvelope<T, PaginationMeta> {
  return { success: true, data, meta };
}
