// SectionField — the form-generation descriptor for a section's editable
// settings. The dashboard customizer renders these (mapping each type onto a
// @sparx/ui control), and the section library uses the registry metadata.
// Kept independent of the CMS FieldDef so this package stays zod-only.

export type SectionFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'color'
  | 'font'
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
  // For `list` fields (e.g. testimonials): the per-item editable fields.
  itemLabel?: string;
  itemFields?: SectionField[];
}
