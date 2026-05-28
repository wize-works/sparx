// Sparx CMS — content type schema format.
//
// A `ContentTypeSchema` describes the shape of a `content_entries.body` JSONB
// for one content type. The same definition drives three consumers:
//
//   - api-rest validates a write against bodyValidatorFor(schema) at PATCH /
//     POST time.
//   - The dashboard's <ContentEntryForm> renders a field per definition.
//   - The marketing-site backfill (apps/web → CMS) reads each MODULES entry
//     and maps it into a body conformant to the `module` schema.
//
// Convention: a field's `key` is camelCase to match the body JSONB; the SQL
// column is snake_case for entries themselves (slug, status, …) but JSONB
// keys are not column names.

import { z } from 'zod';

const FieldKey = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-zA-Z0-9_]*$/, 'Field key must be camelCase starting with a lowercase letter.');

const BaseField = z.object({
  key: FieldKey,
  label: z.string().min(1).max(120),
  helpText: z.string().max(500).optional(),
  required: z.boolean().optional(),
});

const TextField = BaseField.extend({
  type: z.literal('text'),
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(1).max(10_000).optional(),
  pattern: z.string().optional(),
  placeholder: z.string().optional(),
  default: z.string().optional(),
});

const LongTextField = BaseField.extend({
  type: z.literal('long_text'),
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(1).max(100_000).optional(),
  rows: z.number().int().min(1).max(40).optional(),
});

const RichTextField = BaseField.extend({
  type: z.literal('rich_text'),
});

const SlugField = BaseField.extend({
  type: z.literal('slug'),
  sourceField: FieldKey.optional(),
  max: z.number().int().min(1).max(255).optional(),
});

const NumberField = BaseField.extend({
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
});

const BooleanField = BaseField.extend({
  type: z.literal('boolean'),
  default: z.boolean().optional(),
});

const DateField = BaseField.extend({
  type: z.literal('date'),
});

const DateTimeField = BaseField.extend({
  type: z.literal('datetime'),
});

const EnumField = BaseField.extend({
  type: z.literal('enum'),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(1)
    .max(64),
  multiple: z.boolean().optional(),
});

const UrlField = BaseField.extend({
  type: z.literal('url'),
});

const EmailField = BaseField.extend({
  type: z.literal('email'),
});

const ReferenceField = BaseField.extend({
  type: z.literal('reference'),
  to: z.string().min(1).max(63), // content type key
  multiple: z.boolean().optional(),
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(1).optional(),
});

const AssetField = BaseField.extend({
  type: z.literal('asset'),
  accept: z.array(z.string()).optional(), // mime patterns, e.g. ['image/*']
  multiple: z.boolean().optional(),
});

// `object` and `repeater` need recursion. Zod 4 handles this via z.lazy().
// We declare the TS types up-front, then build the Zod schema with lazy
// references to the union — the union itself is exported as FieldDefSchema.

export type ObjectFieldDef = z.infer<typeof BaseField> & {
  type: 'object';
  fields: FieldDef[];
};

export type RepeaterFieldDef = z.infer<typeof BaseField> & {
  type: 'repeater';
  itemLabel?: string;
  min?: number;
  max?: number;
  fields: FieldDef[];
};

export type FieldDef =
  | z.infer<typeof TextField>
  | z.infer<typeof LongTextField>
  | z.infer<typeof RichTextField>
  | z.infer<typeof SlugField>
  | z.infer<typeof NumberField>
  | z.infer<typeof BooleanField>
  | z.infer<typeof DateField>
  | z.infer<typeof DateTimeField>
  | z.infer<typeof EnumField>
  | z.infer<typeof UrlField>
  | z.infer<typeof EmailField>
  | z.infer<typeof ReferenceField>
  | z.infer<typeof AssetField>
  | ObjectFieldDef
  | RepeaterFieldDef;

// z.lazy + z.discriminatedUnion don't compose in Zod 4 — discriminatedUnion
// needs static .shape access on each branch, but lazy hides it. z.union
// covers the same ground (each branch is still uniquely discriminated by
// `type`); the perf delta on schemas of ~15 branches is negligible because
// this validator runs only when a merchant defines a custom content type,
// not on every entry write.

const ObjectField = z.lazy(() =>
  BaseField.extend({
    type: z.literal('object'),
    fields: z.array(FieldDefSchema),
  }),
);

const RepeaterField = z.lazy(() =>
  BaseField.extend({
    type: z.literal('repeater'),
    itemLabel: z.string().max(120).optional(),
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(1).optional(),
    fields: z.array(FieldDefSchema),
  }),
);

export const FieldDefSchema: z.ZodType<FieldDef> = z.lazy(() =>
  z.union([
    TextField,
    LongTextField,
    RichTextField,
    SlugField,
    NumberField,
    BooleanField,
    DateField,
    DateTimeField,
    EnumField,
    UrlField,
    EmailField,
    ReferenceField,
    AssetField,
    ObjectField,
    RepeaterField,
  ]),
);

export const ContentTypeSchema = z.object({
  fields: z.array(FieldDefSchema).min(1),
});
export type ContentTypeSchema = z.infer<typeof ContentTypeSchema>;

// ContentTypeDefinition is the in-memory shape of a built-in or custom type.
// Mirrors the columns of `content_types` so the migration that seeds
// built-ins can read it directly.

export interface ContentTypeDefinition {
  key: string;
  name: string;
  pluralName: string;
  description?: string;
  urlPattern?: string;
  icon?: string;
  isSingleton?: boolean;
  schema: ContentTypeSchema;
}
