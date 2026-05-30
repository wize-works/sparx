// Drift — editorial, image-forward, minimal. For fashion / lifestyle brands
// that lead with photography and whitespace.

import type { ThemePreset } from '../types';
import { DEFAULT_SECTION_TYPES, DEFAULT_SETTINGS_SCHEMA } from './_schema';

export const drift: ThemePreset = {
  key: 'drift',
  name: 'Drift',
  category: 'fashion',
  description: 'Editorial and image-forward — elegant whitespace for fashion and lifestyle.',
  version: '1.0.0',
  recommendedFor: ['fashion'],
  settingsSchema: DEFAULT_SETTINGS_SCHEMA,
  sectionTypes: DEFAULT_SECTION_TYPES,
  tokenDefaults: {
    light: {
      colorPrimary: '#111111',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#b08968',
      colorBackground: '#fafafa',
      colorForeground: '#1a1a1a',
      colorMuted: '#f0ede8',
      colorBorder: '#e5e0d8',
      fontHeading: 'Playfair Display',
      fontBody: 'Inter',
      radiusBase: '0px',
      containerWidth: 'wide',
    },
    dark: {
      colorPrimary: '#f5f5f5',
      colorPrimaryForeground: '#111111',
      colorAccent: '#c9a27e',
      colorBackground: '#141414',
      colorForeground: '#f0f0f0',
      colorMuted: '#1e1e1e',
      colorBorder: '#2a2a2a',
      fontHeading: 'Playfair Display',
      fontBody: 'Inter',
      radiusBase: '0px',
      containerWidth: 'wide',
    },
  },
};
