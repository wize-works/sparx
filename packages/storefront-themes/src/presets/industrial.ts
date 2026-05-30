// Industrial — dark, bold, technical. The Gillett Diesel reference theme for
// B2B / parts catalogs. Its "light" palette keeps the bold, high-contrast
// look; the dark variant deepens it.

import type { ThemePreset } from '../types';
import { DEFAULT_SECTION_TYPES, DEFAULT_SETTINGS_SCHEMA } from './_schema';

export const industrial: ThemePreset = {
  key: 'industrial',
  name: 'Industrial',
  category: 'b2b',
  description: 'Bold, high-contrast, and technical — built for parts and heavy-duty B2B.',
  version: '1.0.0',
  recommendedFor: ['b2b', 'fleet'],
  settingsSchema: DEFAULT_SETTINGS_SCHEMA,
  sectionTypes: DEFAULT_SECTION_TYPES,
  tokenDefaults: {
    light: {
      colorPrimary: '#cc1010',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#f59e0b',
      colorBackground: '#ffffff',
      colorForeground: '#18181b',
      colorMuted: '#f4f4f5',
      colorBorder: '#d4d4d8',
      fontHeading: 'Oswald',
      fontBody: 'Inter',
      radiusBase: '0.125rem',
      containerWidth: 'wide',
    },
    dark: {
      colorPrimary: '#ef4444',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#fbbf24',
      colorBackground: '#0a0a0a',
      colorForeground: '#fafafa',
      colorMuted: '#18181b',
      colorBorder: '#27272a',
      fontHeading: 'Oswald',
      fontBody: 'Inter',
      radiusBase: '0.125rem',
      containerWidth: 'wide',
    },
  },
};
