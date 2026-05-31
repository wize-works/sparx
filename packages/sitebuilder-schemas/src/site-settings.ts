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

// Token Model v2 presentation overlay (docs/33 §3, §5) — the merchant-owned
// surfaces / neutral / status / border / container, per mode, laid over a theme
// preset by the v2 compiler. Brand identity (color/type/shape/rhythm/effect) is
// NOT here — it lives on the tenant brand. Every field is nullable+optional so a
// blank inherits the preset default; values are validated loosely (the compiler
// normalizes/keeps only what it recognizes). Mirrors PresentationOverlayV2 in
// @sparx/storefront-themes — keep the two in sync.
const PresentationColors = z
  .object({
    base100: z.string().nullish(),
    base200: z.string().nullish(),
    base300: z.string().nullish(),
    baseContent: z.string().nullish(),
    neutral: z.string().nullish(),
    neutralContent: z.string().nullish(),
    info: z.string().nullish(),
    success: z.string().nullish(),
    warning: z.string().nullish(),
    danger: z.string().nullish(),
    infoContent: z.string().nullish(),
    successContent: z.string().nullish(),
    warningContent: z.string().nullish(),
    dangerContent: z.string().nullish(),
    border: z.string().nullish(),
  })
  .partial();

export const PresentationOverlay = z.object({
  v: z.literal(2).optional(),
  containerWidth: z.string().nullish(),
  light: PresentationColors.optional(),
  dark: PresentationColors.optional(),
});
export type PresentationOverlay = z.infer<typeof PresentationOverlay>;

export const SiteSettings = z.object({
  tokens: ThemeOverlay.default({ light: {}, dark: {} }),
  customCss: z.string().max(20000).default(''),
  // Optional so existing drafts (tokens/customCss only) parse unchanged.
  presentation: PresentationOverlay.optional(),
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
