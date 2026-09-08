'use client';

// The Attributes tab — the typed details a product carries beyond its spine
// (docs/143).
//
// A product's price, code, variants, images and SEO are its fixed commerce spine
// and live on the other tabs. THIS tab owns the variable, type-defined layer: pick
// the kind of product (its product TYPE), and this renders one control per
// attribute that type declares — fabric/care/fit for apparel, ingredients for
// food, a spec repeater for electronics. Nothing here is hardcoded: the controls
// come from the type's schema, exactly as the CMS body editor comes from a content
// type's schema. The two share the FieldDef vocabulary through product-types-data.
//
// ── Where Save lives ──────────────────────────────────────────────────────
// A tab OWNS its draft but renders NO Save of its own — it hands `dirty`/`saving`/
// `save` up to the pane toolbar via `useTabSave` (see product-tab-save.tsx). The
// productTypeKey + attributes persist through the ordinary product PATCH, validated
// against the type's schema server-side (422 on mismatch, shown verbatim).

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Switch,
  Text,
  Textarea,
} from '@wizeworks/silicaui-react';
import { Plus, Shapes, Trash2 } from 'lucide-react';
import { ContentBlockEditor } from '@wizeworks/cms-editor/editor';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { MediaPickerProvider, AssetField, useMediaPicker } from '../cms/media-picker';
import { useTabSave } from './product-tab-save';
import { useUpdateProduct, type Product, type ProductPatch } from './products-data';
import { useShippingProfiles } from './shipping-data';
import {
  useProductTypeList,
  type FieldDef,
  type ObjectFieldDef,
  type ProductType,
  type RepeaterFieldDef,
} from './product-types-data';

/* ── Value readers ──────────────────────────────────────────────────────── */

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}
function asDoc(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** ISO ⇄ the `datetime-local` control's "YYYY-MM-DDTHH:mm" in the viewer's zone. */
function isoToLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function localToIso(local: string): string | undefined {
  if (local.trim() === '') return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/* ── Emptiness pruning ──────────────────────────────────────────────────────
 *
 * The form keeps every field in state whether filled or not; an untouched
 * optional would otherwise ride along as "" and read as a change against a bag
 * that never had the key. Pruning before BOTH the dirty check and the write keeps
 * "have I changed anything?" honest and keeps the stored bag minimal. */

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.every(isEmpty);
  if (typeof value === 'object') return Object.values(value).every(isEmpty);
  return false;
}

function pruneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const cleaned = value.map(pruneValue).filter((v) => !isEmpty(v));
    return cleaned;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = pruneValue(v);
      if (!isEmpty(pruned)) out[k] = pruned;
    }
    return out;
  }
  return value;
}

function pruneAttributes(bag: Record<string, unknown>): Record<string, unknown> {
  return pruneValue(bag) as Record<string, unknown>;
}

/* ── The tab ────────────────────────────────────────────────────────────── */

