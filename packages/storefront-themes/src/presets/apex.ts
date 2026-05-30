// Apex — the default, general-purpose theme. Clean, modern, versatile; works
// for most verticals out of the box.

import type { ThemePreset } from '../types';
import { DEFAULT_SECTION_TYPES, DEFAULT_SETTINGS_SCHEMA } from './_schema';

export const apex: ThemePreset = {
  key: 'apex',
  name: 'Apex',
  category: 'general',
  description: 'Clean, modern, and versatile — a confident default for any catalog.',
  version: '1.0.0',
  recommendedFor: ['general'],
  settingsSchema: DEFAULT_SETTINGS_SCHEMA,
  sectionTypes: DEFAULT_SECTION_TYPES,
  tokenDefaults: {
    light: {
      colorPrimary: '#4f46e5',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#0ea5e9',
      colorBackground: '#ffffff',
      colorForeground: '#0f172a',
      colorMuted: '#f1f5f9',
      colorBorder: '#e2e8f0',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      radiusBase: '0.5rem',
      containerWidth: 'medium',
    },
    dark: {
      colorPrimary: '#6366f1',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#38bdf8',
      colorBackground: '#0b1120',
      colorForeground: '#e2e8f0',
      colorMuted: '#111827',
      colorBorder: '#1f2937',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      radiusBase: '0.5rem',
      containerWidth: 'medium',
    },
  },
};
