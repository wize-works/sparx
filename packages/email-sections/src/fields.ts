// SectionField — the form-generation descriptor for a section's editable
// settings. The dashboard composer renders these (mapping each type onto a
// @sparx/ui control). Structurally identical to the Site Builder's SectionField
// (docs/31 §8) so the two merge into a shared kernel later.

export type SectionFieldType =
  | 'text'
  | 'textarea'
  | 'richtext' // a CmsDoc edited with the TipTap ContentBlockEditor
  | 'select'
  | 'number'
  | 'range'
  | 'boolean'
  | 'media'
  | 'url'
  | 'collection'
  | 'products'
  | 'list';

export interface SectionFieldOption {
  label: string;
  value: string;
}

export interface SectionField {
  key: string;
  label: string;
  type: SectionFieldType;
  help?: string;
  placeholder?: string;
  options?: SectionFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  // Show this field only when another field's value matches. Lets the inspector
  // hide e.g. the collection picker unless source === 'collection'.
  showWhen?: { key: string; equals: string };
  // For `list` fields: the per-item editable fields.
  itemLabel?: string;
  itemFields?: SectionField[];
}