export function ProductAttributesTab({ ctx, product }: { ctx: SurfaceContext; product: Product }) {
  const { data: types, isPending, isError, refetch } = useProductTypeList();
  const { data: profiles } = useShippingProfiles();
  const update = useUpdateProduct(product.id);

  const savedTypeKey = product.productTypeKey ?? '';
  const savedAttributes = useMemo(() => product.attributes ?? {}, [product]);

  const savedProfileId = product.shippingProfileId ?? '';

  const [typeKey, setTypeKey] = useState(savedTypeKey);
  const [profileId, setProfileId] = useState(savedProfileId);
  const [attributes, setAttributes] = useState<Record<string, unknown>>(savedAttributes);
  const [touched, setTouched] = useState(false);
  // Track the server's copy when it changes underneath a CLEAN form — a refetch
  // after someone else edited must land. A dirty form is never overwritten.
  useEffect(() => {
    if (!touched) {
      setTypeKey(savedTypeKey);
      setAttributes(savedAttributes);
      setProfileId(savedProfileId);
    }
  }, [savedTypeKey, savedAttributes, savedProfileId, touched]);

  const selectedType = (types ?? []).find((t) => t.key === typeKey) ?? null;
  const typeMissing = typeKey !== '' && !isPending && !isError && !selectedType;

  const prunedAttrs = pruneAttributes(attributes);
  const dirty =
    JSON.stringify({ typeKey, attrs: prunedAttrs, profileId }) !==
    JSON.stringify({
      typeKey: savedTypeKey,
      attrs: pruneAttributes(savedAttributes),
      profileId: savedProfileId,
    });

  useTabSave({
    dirty,
    saving: update.isPending,
    save: async () => {
      const patch: ProductPatch = {
        ...(typeKey
          ? { productTypeKey: typeKey, attributes: prunedAttrs }
          : { productTypeKey: null }),
        // Empty string is the "standard way" option, and the API clears the
        // group on null — an empty string would be an unknown id.
        shippingProfileId: profileId === '' ? null : profileId,
      };
      const next = await update.mutateAsync(patch);
      setTouched(false);
      setTypeKey(next.productTypeKey ?? '');
      setAttributes(next.attributes ?? {});
      setProfileId(next.shippingProfileId ?? '');
    },
  });

  const onSelectType = (nextKey: string) => {
    setTouched(true);
    setTypeKey(nextKey);
    // A different type declares different attributes, so its values don't carry
    // over — start the new type's form fresh (going back to the SAVED type
    // restores what was stored).
    setAttributes(nextKey === savedTypeKey ? savedAttributes : {});
  };

  const setField = (key: string, next: unknown) => {
    setTouched(true);
    setAttributes((current) => ({ ...current, [key]: next }));
  };

  return (
    <MediaPickerProvider source="product">
      <div className="flex flex-col gap-4">
        <FormSection
          title="What kind of product is this?"
          description="Choosing a kind adds the extra details products of that kind carry — like fabric and care for clothing, or ingredients for food."
        >
          {isError ? (
            <div className="flex flex-col items-start gap-2">
              <Text className="text-sm">
                The list of product kinds could not be loaded just now.
              </Text>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <Field className="max-w-sm">
              <FieldLabel>Kind of product</FieldLabel>
              <NativeSelect
                color="module"
                value={typeMissing ? '__missing__' : typeKey}
                aria-label="Kind of product"
                disabled={isPending}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === '__missing__') return;
                  onSelectType(v);
                }}
              >
                <option value="">No kind — just the basics</option>
                {typeMissing ? (
                  <option value="__missing__">Its kind is no longer defined</option>
                ) : null}
                {(types ?? []).map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.icon ? `${type.icon} ` : ''}
                    {type.name}
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>
                Change this any time. Removing the kind clears these extra details.
              </FieldDescription>
            </Field>
          )}

          {typeMissing ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>This product&apos;s kind is no longer defined</AlertTitle>
                <AlertDescription>
                  The product type “{typeKey}” has been deleted. The details already saved on this
                  product are kept, but you cannot edit them here until you choose a kind again.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {!isPending && !isError && (types ?? []).length === 0 ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>No product kinds yet</AlertTitle>
                <AlertDescription>
                  Define a kind of product — with the details it should carry — and it will show up
                  here to choose from.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="module"
                variant="soft"
                onClick={() => {
                  ctx.open('commerce.product-types.detail', { key: 'new' }, { target: 'beside' });
                }}
              >
                <Plus className="size-4" aria-hidden />
                New product type
              </Button>
            </Alert>
          ) : null}
        </FormSection>

        {/* Where a product is FILED for delivery. It lives on this tab because
            the tab is the product's "anything else about it" home, and because
            the group screen promises in as many words that a product joins its
            group "from each product later" — a promise nothing in the console
            kept until this control existed (issue 427). Hidden when the shop
            has only its standard group, which is nearly every shop: a picker
            with one option is a question with one answer. */}
        {(profiles?.items ?? []).length > 1 ? (
          <FormSection
            title="How this one is delivered"
            description="Most products go the standard way. Put this one in a group only if it ships differently — a bigger box, freight, or something that needs a signature — and it will be priced by that group's delivery options."
          >
            <Field className="max-w-sm">
              <FieldLabel>Delivery group</FieldLabel>
              <NativeSelect
                color="module"
                value={profileId}
                aria-label="Delivery group"
                onChange={(event) => {
                  setTouched(true);
                  setProfileId(event.target.value);
                }}
              >
                <option value="">The standard way</option>
                {(profiles?.items ?? []).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>
                Set delivery prices for each group under Sell &rsaquo; Postage and delivery.
              </FieldDescription>
            </Field>
          </FormSection>
        ) : null}

        {selectedType ? (
          <AttributeForm type={selectedType} value={attributes} onFieldChange={setField} />
        ) : typeKey === '' && !isPending ? (
          <div className="border-base-300 flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
            <Shapes className="size-6" aria-hidden />
            <Text className="text-sm">
              Pick a kind of product above to describe it in more detail. Without one, this product
              is sold on its name, price and photos alone — which is perfectly fine.
            </Text>
          </div>
        ) : null}
      </div>
    </MediaPickerProvider>
  );
}

