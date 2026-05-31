-- Drop StorefrontTheme's IDENTITY columns (docs/30 §6).
--
-- Brand identity — primary/accent colour, typography, logo, favicon — is now the
-- tenant-level source of truth in `tenant_brands`. The storefront reads it live
-- and overlays it at render (1D-4): the public tenants endpoint sources logo/
-- favicon/identity colours from brand, the publish write-through no longer
-- projects identity tokens here, and the dashboard editors moved identity to the
-- Brand panel (1D-4b). These columns are therefore dead reads/writes.
--
-- StorefrontTheme keeps only PRESENTATION tokens (color_background, color_muted,
-- radius_base), which remain theme/merchant-owned.
--
-- Ordering: runs AFTER 20260610000000_tenant_brand, whose backfill reads these
-- columns to seed `tenant_brands` — so the consolidation has already happened by
-- the time they're dropped. Deploy ordering: the readers/writers were removed in
-- the same release (1D-5b), so no deployed image references them once this
-- applies.

ALTER TABLE "commerce_storefront_themes"
  DROP COLUMN IF EXISTS "color_primary",
  DROP COLUMN IF EXISTS "color_primary_foreground",
  DROP COLUMN IF EXISTS "color_accent",
  DROP COLUMN IF EXISTS "font_heading",
  DROP COLUMN IF EXISTS "font_body",
  DROP COLUMN IF EXISTS "logo_media_id",
  DROP COLUMN IF EXISTS "logo_dark_media_id",
  DROP COLUMN IF EXISTS "favicon_media_id";
