-- Tenant brand — add the Token Model v2 brand token document (docs/33).
--
-- `tokens` is a nullable JSONB holding the brand-owned NON-IDENTITY tokens the
-- Site Builder Brand pane edits: shape (radius trio + border width), rhythm
-- (space base + control sizes), and effect (depth). Colour and typography keep
-- their dedicated columns — one source of truth per axis — so this stores only
-- the shape/rhythm/effect branches of a BrandTokenDoc.
--
-- ADDITIVE + non-destructive: a new nullable column on an already-RLS table
-- (tenant_brands is ENABLE+FORCE RLS with tenant_isolation from
-- 20260610000000_tenant_brand), so no policy change is needed. NULL = no
-- overrides → the storefront theme preset's defaults apply. Existing rows are
-- untouched.
--
-- Deploy ordering: the readers (storefront-themes compileThemeForTenant widen,
-- publish-service brand select, /v1/brand) ship in the same release; an older
-- image simply never reads the column. Safe to apply before or after the deploy.

ALTER TABLE "tenant_brands" ADD COLUMN "tokens" JSONB;
