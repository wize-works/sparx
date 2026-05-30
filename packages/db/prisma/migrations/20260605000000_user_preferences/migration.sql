-- Per-user preferences bag.
--
-- A single JSONB column keeps the schema flat for what's currently a
-- handful of small per-user knobs (default detail view). When a preference
-- proves stable + queried-on we promote it to a real column. Tenant-wide
-- settings still live on `tenants.settings`; device-scoped values still
-- live in `localStorage`.

ALTER TABLE "users"
    ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';
