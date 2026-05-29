'use client';

// Schema-driven field renderer.
//
// Reads a FieldDef from @sparx/cms-schemas and renders the matching widget.
// Hands change events back to the parent via `onChange(path, nextValue)` so
// the form orchestrator can apply the patch into the body JSONB without
// each leaf having to know its own dotted path.
//
// Field types covered (see packages/cms-schemas/src/types.ts):
//   text · long_text · rich_text · slug · number · boolean · date · datetime
//   enum · url · email · reference · asset · object · repeater
//
// Validation here is loose — we surface required + min/max + pattern
// inline, but the server-side bodyValidatorFor() in api-rest is the source
// of truth. Required indicator is purely a UX nudge.

import * as React from 'react';
import {
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Switch,
  Text,
  Textarea,
} from '@sparx/ui';
import { ContentBlockEditor } from '@sparx/cms-editor';
import type { FieldDef } from '@sparx/cms-schemas';
import { Plus, Trash2 } from 'lucide-react';
import { MediaPicker, type PickedAsset } from './media-picker';
import { ReferencePicker, type PickedReference } from './reference-picker';
import { searchEntries } from './cms-internal-api';

export interface FieldRendererProps {
  field: FieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Path prefix so nested fields can render unique aria/id values. */
  pathPrefix?: string;
  disabled?: boolean;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return '';
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asTipTapDoc(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && (value as { type?: string }).type === 'doc') {
    return value as Record<string, unknown>;
  }
  return { type: 'doc', content: [] };
}

function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

function FieldLabel({ htmlFor, field }: { htmlFor: string; field: FieldDef }) {
  return (
    <Stack gap={1}>
      <Label htmlFor={htmlFor}>
        {field.label}
        {field.required ? <span className="ml-1 text-[var(--color-danger-text)]">*</span> : null}
      </Label>
      {field.helpText && (
        <Text size="xs" variant="muted">
          {field.helpText}
        </Text>
      )}
    </Stack>
  );
}

// ─── individual field renderers ────────────────────────────────────────────

function TextFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'text' | 'url' | 'email' | 'slug' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  const type = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Input
        id={inputId}
        type={type}
        value={asString(value)}
        onChange={(e) => onChange(e.target.value)}
        maxLength={'max' in field ? field.max : undefined}
        placeholder={field.type === 'text' ? field.placeholder : undefined}
        disabled={disabled}
        required={field.required}
      />
    </Stack>
  );
}

function LongTextFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'long_text' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Textarea
        id={inputId}
        value={asString(value)}
        onChange={(e) => onChange(e.target.value)}
        rows={field.rows ?? 4}
        maxLength={field.max}
        disabled={disabled}
        required={field.required}
      />
    </Stack>
  );
}

function RichTextFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'rich_text' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const pickResolverRef = React.useRef<((asset: PickedAsset | null) => void) | null>(null);

  const pickImage = React.useCallback(async (): Promise<PickedAsset | null> => {
    return new Promise((resolve) => {
      pickResolverRef.current = resolve;
      setPickerOpen(true);
    });
  }, []);

  const handlePick = (asset: PickedAsset) => {
    pickResolverRef.current?.(asset);
    pickResolverRef.current = null;
    setPickerOpen(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      pickResolverRef.current?.(null);
      pickResolverRef.current = null;
    }
    setPickerOpen(open);
  };

  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <ContentBlockEditor
        value={asTipTapDoc(value)}
        onChange={(doc) => onChange(doc)}
        disabled={disabled}
        ariaLabel={field.label}
        referenceSearch={async (q) => {
          const rows = await searchEntries({ q, limit: 8 });
          return rows.map((r) => ({ entryId: r.id, typeKey: r.typeKey, label: r.title }));
        }}
        pickImage={pickImage}
      />
      <MediaPicker
        open={pickerOpen}
        onOpenChange={handleClose}
        onPick={handlePick}
        accept={['image/*']}
      />
    </Stack>
  );
}

function NumberFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'number' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  const current = asNumber(value);
  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Input
        id={inputId}
        type="number"
        inputMode={field.integer ? 'numeric' : 'decimal'}
        step={field.integer ? 1 : 'any'}
        value={current === '' ? '' : String(current)}
        min={field.min}
        max={field.max}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        disabled={disabled}
        required={field.required}
      />
    </Stack>
  );
}

function BooleanFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'boolean' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  return (
    <Stack direction="row" align="center" gap={3}>
      <Switch
        id={inputId}
        checked={asBoolean(value)}
        onCheckedChange={(checked) => onChange(checked)}
        disabled={disabled}
      />
      <Stack gap={0}>
        <Label htmlFor={inputId}>{field.label}</Label>
        {field.helpText && (
          <Text size="xs" variant="muted">
            {field.helpText}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}

function DateFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'date' | 'datetime' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Input
        id={inputId}
        type={field.type === 'date' ? 'date' : 'datetime-local'}
        value={asString(value)}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={field.required}
      />
    </Stack>
  );
}

function EnumFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'enum' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  if (field.multiple) {
    const selected = new Set(asArray(value).filter((v): v is string => typeof v === 'string'));
    return (
      <Stack gap={1}>
        <FieldLabel htmlFor={inputId} field={field} />
        <Stack gap={1}>
          {field.options.map((opt) => {
            const id = `${inputId}__${opt.value}`;
            const checked = selected.has(opt.value);
            return (
              <Stack key={opt.value} direction="row" align="center" gap={2}>
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(next) => {
                    const nextSet = new Set(selected);
                    if (next) nextSet.add(opt.value);
                    else nextSet.delete(opt.value);
                    onChange([...nextSet]);
                  }}
                  disabled={disabled}
                />
                <Label htmlFor={id}>{opt.label}</Label>
              </Stack>
            );
          })}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Select value={asString(value)} onValueChange={(next) => onChange(next)} disabled={disabled}>
        <SelectTrigger id={inputId}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Stack>
  );
}

function ReferenceFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'reference' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isMultiple = field.multiple === true;

  const pickedIds = isMultiple
    ? asArray(value).filter((v): v is string => typeof v === 'string')
    : asString(value)
      ? [asString(value)]
      : [];

  const handlePick = (ref: PickedReference) => {
    if (isMultiple) {
      const next = [...new Set([...pickedIds, ref.entryId])];
      onChange(next);
    } else {
      onChange(ref.entryId);
    }
    setOpen(false);
  };

  const removePick = (id: string) => {
    if (isMultiple) {
      onChange(pickedIds.filter((p) => p !== id));
    } else {
      onChange(null);
    }
  };

  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Stack gap={2}>
        <Stack direction="row" align="center" gap={2} wrap>
          {pickedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-2 py-1 text-xs"
            >
              <code>{id.slice(0, 8)}</code>
              <button
                type="button"
                onClick={() => removePick(id)}
                aria-label={`Remove reference ${id}`}
                disabled={disabled}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Button
            type="button"
            variant="module-outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={disabled}
            leftIcon={<Plus className="h-3 w-3" />}
          >
            {isMultiple ? 'Add reference' : pickedIds.length ? 'Replace' : 'Pick reference'}
          </Button>
        </Stack>
      </Stack>
      <ReferencePicker open={open} onOpenChange={setOpen} onPick={handlePick} typeKey={field.to} />
    </Stack>
  );
}

function AssetFieldR({
  field,
  value,
  onChange,
  inputId,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'asset' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isMultiple = field.multiple === true;

  // Asset value can be a string asset-id, an object {assetId, src, alt},
  // or an array of either. Normalize to AssetRef[] for rendering.
  interface AssetRef {
    assetId: string;
    src: string;
    alt: string;
    caption?: string;
  }

  function toRef(raw: unknown): AssetRef | null {
    if (typeof raw === 'string') return { assetId: raw, src: '', alt: '' };
    if (raw && typeof raw === 'object' && 'assetId' in raw) {
      const r = raw as Record<string, unknown>;
      return {
        assetId: String(r.assetId),
        src: typeof r.src === 'string' ? r.src : '',
        alt: typeof r.alt === 'string' ? r.alt : '',
        caption: typeof r.caption === 'string' ? r.caption : undefined,
      };
    }
    return null;
  }

  const refs: AssetRef[] = isMultiple
    ? asArray(value)
        .map(toRef)
        .filter((r): r is AssetRef => r !== null)
    : (() => {
        const single = toRef(value);
        return single ? [single] : [];
      })();

  const handlePick = (picked: PickedAsset) => {
    const ref: AssetRef = {
      assetId: picked.assetId,
      src: picked.src,
      alt: picked.alt,
      caption: picked.caption,
    };
    if (isMultiple) {
      onChange([...refs, ref]);
    } else {
      onChange(ref);
    }
    setOpen(false);
  };

  const removeRef = (id: string) => {
    if (isMultiple) {
      onChange(refs.filter((r) => r.assetId !== id));
    } else {
      onChange(null);
    }
  };

  return (
    <Stack gap={1}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Stack direction="row" align="center" gap={2} wrap>
        {refs.map((r) => (
          <div
            key={r.assetId}
            className="relative h-20 w-20 overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]"
          >
            {r.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.src} alt={r.alt} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-tertiary)]">
                {r.assetId.slice(0, 6)}
              </div>
            )}
            <button
              type="button"
              onClick={() => removeRef(r.assetId)}
              aria-label="Remove asset"
              disabled={disabled}
              className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="module-outline"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={disabled}
          leftIcon={<Plus className="h-3 w-3" />}
        >
          {isMultiple ? 'Add asset' : refs.length ? 'Replace' : 'Pick asset'}
        </Button>
      </Stack>
      <MediaPicker open={open} onOpenChange={setOpen} onPick={handlePick} accept={field.accept} />
    </Stack>
  );
}

