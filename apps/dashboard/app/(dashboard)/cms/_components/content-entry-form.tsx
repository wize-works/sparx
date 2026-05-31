'use client';

// Schema-driven content entry form.
//
// Reads a content type's schema from the api-rest /v1/content/types
// response and renders one FieldRenderer per field. Holds the working
// body as local state; on submit, it posts JSON to a server action.
//
// The form is intentionally dumb about the entry's "shell" fields (slug,
// status, scheduled_at, SEO) — those live in the existing dashboard edit
// chrome around it. ContentEntryForm only owns the `body` JSONB.

import * as React from 'react';
import { Button, Stack, Text } from '@sparx/ui';
import type { FieldDef } from '@sparx/cms-schemas';
import { FieldRenderer } from './field-renderer';
import { Save } from 'lucide-react';

export interface ContentTypeSchema {
  fields: FieldDef[];
}

export interface ContentEntryFormProps {
  schema: ContentTypeSchema;
  initialBody?: Record<string, unknown>;
  /** Called on submit with the validated body. Reject to surface an error. */
  onSubmit: (body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  /** Optional: auto-derive `slug`-typed fields from their sourceField. */
  autoDeriveSlugs?: boolean;
  /** Submit button label. */
  submitLabel?: string;
  disabled?: boolean;
}

function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

export function ContentEntryForm({
  schema,
  initialBody = {},
  onSubmit,
  autoDeriveSlugs = true,
  submitLabel = 'Save',
  disabled,
}: ContentEntryFormProps) {
  const [body, setBody] = React.useState<Record<string, unknown>>(initialBody);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const updateField = React.useCallback(
    (key: string, next: unknown) => {
      setBody((prev) => {
        const nextBody = { ...prev };
        if (next === undefined) {
          delete nextBody[key];
        } else {
          nextBody[key] = next;
        }
        // Auto-derive slug fields when their sourceField changes.
        if (autoDeriveSlugs) {
          for (const field of schema.fields) {
            if (field.type !== 'slug' || !field.sourceField) continue;
            if (field.sourceField !== key) continue;
            const userSlug = typeof nextBody[field.key] === 'string' ? nextBody[field.key] : '';
            const userManuallySet =
              typeof userSlug === 'string' &&
              userSlug.length > 0 &&
              userSlug !== slugifyTitle(asString(prev[key]));
            if (!userManuallySet && typeof next === 'string') {
              nextBody[field.key] = slugifyTitle(next);
            }
          }
        }
        return nextBody;
      });
    },
    [schema.fields, autoDeriveSlugs]
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    // Surface required-field guard before round-tripping to the server.
    const missing = schema.fields
      .filter((f) => f.required)
      .filter((f) => isEmpty(body[f.key]))
      .map((f) => f.label);
    if (missing.length) {
      setError(`Required: ${missing.join(', ')}.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await onSubmit(body);
      if (res.ok) {
        setSuccess('Saved.');
      } else {
        setError(res.error ?? 'Save failed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <Stack gap={5}>
        {schema.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={body[field.key]}
            onChange={(next) => updateField(field.key, next)}
            pathPrefix={field.key}
            disabled={Boolean(disabled) || submitting}
          />
        ))}

        {error && (
          <Text variant="danger" size="sm">
            {error}
          </Text>
        )}
        {success && (
          <Text variant="success" size="sm">
            {success}
          </Text>
        )}

        <Stack direction="row" align="center" justify="end" gap={2}>
          <Button
            type="submit"
            color="module"
            disabled={Boolean(disabled) || submitting}
            leftIcon={<Save className="h-4 w-4" />}
          >
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('type' in obj && obj.type === 'doc') {
      const content = (obj as { content?: unknown[] }).content;
      return !content || content.length === 0;
    }
    return Object.keys(obj).length === 0;
  }
  return false;
}
