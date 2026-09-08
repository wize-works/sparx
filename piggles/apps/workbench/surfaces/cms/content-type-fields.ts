'use client';

// What a FIELD is, in the shape the type editor holds it.
//
// Split out of content-types-data.ts under the size rule. That file fetches and
// saves types; this one is the draft model — the field vocabulary, what a blank
// one looks like, when a set of them is valid, and the two key derivations.
// Crossing the wire is its own file (./content-type-field-wire).
//
// The vocabulary is shared with surfaces/cms/schema-form.tsx, which renders a form
// from exactly these fields. Never invent a field type or a config the editor
// cannot render.

/* ── The editable field draft ───────────────────────────────────────────────
 *
 * A `FieldDef` has no stable identity — its `key` is the identity, and the key
 * changes as someone types it. The builder needs a handle that survives an edit
 * AND a reorder, so a draft field carries a session-only `_uid` used ONLY as a
 * React key and drag id (never persisted). `object`/`repeater` recurse, so their
 * nested fields are drafts too. `fromDraftFields` strips the `_uid` and prunes
 * empty optionals back to the exact `FieldDef` the server validates. */

interface DraftBase {
  _uid: string;
  key: string;
  label: string;
  helpText?: string;
  required?: boolean;
}

export interface EnumOption {
  value: string;
  label: string;
}

export type DraftField =
  | (DraftBase & { type: 'text'; placeholder?: string; min?: number; max?: number })
  | (DraftBase & { type: 'long_text'; rows?: number; min?: number; max?: number })
  | (DraftBase & { type: 'rich_text' })
  | (DraftBase & { type: 'slug'; sourceField?: string; max?: number })
  | (DraftBase & { type: 'number'; min?: number; max?: number; integer?: boolean })
  | (DraftBase & { type: 'boolean'; default?: boolean })
  | (DraftBase & { type: 'date' })
  | (DraftBase & { type: 'datetime' })
  | (DraftBase & { type: 'enum'; options: EnumOption[]; multiple?: boolean })
  | (DraftBase & { type: 'url' })
  | (DraftBase & { type: 'email' })
  | (DraftBase & { type: 'reference'; to: string; multiple?: boolean; min?: number; max?: number })
  | (DraftBase & { type: 'asset'; accept?: string[]; multiple?: boolean })
  | (DraftBase & { type: 'object'; fields: DraftField[] })
  | (DraftBase & {
      type: 'repeater';
      itemLabel?: string;
      min?: number;
      max?: number;
      fields: DraftField[];
    });

export type FieldType = DraftField['type'];

/** Every field type this can author — the SAME set schema-form.tsx renders. Adding
 *  one here without a control there would produce a schema the editor can't show. */
export const FIELD_TYPES: FieldType[] = [
  'text',
  'long_text',
  'rich_text',
  'slug',
  'number',
  'boolean',
  'date',
  'datetime',
  'enum',
  'url',
  'email',
  'reference',
  'asset',
  'object',
  'repeater',
];

// Session-only. Not persisted, not a wire value — a plain counter is honest here.
// Exported because the wire conversion mints them too, and both halves have to
// draw from ONE counter or two drafts can collide on a React key.
let uidCounter = 0;
export function uid(): string {
  uidCounter += 1;
  return `f${String(uidCounter)}`;
}

/** A fresh field of a type, with the minimum its shape requires (an enum needs an
 *  option; a group needs somewhere to add fields). */
export function blankField(type: FieldType): DraftField {
  const base = { _uid: uid(), key: '', label: '' };
  switch (type) {
    case 'enum':
      return { ...base, type, options: [{ value: '', label: '' }] };
    case 'reference':
      return { ...base, type, to: '' };
    case 'object':
      return { ...base, type, fields: [] };
    case 'repeater':
      return { ...base, type, fields: [] };
    default:
      return { ...base, type };
  }
}

/* ── Client-side schema validity ─────────────────────────────────────────────
 *
 * Enough to keep Save honest and to point at the first real problem BEFORE the
 * round-trip — the server is still the authority and its 422 sentence is shown
 * verbatim. Returns the first problem in plain words, or null when it is fit to
 * send. */

const FIELD_KEY_RE = /^[a-z][a-zA-Z0-9_]*$/;

export function validateFields(fields: DraftField[], where = 'this type'): string | null {
  if (fields.length === 0) {
    return `Add at least one field to ${where}.`;
  }
  const seen = new Set<string>();
  for (const field of fields) {
    const label = field.label.trim();
    const key = field.key.trim();
    const named = label || 'a field';
    if (label === '') return 'Every field needs a name.';
    if (key === '') return `Give “${named}” a short id.`;
    if (!FIELD_KEY_RE.test(key)) {
      return `The id for “${named}” must start with a lowercase letter and use only letters, numbers and underscores.`;
    }
    if (seen.has(key)) return `Two fields in ${where} share the id “${key}”. Ids must be unique.`;
    seen.add(key);

    if (field.type === 'enum') {
      if (field.options.length === 0) return `“${named}” needs at least one choice.`;
      for (const option of field.options) {
        if (option.value.trim() === '' || option.label.trim() === '') {
          return `Every choice in “${named}” needs both a value and a label.`;
        }
      }
    }
    if (field.type === 'reference' && field.to.trim() === '') {
      return `Choose what “${named}” links to.`;
    }
    if (field.type === 'object' || field.type === 'repeater') {
      const nested = validateFields(field.fields, `“${named}”`);
      if (nested) return nested;
    }
  }
  return null;
}

/* ── Key derivation ─────────────────────────────────────────────────────────
 *
 * A type key is snake_case (`[a-z][a-z0-9_]*`); a field key is camelCase
 * (`[a-z][a-zA-Z0-9_]*`). We seed them from the human name so the person never
 * has to think about ids — they stay editable, but a sensible one is filled in. */

export function toTypeKey(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9]+/, '');
  return cleaned;
}

export function toFieldKey(label: string): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  const camel = (first ?? '') + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return camel.replace(/^[0-9]+/, '');
}
