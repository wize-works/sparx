// Site-level settings + layout-slot config shapes.
//
// SiteSettings is the JSONB stored in SiteConfig.draftSettings: the per-mode
// token overlay (laid over a theme preset at compile time) plus custom CSS.
// Layout-slot configs back the header / footer / announcement SiteLayoutBlocks.

import { z } from 'zod';
import { LinkUrl } from './common';

// Per-mode token overlay. Keys are validated loosely (string→string); the
// theme compiler keeps only recognized token keys, so an unknown key here is
// harmless.
export const ThemeOverlay = z.object({
  light: z.record(z.string(), z.string()).default({}),
  dark: z.record(z.string(), z.string()).default({}),
});
export type ThemeOverlay = z.infer<typeof ThemeOverlay>;

export const SiteSettings = z.object({
  tokens: ThemeOverlay.default({ light: {}, dark: {} }),
  customCss: z.string().max(20000).default(''),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

// ── Layout slots ──────────────────────────────────────────────────────────

export const HeaderConfig = z.object({
  sticky: z.boolean().default(true),
  showSearch: z.boolean().default(true),
  // 'left' | 'center' — where the logo sits in the bar.
  logoPlacement: z.enum(['left', 'center']).default('left'),
});
export type HeaderConfig = z.infer<typeof HeaderConfig>;

export const SocialLink = z.object({
  platform: z.enum(['instagram', 'facebook', 'x', 'tiktok', 'youtube', 'linkedin', 'pinterest']),
  url: LinkUrl,
});
export type SocialLink = z.infer<typeof SocialLink>;

export const FooterConfig = z.object({
  copyright: z.string().max(300).default(''),
  socialLinks: z.array(SocialLink).max(8).default([]),
  showPaymentIcons: z.boolean().default(true),
});
export type FooterConfig = z.infer<typeof FooterConfig>;

export const AnnouncementConfig = z.object({
  enabled: z.boolean().default(false),
  text: z.string().max(300).default(''),
  linkUrl: LinkUrl.default(''),
});
export type AnnouncementConfig = z.infer<typeof AnnouncementConfig>;

export const LAYOUT_SLOT_SCHEMAS = {
  header: HeaderConfig,
  footer: FooterConfig,
  announcement: AnnouncementConfig,
} as const;

export type LayoutSlotName = keyof typeof LAYOUT_SLOT_SCHEMAS;

export function parseLayoutConfig(slot: string, raw: unknown): Record<string, unknown> {
  const schema = LAYOUT_SLOT_SCHEMAS[slot as LayoutSlotName];
  if (!schema) {
    throw new z.ZodError([
      { code: 'custom', message: `Unknown layout slot: ${slot}`, path: ['slot'], input: slot },
    ]);
  }
  return schema.parse(raw ?? {});
}

export function defaultLayoutConfig(slot: LayoutSlotName): Record<string, unknown> {
  return LAYOUT_SLOT_SCHEMAS[slot].parse({});
}
