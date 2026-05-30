// Shared leaf schemas reused across section configs and site settings.

import { z } from 'zod';

export const Uuid = z.string().uuid();
export const OptionalUuid = z.string().uuid().optional().nullable();

// Hex color (#rgb or #rrggbb). Stored in VARCHAR(7) columns / token maps.
export const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color like #1a2b3c');

export const Align = z.enum(['left', 'center', 'right']);
export type Align = z.infer<typeof Align>;

export const AppearancePolicy = z.enum(['light-only', 'dark-only', 'auto', 'toggle']);
export type AppearancePolicy = z.infer<typeof AppearancePolicy>;

export const ThemeKey = z.enum(['apex', 'industrial', 'drift', 'market', 'fleet', 'drop']);
export type ThemeKey = z.infer<typeof ThemeKey>;

export const LayoutSlot = z.enum(['header', 'footer', 'announcement']);
export type LayoutSlot = z.infer<typeof LayoutSlot>;

// Optional bounded URL/path (internal "/foo" or external "https://…").
export const LinkUrl = z.string().max(2048);
