// Build a Zod validator for a `content_entries.body` JSONB from a content
// type schema. The api-rest service calls this on every POST/PATCH to /v1/
// content/entries; the dashboard form generator uses the same shape to
// drive client-side validation (the editor calls bodyValidatorFor on submit
// to surface field-level errors before the server round-trip).
//
// Two key conventions:
//   - Unknown body keys are *stripped* (z.object().strip()), not rejected.
//     This keeps the API forgiving when a content type drops a field and an
//     old client still sends it; the canonical body shape is whatever the
//     type schema says today.
//   - References and assets are validated by SHAPE only (uuid string or
//     array thereof). Actually verifying the target row exists is the
//     caller's job (the api-rest entry mutation runs a tenant-scoped
//     existence check before write so a bad reference gets a 422, not a
//     row-level FK violation).

import { z } from 'zod';
import type { ContentTypeSchema, FieldDef } from './types';

export function bodyValidatorFor(schema: ContentTypeSchema): z.ZodObject {
  return buildObject(schema.fields);
}

function buildObject(fields: FieldDef[]): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    let validator = buildField(field);
    if (!field.required) {
      validator = validator.optional().nullable();
    }
    shape[field.key] = validator;
  }
  // `.strip()` is the default in Zod 4 for z.object(); unknown keys are
  // discarded. We use it explicitly here to make the intent clear at the
  // call site — see header comment.
  return z.object(shape);
}

function buildField(field: FieldDef): z.ZodType {
  switch (field.type) {
    case 'text': {
      let s = z.string();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      if (field.pattern) s = s.regex(new RegExp(field.pattern));
      return s;
    }
    case 'long_text': {
      let s = z.string();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      return s;
    }
    case 'rich_text': {
      // Rich text is a TipTap-style document: { type: 'doc', content: [...] }
      // We do a structural sanity check here; deep block-shape validation
      // happens inside @sparx/cms-editor on serialize.
      return z.object({
        type: z.string(),
        content: z.array(z.unknown()).optional(),
      });
    }
    case 'slug': {
      let s = z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
      if (field.max !== undefined) s = s.max(field.max);
      return s;
    }
    case 'number': {
      let n = z.number();
      if (field.integer) n = n.int();
      if (field.min !== undefined) n = n.min(field.min);
      if (field.max !== undefined) n = n.max(field.max);
      return n;
    }
    case 'boolean':
      return z.boolean();
    case 'date':
      // ISO date (YYYY-MM-DD).
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    case 'datetime':
      return z.string().datetime({ offset: true });
    case 'enum': {
      const values = field.options.map((o) => o.value);
      // z.enum requires at least one value; safe because schema validation
      // ensures options.min(1).
      const inner = z.enum(values as [string, ...string[]]);
      return field.multiple ? z.array(inner) : inner;
    }
    case 'url':
      return z.string().url();
    case 'email':
      return z.string().email();
    case 'reference': {
      const inner = z.string().uuid();
      return field.multiple ? z.array(inner) : inner;
    }
    case 'asset': {
      const inner = z.string().uuid();
      return field.multiple ? z.array(inner) : inner;
    }
    case 'object':
      return buildObject(field.fields);
    case 'repeater': {
      let arr: z.ZodArray<z.ZodObject> = z.array(buildObject(field.fields));
      if (field.min !== undefined) arr = arr.min(field.min);
      if (field.max !== undefined) arr = arr.max(field.max);
      return arr;
    }
  }
}

// Convenience: validate a body in one call, returning either parsed value or
// a flattened error map (field path → message) suited to surfacing in the
// dashboard form.

export interface BodyValidationResult {
  ok: boolean;
  body?: Record<string, unknown>;
  errors?: Record<string, string>;
}

export function validateBody(schema: ContentTypeSchema, input: unknown): BodyValidationResult {
  const result = bodyValidatorFor(schema).safeParse(input);
  if (result.success) {
    return { ok: true, body: result.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    errors[path || '_root'] = issue.message;
  }
  return { ok: false, errors };
}