/* ── The schema-driven form ─────────────────────────────────────────────── */

function AttributeForm({
  type,
  value,
  onFieldChange,
}: {
  type: ProductType;
  value: Record<string, unknown>;
  onFieldChange: (key: string, next: unknown) => void;
}) {
  return (
    <FormSection
      title={`${type.name} details`}
      description={type.description ?? 'The details every product of this kind carries.'}
    >
      <BodyFields fields={type.attributeSchema.fields} value={value} onChange={onFieldChange} />
    </FormSection>
  );
}

interface BodyFieldsProps {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (key: string, next: unknown) => void;
  disabled?: boolean;
}

/** Render every field in a schema against the value object it owns. */
function BodyFields({ fields, value, onChange, disabled }: BodyFieldsProps) {
  return (
    <>
      {fields.map((field) => (
        <SchemaField
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={(next) => {
            onChange(field.key, next);
          }}
          disabled={disabled}
        />
      ))}
    </>
  );
}

interface SchemaFieldProps {
  field: FieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}

function SchemaField({ field, value, onChange, disabled }: SchemaFieldProps) {
  if (field.type === 'object') {
    return <ObjectField field={field} value={value} onChange={onChange} disabled={disabled} />;
  }
  if (field.type === 'repeater') {
    return <RepeaterField field={field} value={value} onChange={onChange} disabled={disabled} />;
  }

  const label = field.required ? `${field.label} (required)` : field.label;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldInput field={field} value={value} onChange={onChange} disabled={disabled} />
      {field.helpText ? <FieldDescription>{field.helpText}</FieldDescription> : null}
    </Field>
  );
}

/** The control for a scalar/leaf field. Groups and repeaters are handled above. */
function FieldInput({ field, value, onChange, disabled }: SchemaFieldProps) {
  switch (field.type) {
    case 'long_text':
      return (
        <FieldControl
          render={
            <Textarea
              color="module"
              rows={field.rows ?? 4}
              value={asString(value)}
              disabled={disabled}
              onChange={(event) => {
                onChange(event.target.value);
              }}
            />
          }
        />
      );

    case 'rich_text':
      return <RichTextField field={field} value={value} onChange={onChange} disabled={disabled} />;

    case 'number':
      return (
        <FieldControl
          render={
            <Input
              color="module"
              type="number"
              inputMode={field.integer ? 'numeric' : 'decimal'}
              value={typeof value === 'number' ? String(value) : asString(value)}
              disabled={disabled}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw.trim() === '') {
                  onChange(undefined);
                  return;
                }
                const parsed = Number(raw);
                onChange(Number.isFinite(parsed) ? parsed : raw);
              }}
            />
          }
        />
      );

    case 'boolean':
      return (
        <Switch
          color="module"
          checked={value === true}
          disabled={disabled}
          onCheckedChange={(next) => {
            onChange(next);
          }}
        />
      );

    case 'date':
      return (
        <FieldControl
          render={
            <div className="max-w-[16rem]">
              <Input
                color="module"
                type="date"
                value={asString(value)}
                disabled={disabled}
                onChange={(event) => {
                  onChange(event.target.value || undefined);
                }}
              />
            </div>
          }
        />
      );

    case 'datetime':
      return (
        <FieldControl
          render={
            <div className="max-w-[18rem]">
              <Input
                color="module"
                type="datetime-local"
                value={value ? isoToLocal(asString(value)) : ''}
                disabled={disabled}
                onChange={(event) => {
                  onChange(localToIso(event.target.value));
                }}
              />
            </div>
          }
        />
      );

    case 'enum':
      return field.multiple ? (
        <ChipMultiSelect
          options={field.options}
          selected={asStringArray(value)}
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
        <NativeSelect
          color="module"
          value={asString(value)}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value || undefined);
          }}
        >
          <option value="">Choose…</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      );

    case 'reference':
      // A product attribute that links to another record. Rare, and genuinely
      // technical (it stores the record's id), so it is a plain id field with an
      // honest note rather than a picker over a list this tab cannot know the
      // shape of. Built-in types never use it.
      return (
        <FieldControl
          render={
            <Input
              color="module"
              className="font-mono text-sm"
              value={asString(value)}
              placeholder="The id of the record to link"
              spellCheck={false}
              autoComplete="off"
              disabled={disabled}
              onChange={(event) => {
                onChange(event.target.value || undefined);
              }}
            />
          }
        />
      );

    case 'asset':
      // The shared media picker — pick from the library or upload. Stores the
      // asset id(s) the schema validates.
      return (
        <AssetField
          value={value}
          onChange={onChange}
          multiple={field.multiple ?? false}
          disabled={disabled}
        />
      );

    case 'slug':
    case 'url':
    case 'email':
    case 'text':
    default:
      return (
        <FieldControl
          render={
            <Input
              color="module"
              type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
              className={field.type === 'slug' ? 'font-mono text-sm' : undefined}
              value={asString(value)}
              disabled={disabled}
              placeholder={field.type === 'text' ? field.placeholder : undefined}
              onChange={(event) => {
                onChange(event.target.value || undefined);
              }}
            />
          }
        />
      );
  }
}

