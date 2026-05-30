// Market — warm, artisan, community-oriented. For food / specialty makers.

import type { ThemePreset } from '../types';
import { DEFAULT_SECTION_TYPES, DEFAULT_SETTINGS_SCHEMA } from './_schema';

export const market: ThemePreset = {
  key: 'market',
  name: 'Market',
  category: 'food',
  description: 'Warm and artisan — inviting tones for food, makers, and specialty goods.',
  version: '1.0.0',
  recommendedFor: ['food'],
  settingsSchema: DEFAULT_SETTINGS_SCHEMA,
  sectionTypes: DEFAULT_SECTION_TYPES,
  tokenDefaults: {
    light: {
      colorPrimary: '#b45309',
      colorPrimaryForeground: '#fffaf0',
      colorAccent: '#65a30d',
      colorBackground: '#fffdf7',
      colorForeground: '#3a2e1f',
      colorMuted: '#f5ecd9',
      colorBorder: '#e7d8b8',
      fontHeading: 'Fraunces',
      fontBody: 'Nunito Sans',
      radiusBase: '0.75rem',
      containerWidth: 'medium',
    },
    dark: {
      colorPrimary: '#d97706',
      colorPrimaryForeground: '#1a1206',
      colorAccent: '#84cc16',
      colorBackground: '#1a1206',
      colorForeground: '#f5ecd9',
      colorMuted: '#261a0c',
      colorBorder: '#3a2a14',
      fontHeading: 'Fraunces',
      fontBody: 'Nunito Sans',
      radiusBase: '0.75rem',
      containerWidth: 'medium',
    },
  },
};
