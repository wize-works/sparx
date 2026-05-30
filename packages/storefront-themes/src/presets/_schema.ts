// The default customizer settings schema, shared by every preset. Themes
// differ in their token *defaults*, not in which settings are editable — so
// the field list is hoisted here and referenced by each preset.

import type { ThemeSettingField } from '../types';

const RADIUS_OPTIONS = [
  { label: 'None', value: '0px' },
  { label: 'Sharp', value: '0.125rem' },
  { label: 'Subtle', value: '0.25rem' },
  { label: 'Rounded', value: '0.5rem' },
  { label: 'Soft', value: '0.75rem' },
  { label: 'Large', value: '1rem' },
];

const CONTAINER_OPTIONS = [
  { label: 'Narrow', value: 'narrow' },
  { label: 'Medium', value: 'medium' },
  { label: 'Wide', value: 'wide' },
  { label: 'Full width', value: 'full' },
];

export const DEFAULT_SETTINGS_SCHEMA: ThemeSettingField[] = [
  // Colors — edited per light/dark palette.
  { key: 'colorPrimary', label: 'Primary', type: 'color', group: 'colors', perMode: true },
  {
    key: 'colorPrimaryForeground',
    label: 'On primary',
    type: 'color',
    group: 'colors',
    perMode: true,
    help: 'Text/icon color shown on top of the primary color.',
  },
  { key: 'colorAccent', label: 'Accent', type: 'color', group: 'colors', perMode: true },
  { key: 'colorBackground', label: 'Background', type: 'color', group: 'colors', perMode: true },
  { key: 'colorForeground', label: 'Text', type: 'color', group: 'colors', perMode: true },
  { key: 'colorMuted', label: 'Muted surface', type: 'color', group: 'colors', perMode: true },
  { key: 'colorBorder', label: 'Border', type: 'color', group: 'colors', perMode: true },

  // Typography — shared across modes.
  { key: 'fontHeading', label: 'Heading font', type: 'font', group: 'typography', perMode: false },
  { key: 'fontBody', label: 'Body font', type: 'font', group: 'typography', perMode: false },

  // Layout — shared across modes.
  {
    key: 'radiusBase',
    label: 'Corner radius',
    type: 'select',
    group: 'layout',
    perMode: false,
    options: RADIUS_OPTIONS,
  },
  {
    key: 'containerWidth',
    label: 'Content width',
    type: 'select',
    group: 'layout',
    perMode: false,
    options: CONTAINER_OPTIONS,
  },
];

// Every theme ships the same section library for now.
export const DEFAULT_SECTION_TYPES = [
  'hero',
  'featured-products',
  'collection-grid',
  'rich-text',
  'image-banner',
  'testimonials',
  'email-signup',
];