/* ── Multi-select as toggle chips ───────────────────────────────────────── */

function ChipMultiSelect({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const set = new Set(selected);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = set.has(option.value);
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={on ? 'soft' : 'outline'}
            {...(on ? { color: 'module' as const } : {})}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => {
              const next = new Set(set);
              if (on) next.delete(option.value);
              else next.add(option.value);
              onChange([...next]);
            }}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

/* ── Rich text ──────────────────────────────────────────────────────────── */

function RichTextField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}) {
  const pick = useMediaPicker();
  return (
    <ContentBlockEditor
      value={asDoc(value)}
      onChange={onChange}
      disabled={disabled}
      ariaLabel={field.label}
      minHeight="16rem"
      placeholder="Write here. Use the toolbar for headings, lists, links, and pictures."
      pickImage={async () => {
        const asset = await pick();
        return asset?.url ? { src: asset.url, assetId: asset.id, alt: asset.filename } : null;
      }}
    />
  );
}

/* ── Nested group ───────────────────────────────────────────────────────── */

function ObjectField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ObjectFieldDef;
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const record = asRecord(value);
  return (
    <div className="border-base-300 flex flex-col gap-4 rounded-lg border p-3">
      <div className="flex flex-col gap-0.5">
        <Heading level={3} className="text-base font-semibold">
          {field.label}
        </Heading>
        {field.helpText ? <Text className="text-sm">{field.helpText}</Text> : null}
      </div>
      <BodyFields
        fields={field.fields}
        value={record}
        disabled={disabled}
        onChange={(key, next) => {
          onChange({ ...record, [key]: next });
        }}
      />
    </div>
  );
}

/* ── Repeater of groups ─────────────────────────────────────────────────── */

function RepeaterField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: RepeaterFieldDef;
  value: unknown;
  onChange: (next: Record<string, unknown>[]) => void;
  disabled?: boolean;
}) {
  const items = asRecordArray(value);
  const itemNoun = field.itemLabel ?? 'item';

  const update = (index: number, key: string, next: unknown) => {
    const copy = items.map((item, i) => (i === index ? { ...item, [key]: next } : item));
    onChange(copy);
  };
  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...items, {}]);
  };

  const atMax = field.max !== undefined && items.length >= field.max;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Heading level={3} className="text-base font-semibold">
          {field.required ? `${field.label} (required)` : field.label}
        </Heading>
        {field.helpText ? <Text className="text-sm">{field.helpText}</Text> : null}
      </div>

      {items.length === 0 ? (
        <Text className="text-sm">No {itemNoun}s yet.</Text>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            // Index key: repeater rows have no stable id, and reordering is not
            // offered here, so positional identity is correct for this list.
            <div key={index} className="border-base-300 flex flex-col gap-4 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <Text className="text-sm font-semibold">
                  {itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1)} {index + 1}
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  shape="square"
                  disabled={disabled}
                  aria-label={`Remove ${itemNoun} ${String(index + 1)}`}
                  title={`Remove this ${itemNoun}`}
                  onClick={() => {
                    remove(index);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <BodyFields
                fields={field.fields}
                value={item}
                disabled={disabled}
                onChange={(key, next) => {
                  update(index, key, next);
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <Button
          size="sm"
          variant="outline"
          color="module"
          disabled={atMax || Boolean(disabled)}
          onClick={add}
        >
          <Plus className="size-4" aria-hidden />
          Add {itemNoun}
        </Button>
        {atMax ? (
          <Text className="mt-1 text-sm">
            You have reached the most this allows ({String(field.max)}).
          </Text>
        ) : null}
      </div>
    </div>
  );
}
