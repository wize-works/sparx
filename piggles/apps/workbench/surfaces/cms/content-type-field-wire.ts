'use client';

// A field crossing the wire, both ways.
//
// Split out of content-types-data.ts under the size rule. One job: translate
// between the server's `FieldDef` and the editor's `DraftField`, and back. The
// two halves belong together — a change to one is wrong unless the other moves
// with it, which is exactly what a round trip has to preserve.

import type { FieldDef } from './data';
import { uid, type DraftField } from './content-type-fields';

/* ── Draft ⇄ wire ───────────────────────────────────────────────────────── */

export function toDraftFields(fields: FieldDef[]): DraftField[] {
  return fields.map(toDraftField);
}

function toDraftField(field: FieldDef): DraftField {
  const base = {
    _uid: uid(),
    key: field.key,
    label: field.label,
    ...(field.helpText !== undefined ? { helpText: field.helpText } : {}),
    ...(field.required !== undefined ? { required: field.required } : {}),
  };
  if (field.type === 'object') {
    return { ...base, type: 'object', fields: toDraftFields(field.fields) };
  }
  if (field.type === 'repeater') {
    return {
      ...base,
      type: 'repeater',
      ...(field.itemLabel !== undefined ? { itemLabel: field.itemLabel } : {}),
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
      fields: toDraftFields(field.fields),
    };
  }
  // Every scalar/leaf: the config keys are already the shape the draft wants, so
  // carry them across verbatim on top of the fresh _uid.
  const { key: _k, label: _l, helpText: _h, required: _r, ...rest } = field;
  void _k;
  void _l;
  void _h;
  void _r;
  return { ...base, ...rest };
}

function optNum(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function optStr(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}
function spreadDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/** Draft → the `FieldDef[]` the server validates: `_uid` gone, blanks pruned. */
export function fromDraftFields(fields: DraftField[]): FieldDef[] {
  return fields.map(fromDraftField);
}

function fromDraftField(field: DraftField): FieldDef {
  const base = {
    key: field.key.trim(),
    label: field.label.trim(),
    ...spreadDefined({ helpText: optStr(field.helpText) }),
    ...(field.required ? { required: true } : {}),
  };
  switch (field.type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        ...spreadDefined({
          placeholder: optStr(field.placeholder),
          min: optNum(field.min),
          max: optNum(field.max),
        }),
      };
    case 'long_text':
      return {
        ...base,
        type: 'long_text',
        ...spreadDefined({
          rows: optNum(field.rows),
          min: optNum(field.min),
          max: optNum(field.max),
        }),
      };
    case 'rich_text':
      return { ...base, type: 'rich_text' };
    case 'slug':
      return {
        ...base,
        type: 'slug',
        ...spreadDefined({ sourceField: optStr(field.sourceField), max: optNum(field.max) }),
      };
    case 'number':
      return {
        ...base,
        type: 'number',
        ...spreadDefined({ min: optNum(field.min), max: optNum(field.max) }),
        ...(field.integer ? { integer: true } : {}),
      };
    case 'boolean':
      return { ...base, type: 'boolean', ...(field.default ? { default: true } : {}) };
    case 'date':
      return { ...base, type: 'date' };
    case 'datetime':
      return { ...base, type: 'datetime' };
    case 'enum':
      return {
        ...base,
        type: 'enum',
        options: field.options.map((o) => ({ value: o.value.trim(), label: o.label.trim() })),
        ...(field.multiple ? { multiple: true } : {}),
      };
    case 'url':
      return { ...base, type: 'url' };
    case 'email':
      return { ...base, type: 'email' };
    case 'reference':
      return {
        ...base,
        type: 'reference',
        to: field.to.trim(),
        ...(field.multiple ? { multiple: true } : {}),
        ...spreadDefined({ min: optNum(field.min), max: optNum(field.max) }),
      };
    case 'asset':
      return {
        ...base,
        type: 'asset',
        ...spreadDefined({
          accept: field.accept && field.accept.length > 0 ? field.accept : undefined,
        }),
        ...(field.multiple ? { multiple: true } : {}),
      };
    case 'object':
      return { ...base, type: 'object', fields: fromDraftFields(field.fields) };
    case 'repeater':
      return {
        ...base,
        type: 'repeater',
        ...spreadDefined({ itemLabel: optStr(field.itemLabel) }),
        ...spreadDefined({ min: optNum(field.min), max: optNum(field.max) }),
        fields: fromDraftFields(field.fields),
      };
  }
}
