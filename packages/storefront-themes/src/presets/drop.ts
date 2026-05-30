// Drop — bright, punchy, product-grid focused. Optimized for high-volume
// dropship catalogs.

import type { ThemePreset } from '../types';
import { DEFAULT_SECTION_TYPES, DEFAULT_SETTINGS_SCHEMA } from './_schema';

export const drop: ThemePreset = {
  key: 'drop',
  name: 'Drop',
  category: 'dropship',
  description: 'Bright and punchy — a grid-first layout tuned for large dropship catalogs.',
  version: '1.0.0',
  recommendedFor: ['dropship'],
  settingsSchema: DEFAULT_SETTINGS_SCHEMA,
  sectionTypes: DEFAULT_SECTION_TYPES,
  tokenDefaults: {
    light: {
      colorPrimary: '#7c3aed',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#ec4899',
      colorBackground: '#ffffff',
      colorForeground: '#18181b',
      colorMuted: '#f4f4f5',
      colorBorder: '#e4e4e7',
      fontHeading: 'Poppins',
      fontBody: 'Inter',
      radiusBase: '1rem',
      containerWidth: 'wide',
    },
    dark: {
      colorPrimary: '#8b5cf6',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#f472b6',
      colorBackground: '#0c0a13',
      colorForeground: '#ededf0',
      colorMuted: '#16131f',
      colorBorder: '#272233',
      fontHeading: 'Poppins',
      fontBody: 'Inter',
      radiusBase: '1rem',
      containerWidth: 'wide',
    },
  },
};
