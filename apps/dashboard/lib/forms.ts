// Tiny helpers for safe FormDataEntryValue extraction.
//
// Why: FormData.get() returns FormDataEntryValue | null — including File
// — and stringifying a File yields '[object Object]'. ESLint's
// no-base-to-string rule (rightly) flags `String(form.get(...))`.
// These helpers guard the File case upfront so call sites get a clean
// string back without lint noise.

export function formString(form: FormData, key: string, fallback = ''): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : fallback;
}

export function formNumber(form: FormData, key: string, fallback = 0): number {
  const value = form.get(key);
  if (typeof value !== 'string') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formBool(form: FormData, key: string): boolean {
  return form.get(key) === 'on';
}

export function formStringOrNull(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
