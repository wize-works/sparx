'use client';

// Renders a single SectionField onto a @sparx/ui control. The same descriptor
// drives section config editing and (via the settings panels) theme settings.
// Form state is controlled by the parent — every control reports changes up via
// onChange so the customizer owns a single draft object.

import * as React from 'react';
import {
  Button,
  ColorPicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Textarea,
} from '@sparx/ui';
import { ImageIcon } from 'lucide-react';
import type { SectionField } from '@sparx/sitebuilder-schemas';
// The media library is shared dashboard infra (docs/29 §1) — Site Builder image
// fields reuse the CMS asset picker rather than a parallel one.
import { MediaPicker } from '../../cms/_components/media-picker';

// Web-safe + popular Google fonts offered in font pickers.
const FONT_OPTIONS = [
  'Inter',
  'Geist',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Oswald',
  'Playfair Display',
  'Fraunces',
  'Nunito Sans',
  'IBM Plex Sans',
  'Merriweather',
  'Source Sans 3',
];

export interface FieldControlProps {
  field: SectionField;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function FieldControl({ field, value, onChange }: FieldControlProps) {
  const id = `fld-${field.key}`;
  return (
    <div className="flex flex-col gap-1.5">
      {field.type !== 'boolean' ? <Label htmlFor={id}>{field.label}</Label> : null}
      <Control field={field} id={id} value={value} onChange={onChange} />
      {field.help ? <p className="text-xs text-[var(--color-text-muted)]">{field.help}</p> : null}
    </div>
  );
}

function Control({ field, id, value, onChange }: FieldControlProps & { id: string }) {
  switch (field.type) {
    case 'textarea':
    case 'richtext':
      return (
        <Textarea
          id={id}
          rows={field.type === 'richtext' ? 6 : 3}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={field.type === 'richtext' ? 'font-mono text-sm' : undefined}
        />
      );
    case 'color':
      return (
        <ColorPicker value={(value as string) ?? ''} onChange={onChange} ariaLabel={field.label} />
      );
    case 'font':
      return (
        <Select value={(value as string) ?? ''} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Choose a font" />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'select':
      return (
        <Select value={(value as string) ?? ''} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'range': {
      const n = typeof value === 'number' ? value : (field.min ?? 0);
      return (
        <div className="flex items-center gap-3">
          <Slider
            value={[n]}
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            onValueChange={(v) => onChange(v[0])}
            className="flex-1"
          />
          <span className="w-10 text-right text-sm text-[var(--color-text-muted)] tabular-nums">
            {n}
          </span>
        </div>
      );
    }
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm" htmlFor={id}>
          <Switch id={id} checked={Boolean(value)} onCheckedChange={(c) => onChange(c)} />
          {field.label}
        </label>
      );
    case 'media':
      return <MediaField field={field} value={value} onChange={onChange} />;
    case 'collection':
    case 'products':
      // Id-based references. A catalog search picker can replace these inputs
      // later without changing the stored shape.
      return (
        <Input
          id={id}
          value={Array.isArray(value) ? (value as string[]).join(', ') : ((value as string) ?? '')}
          placeholder={field.type === 'products' ? 'comma-separated ids' : 'id'}
          onChange={(e) =>
            onChange(
              field.type === 'products'
                ? e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : e.target.value || null
            )
          }
        />
      );
    case 'list':
      return <ListField field={field} value={value} onChange={onChange} />;
    case 'url':
    case 'text':
    default:
      return (
        <Input
          id={id}
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// Image field — opens the shared CMS asset picker and stores the picked
// asset's id (the same shape the old raw text box stored, so nothing
// downstream changes). Shows a thumbnail once an asset is picked this session.
function MediaField({
  value,
  onChange,
}: Omit<FieldControlProps, 'field'> & { field?: SectionField }) {
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const assetId = typeof value === 'string' && value ? value : null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]">
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5 text-[var(--color-text-tertiary)]" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {assetId ? 'Change image' : 'Choose image'}
          </Button>
          {assetId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPreview(null);
                onChange(null);
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
        {assetId ? (
          <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{assetId}</span>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">No image selected</span>
        )}
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        accept={['image/*']}
        onPick={(asset) => {
          setPreview(asset.src || null);
          onChange(asset.assetId);
          setOpen(false);
        }}
      />
    </div>
  );
}

// Repeatable group of item-field rows (e.g. testimonials). Each item is an
// object keyed by the itemFields; add/remove manage the array.
function ListField({ field, value, onChange }: FieldControlProps) {
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const itemFields = field.itemFields ?? [];

  const setItem = (index: number, key: string, v: unknown) => {
    const next = items.map((it, i) => (i === index ? { ...it, [key]: v } : it));
    onChange(next);
  };
  const addItem = () => onChange([...items, {}]);
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-md border border-[var(--color-border-default)] p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              {field.itemLabel ?? 'Item'} {i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Remove
            </button>
          </div>
          {itemFields.map((f) => (
            <FieldControl
              key={f.key}
              field={f}
              value={item[f.key]}
              onChange={(v) => setItem(i, f.key, v)}
            />
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="self-start text-sm text-[var(--module-active)] hover:underline"
      >
        + Add {field.itemLabel ?? 'item'}
      </button>
    </div>
  );
}
