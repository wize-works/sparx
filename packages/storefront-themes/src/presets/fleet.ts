// Fleet — data-dense, professional, dashboard-like. For B2B fleet operators
// who want a wide, information-rich storefront.

import type { ThemePreset } from '../types';
import { DEFAULT_SECTION_TYPES, DEFAULT_SETTINGS_SCHEMA } from './_schema';

export const fleet: ThemePreset = {
  key: 'fleet',
  name: 'Fleet',
  category: 'fleet',
  description: 'Data-dense and professional — a wide, utilitarian layout for fleet B2B.',
  version: '1.0.0',
  recommendedFor: ['fleet', 'b2b'],
  settingsSchema: DEFAULT_SETTINGS_SCHEMA,
  sectionTypes: DEFAULT_SECTION_TYPES,
  tokenDefaults: {
    light: {
      colorPrimary: '#1d4ed8',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#0891b2',
      colorBackground: '#ffffff',
      colorForeground: '#0f172a',
      colorMuted: '#f1f5f9',
      colorBorder: '#cbd5e1',
      fontHeading: 'IBM Plex Sans',
      fontBody: 'IBM Plex Sans',
      radiusBase: '0.25rem',
      containerWidth: 'full',
    },
    dark: {
      colorPrimary: '#3b82f6',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#22d3ee',
      colorBackground: '#0f172a',
      colorForeground: '#e2e8f0',
      colorMuted: '#1e293b',
      colorBorder: '#334155',
      fontHeading: 'IBM Plex Sans',
      fontBody: 'IBM Plex Sans',
      radiusBase: '0.25rem',
      containerWidth: 'full',
    },
  },
};