function ObjectFieldR({
  field,
  value,
  onChange,
  inputId,
  pathPrefix,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'object' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  pathPrefix: string;
  disabled?: boolean;
}) {
  const current = asObject(value);
  return (
    <Stack gap={2}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Card padding="md" className="border-[var(--color-border-default)]">
        <Stack gap={4}>
          {field.fields.map((subField) => (
            <FieldRenderer
              key={subField.key}
              field={subField}
              value={current[subField.key]}
              pathPrefix={`${pathPrefix}.${subField.key}`}
              disabled={disabled}
              onChange={(nextSubValue) => {
                const nextObj = { ...current };
                if (nextSubValue === undefined) {
                  delete nextObj[subField.key];
                } else {
                  nextObj[subField.key] = nextSubValue;
                }
                onChange(nextObj);
              }}
            />
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

function RepeaterFieldR({
  field,
  value,
  onChange,
  inputId,
  pathPrefix,
  disabled,
}: {
  field: Extract<FieldDef, { type: 'repeater' }>;
  value: unknown;
  onChange: (next: unknown) => void;
  inputId: string;
  pathPrefix: string;
  disabled?: boolean;
}) {
  const items = asArray(value).map(asObject);

  const addItem = () => {
    const empty: Record<string, unknown> = {};
    onChange([...items, empty]);
  };
  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };
  const updateItem = (index: number, next: Record<string, unknown>) => {
    onChange(items.map((it, i) => (i === index ? next : it)));
  };

  const canAdd = field.max === undefined || items.length < field.max;

  return (
    <Stack gap={2}>
      <FieldLabel htmlFor={inputId} field={field} />
      <Stack gap={3}>
        {items.length === 0 && (
          <Text variant="muted" size="sm">
            No items yet.
          </Text>
        )}
        {items.map((item, index) => (
          <Card key={index} padding="md" className="border-[var(--color-border-default)]">
            <Stack gap={3}>
              <Stack direction="row" align="center" justify="between">
                <Text size="sm" variant="muted">
                  {field.itemLabel ?? 'Item'} {index + 1}
                </Text>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(index)}
                  disabled={disabled}
                  leftIcon={<Trash2 className="h-3 w-3" />}
                >
                  Remove
                </Button>
              </Stack>
              {field.fields.map((subField) => (
                <FieldRenderer
                  key={subField.key}
                  field={subField}
                  value={item[subField.key]}
                  pathPrefix={`${pathPrefix}[${index}].${subField.key}`}
                  disabled={disabled}
                  onChange={(nextSubValue) => {
                    const nextItem = { ...item };
                    if (nextSubValue === undefined) {
                      delete nextItem[subField.key];
                    } else {
                      nextItem[subField.key] = nextSubValue;
                    }
                    updateItem(index, nextItem);
                  }}
                />
              ))}
            </Stack>
          </Card>
        ))}
        {canAdd && (
          <Button
            type="button"
            variant="module-outline"
            size="sm"
            onClick={addItem}
            disabled={disabled}
            leftIcon={<Plus className="h-3 w-3" />}
          >
            Add {field.itemLabel ?? 'item'}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

// ─── dispatch ──────────────────────────────────────────────────────────────

export function FieldRenderer({
  field,
  value,
  onChange,
  pathPrefix = '',
  disabled,
}: FieldRendererProps) {
  const inputId = `cms-field-${pathPrefix || field.key}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Slug derivation: if a slug field declares `sourceField`, we wire a
  // helper button that pulls the source value into the slugified form.
  // The parent owns both pieces of state, so the button is wired in
  // ContentEntryForm via a separate onChange path.
  switch (field.type) {
    case 'text':
    case 'url':
    case 'email':
      return (
        <TextFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'slug': {
      // Show inline "from {sourceField}" hint if present. Auto-derivation
      // is handled in the form orchestrator.
      const sourceHint = field.sourceField ? ` (auto-derives from ${field.sourceField})` : '';
      const fieldWithHint = {
        ...field,
        helpText: field.helpText ? `${field.helpText}${sourceHint}` : `Auto-derives${sourceHint}`,
      };
      return (
        <Stack gap={1}>
          <TextFieldR
            field={fieldWithHint}
            value={value}
            onChange={(next) => onChange(slugifyTitle(typeof next === 'string' ? next : ''))}
            inputId={inputId}
            disabled={disabled}
          />
        </Stack>
      );
    }
    case 'long_text':
      return (
        <LongTextFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'rich_text':
      return (
        <RichTextFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'number':
      return (
        <NumberFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'boolean':
      return (
        <BooleanFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'date':
    case 'datetime':
      return (
        <DateFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'enum':
      return (
        <EnumFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'reference':
      return (
        <ReferenceFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'asset':
      return (
        <AssetFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          disabled={disabled}
        />
      );
    case 'object':
      return (
        <ObjectFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          pathPrefix={pathPrefix || field.key}
          disabled={disabled}
        />
      );
    case 'repeater':
      return (
        <RepeaterFieldR
          field={field}
          value={value}
          onChange={onChange}
          inputId={inputId}
          pathPrefix={pathPrefix || field.key}
          disabled={disabled}
        />
      );
    default: {
      // Exhaustiveness check — adding a new FieldDef variant will
      // surface a compile error here. Cast to never on purpose.
      const _exhaustive: never = field;
      return (
        <Text variant="danger" size="sm">
          Unsupported field type: {String((_exhaustive as { type?: unknown }).type)}
        </Text>
      );
    }
  }
}
