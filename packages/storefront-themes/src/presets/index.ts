import type { ThemeKey, ThemePreset } from '../types';
import { apex } from './apex';
import { industrial } from './industrial';
import { drift } from './drift';
import { market } from './market';
import { fleet } from './fleet';
import { drop } from './drop';

export const THEMES: Record<ThemeKey, ThemePreset> = {
  apex,
  industrial,
  drift,
  market,
  fleet,
  drop,
};

// Stable display order for the theme gallery.
export const THEME_LIST: ThemePreset[] = [apex, industrial, drift, market, fleet, drop];

export const DEFAULT_THEME_KEY: ThemeKey = 'apex';

export { apex, industrial, drift, market, fleet, drop };
