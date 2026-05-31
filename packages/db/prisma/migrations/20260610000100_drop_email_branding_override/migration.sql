-- Drop EmailSettings.branding_override (docs/30 §6.2).
--
-- Brand identity (logo/colors/type) is now the tenant-level source of truth in
-- `tenant_brands`, read by resolveEmailBrand directly (1D-2). The per-module
-- email override is exactly the kind of brand redefinition §6.2 forbids, and it
-- has been an inert/unread column since 1D-2. This migration removes it.
--
-- Ordering: this runs AFTER 20260610000000_tenant_brand, whose backfill reads
-- email_settings.branding_override as a fallback source for the brand row — so
-- the consolidation has already happened by the time the column is dropped.
-- Deploy ordering: the readers/writers of this column were removed in the same
-- release (1D-5a), so no deployed image references it once this applies.

ALTER TABLE "email_settings" DROP COLUMN IF EXISTS "branding_override";
