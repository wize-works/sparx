-- Unified content model — docs/12 §3, plan Phase 1.1.
--
-- Adds the polymorphic CMS schema that supersedes the standalone `pages`
-- table: ContentType / ContentEntry / ContentRevision / ContentReference +
-- supporting taxonomies, authors, redirects, navigation menus, preview
-- tokens, webhooks, and media-asset stubs (pipeline lands in Phase 3).
--
-- `pages` itself is intentionally LEFT IN PLACE here. A follow-up migration
-- copies its rows into `content_entries` (as type_key = 'page'), the
-- dashboard cuts over to the new API, and only then does pages get dropped.
-- This buys a rollback window per plan §1.1 step 4.
--
-- Convention: every tenant-scoped table gets ENABLE + FORCE ROW LEVEL
-- SECURITY plus a `{table}_tenant_isolation` policy keyed on
-- `current_tenant_id()` (defined in 20260527000100_rls). The `content_types`
-- table is the lone exception — its policy also exposes rows owned by the
-- sentinel Sparx Platform tenant so every merchant can read the built-ins.

-- ─────────────────────────────────────────────────────────────────────────
-- Sentinel platform tenant (owns built-in content types)
-- ─────────────────────────────────────────────────────────────────────────
-- `tenants` has no RLS, so this insert runs without a tenant context. The
-- well-known UUID is referenced in every fallback lookup and in the
-- content_types RLS policy below. ON CONFLICT DO NOTHING keeps it
-- idempotent for `prisma migrate reset` and for environments where a
-- previous attempt partially succeeded.

INSERT INTO "tenants" ("id", "slug", "name", "email", "plan", "status", "settings")
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'sparx-platform',
    'Sparx Platform',
    'platform@sparx.works',
    'platform',
    'system',
    '{}'::jsonb
)
ON CONFLICT ("id") DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- content_types
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "content_types" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID         NOT NULL,
    "key"          VARCHAR(63)  NOT NULL,
    "name"         VARCHAR(120) NOT NULL,
    "plural_name"  VARCHAR(120) NOT NULL,
    "description"  TEXT,
    "schema_json"  JSONB        NOT NULL,
    "url_pattern"  VARCHAR(255),
    "icon"         VARCHAR(64),
    "is_singleton" BOOLEAN      NOT NULL DEFAULT FALSE,
    "is_built_in"  BOOLEAN      NOT NULL DEFAULT FALSE,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "content_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_types_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "content_types_tenant_id_key_key" ON "content_types" ("tenant_id", "key");
CREATE INDEX "content_types_tenant_id_idx" ON "content_types" ("tenant_id");

CREATE TRIGGER content_types_set_updated_at
    BEFORE UPDATE ON "content_types"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- media_assets (stubs for Phase 3)
-- ─────────────────────────────────────────────────────────────────────────
-- Created before authors / content_references because both reference it.

CREATE TABLE "media_assets" (
    "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID          NOT NULL,
    "key"               VARCHAR(1024) NOT NULL,
    "original_filename" VARCHAR(512)  NOT NULL,
    "mime_type"         VARCHAR(127)  NOT NULL,
    "byte_size"         BIGINT        NOT NULL,
    "width"             INTEGER,
    "height"            INTEGER,
    "duration_sec"      DOUBLE PRECISION,
    "dominant_color"    VARCHAR(9),
    "blurhash"          VARCHAR(128),
    "focal_point_x"     DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "focal_point_y"     DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "alt_text"          VARCHAR(500),
    "caption"           TEXT,
    "status"            VARCHAR(20)   NOT NULL DEFAULT 'uploading',
    "processing_error"  TEXT,
    "usage_count"       INTEGER       NOT NULL DEFAULT 0,
    "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "deleted_at"        TIMESTAMPTZ,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "media_assets_focal_point_x_range" CHECK ("focal_point_x" BETWEEN 0 AND 1),
    CONSTRAINT "media_assets_focal_point_y_range" CHECK ("focal_point_y" BETWEEN 0 AND 1),
    CONSTRAINT "media_assets_status_check"
        CHECK ("status" IN ('uploading', 'ready', 'failed'))
);

CREATE INDEX "media_assets_tenant_id_status_idx"     ON "media_assets" ("tenant_id", "status");
CREATE INDEX "media_assets_tenant_id_updated_at_idx" ON "media_assets" ("tenant_id", "updated_at" DESC);

CREATE TRIGGER media_assets_set_updated_at
    BEFORE UPDATE ON "media_assets"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- media_variants
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "media_variants" (
    "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID          NOT NULL,
    "asset_id"   UUID          NOT NULL,
    "format"     VARCHAR(20)   NOT NULL,
    "width"      INTEGER       NOT NULL,
    "height"     INTEGER       NOT NULL,
    "byte_size"  BIGINT        NOT NULL,
    "key"        VARCHAR(1024) NOT NULL,
    "created_at" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "media_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "media_variants_asset_id_fkey" FOREIGN KEY ("asset_id")
        REFERENCES "media_assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "media_variants_asset_id_format_width_key"
    ON "media_variants" ("asset_id", "format", "width");
CREATE INDEX "media_variants_tenant_id_asset_id_idx"
    ON "media_variants" ("tenant_id", "asset_id");

-- ─────────────────────────────────────────────────────────────────────────
-- authors
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "authors" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL,
    "user_id"         UUID,
    "slug"            VARCHAR(255) NOT NULL,
    "display_name"    VARCHAR(255) NOT NULL,
    "bio"             TEXT,
    "avatar_asset_id" UUID,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "authors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "authors_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "authors_avatar_asset_id_fkey" FOREIGN KEY ("avatar_asset_id")
        REFERENCES "media_assets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "authors_tenant_id_slug_key" ON "authors" ("tenant_id", "slug");
CREATE INDEX "authors_tenant_id_idx" ON "authors" ("tenant_id");

CREATE TRIGGER authors_set_updated_at
    BEFORE UPDATE ON "authors"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- content_entries
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "content_entries" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL,
    "type_key"        VARCHAR(63)  NOT NULL,
    "slug"            VARCHAR(255),
    "status"          VARCHAR(20)  NOT NULL DEFAULT 'draft',
    "body"            JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "seo_json"        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "published_at"    TIMESTAMPTZ,
    "scheduled_at"    TIMESTAMPTZ,
    "archived_at"     TIMESTAMPTZ,
    "author_id"       UUID,
    "locale_code"     VARCHAR(10),
    "parent_entry_id" UUID,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "deleted_at"      TIMESTAMPTZ,
    CONSTRAINT "content_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_entries_author_id_fkey" FOREIGN KEY ("author_id")
        REFERENCES "authors" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_entries_parent_entry_id_fkey" FOREIGN KEY ("parent_entry_id")
        REFERENCES "content_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "content_entries_status_check"
        CHECK ("status" IN ('draft', 'scheduled', 'published', 'archived'))
);

-- (tenant_id, type_key, slug) is unique, but slug is nullable — Postgres
-- treats NULLs as distinct in UNIQUE indexes by default, which is exactly
-- what we want here: many feature/faq_item entries can have NULL slug, but
-- two routable `page` entries cannot share the same slug.
CREATE UNIQUE INDEX "content_entries_tenant_type_slug_key"
    ON "content_entries" ("tenant_id", "type_key", "slug");
CREATE INDEX "content_entries_tenant_type_status_idx"
    ON "content_entries" ("tenant_id", "type_key", "status");
CREATE INDEX "content_entries_tenant_status_published_at_idx"
    ON "content_entries" ("tenant_id", "status", "published_at" DESC);
CREATE INDEX "content_entries_tenant_updated_at_idx"
    ON "content_entries" ("tenant_id", "updated_at" DESC);
CREATE INDEX "content_entries_tenant_scheduled_at_idx"
    ON "content_entries" ("tenant_id", "scheduled_at")
    WHERE "scheduled_at" IS NOT NULL;

CREATE TRIGGER content_entries_set_updated_at
    BEFORE UPDATE ON "content_entries"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- content_revisions
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "content_revisions" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL,
    "entry_id"        UUID         NOT NULL,
    "revision_number" INTEGER      NOT NULL,
    "kind"            VARCHAR(20)  NOT NULL,
    "body"            JSONB        NOT NULL,
    "seo_json"        JSONB        NOT NULL,
    "status"          VARCHAR(20)  NOT NULL,
    "author_id"       UUID,
    "summary"         VARCHAR(500),
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_revisions_entry_id_fkey" FOREIGN KEY ("entry_id")
        REFERENCES "content_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_revisions_kind_check"
        CHECK ("kind" IN ('autosave', 'manual'))
);

CREATE UNIQUE INDEX "content_revisions_entry_id_revision_number_key"
    ON "content_revisions" ("entry_id", "revision_number");
CREATE INDEX "content_revisions_tenant_entry_created_idx"
    ON "content_revisions" ("tenant_id", "entry_id", "created_at" DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- content_references
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "content_references" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID         NOT NULL,
    "from_entry_id" UUID         NOT NULL,
    "to_entry_id"   UUID,
    "to_asset_id"   UUID,
    "field"         VARCHAR(255) NOT NULL,
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "content_references_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_references_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_references_from_entry_id_fkey" FOREIGN KEY ("from_entry_id")
        REFERENCES "content_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_references_to_entry_id_fkey" FOREIGN KEY ("to_entry_id")
        REFERENCES "content_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_references_to_asset_id_fkey" FOREIGN KEY ("to_asset_id")
        REFERENCES "media_assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Exactly one of (to_entry_id, to_asset_id) must be set.
    CONSTRAINT "content_references_target_xor"
        CHECK ((("to_entry_id" IS NOT NULL)::int + ("to_asset_id" IS NOT NULL)::int) = 1)
);

CREATE INDEX "content_references_tenant_from_idx"
    ON "content_references" ("tenant_id", "from_entry_id");
CREATE INDEX "content_references_tenant_to_entry_idx"
    ON "content_references" ("tenant_id", "to_entry_id");
CREATE INDEX "content_references_tenant_to_asset_idx"
    ON "content_references" ("tenant_id", "to_asset_id");

-- ─────────────────────────────────────────────────────────────────────────
-- taxonomies + terms
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "taxonomies" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID         NOT NULL,
    "key"          VARCHAR(63)  NOT NULL,
    "name"         VARCHAR(120) NOT NULL,
    "plural_name"  VARCHAR(120) NOT NULL,
    "hierarchical" BOOLEAN      NOT NULL DEFAULT FALSE,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "taxonomies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "taxonomies_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "taxonomies_tenant_id_key_key" ON "taxonomies" ("tenant_id", "key");

CREATE TRIGGER taxonomies_set_updated_at
    BEFORE UPDATE ON "taxonomies"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE "taxonomy_terms" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID         NOT NULL,
    "taxonomy_id"    UUID         NOT NULL,
    "parent_term_id" UUID,
    "slug"           VARCHAR(255) NOT NULL,
    "name"           VARCHAR(255) NOT NULL,
    "description"    TEXT,
    "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "taxonomy_terms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "taxonomy_terms_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "taxonomy_terms_taxonomy_id_fkey" FOREIGN KEY ("taxonomy_id")
        REFERENCES "taxonomies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "taxonomy_terms_parent_term_id_fkey" FOREIGN KEY ("parent_term_id")
        REFERENCES "taxonomy_terms" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "taxonomy_terms_taxonomy_id_slug_key"
    ON "taxonomy_terms" ("taxonomy_id", "slug");
CREATE INDEX "taxonomy_terms_tenant_taxonomy_idx"
    ON "taxonomy_terms" ("tenant_id", "taxonomy_id");

CREATE TRIGGER taxonomy_terms_set_updated_at
    BEFORE UPDATE ON "taxonomy_terms"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE "entry_taxonomy_terms" (
    "entry_id"   UUID        NOT NULL,
    "term_id"    UUID        NOT NULL,
    "tenant_id"  UUID        NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "entry_taxonomy_terms_pkey" PRIMARY KEY ("entry_id", "term_id"),
    CONSTRAINT "entry_taxonomy_terms_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entry_taxonomy_terms_entry_id_fkey" FOREIGN KEY ("entry_id")
        REFERENCES "content_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entry_taxonomy_terms_term_id_fkey" FOREIGN KEY ("term_id")
        REFERENCES "taxonomy_terms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "entry_taxonomy_terms_tenant_term_idx"
    ON "entry_taxonomy_terms" ("tenant_id", "term_id");

-- ─────────────────────────────────────────────────────────────────────────
-- redirects
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "redirects" (
    "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID          NOT NULL,
    "from_path"   VARCHAR(2048) NOT NULL,
    "to_path"     VARCHAR(2048) NOT NULL,
    "status_code" INTEGER       NOT NULL DEFAULT 301,
    "hit_count"   BIGINT        NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMPTZ,
    "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "redirects_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "redirects_status_code_check"
        CHECK ("status_code" IN (301, 302, 307, 308))
);

CREATE UNIQUE INDEX "redirects_tenant_id_from_path_key"
    ON "redirects" ("tenant_id", "from_path");
CREATE INDEX "redirects_tenant_id_idx" ON "redirects" ("tenant_id");

CREATE TRIGGER redirects_set_updated_at
    BEFORE UPDATE ON "redirects"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- navigation menus + items
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "navigation_menus" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID         NOT NULL,
    "location"   VARCHAR(63)  NOT NULL,
    "name"       VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "navigation_menus_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "navigation_menus_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "navigation_menus_tenant_id_location_key"
    ON "navigation_menus" ("tenant_id", "location");

CREATE TRIGGER navigation_menus_set_updated_at
    BEFORE UPDATE ON "navigation_menus"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE "navigation_items" (
    "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID          NOT NULL,
    "menu_id"         UUID          NOT NULL,
    "parent_item_id"  UUID,
    "position"        INTEGER       NOT NULL,
    "label"           VARCHAR(255)  NOT NULL,
    "entry_id"        UUID,
    "external_url"    VARCHAR(2048),
    "open_in_new_tab" BOOLEAN       NOT NULL DEFAULT FALSE,
    "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "navigation_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "navigation_items_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "navigation_items_menu_id_fkey" FOREIGN KEY ("menu_id")
        REFERENCES "navigation_menus" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "navigation_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id")
        REFERENCES "navigation_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "navigation_items_entry_id_fkey" FOREIGN KEY ("entry_id")
        REFERENCES "content_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    -- Exactly one of (entry_id, external_url) is set.
    CONSTRAINT "navigation_items_target_xor"
        CHECK ((("entry_id" IS NOT NULL)::int + ("external_url" IS NOT NULL)::int) = 1)
);

CREATE INDEX "navigation_items_menu_id_position_idx"
    ON "navigation_items" ("menu_id", "position");
CREATE INDEX "navigation_items_tenant_id_idx"
    ON "navigation_items" ("tenant_id");

CREATE TRIGGER navigation_items_set_updated_at
    BEFORE UPDATE ON "navigation_items"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- preview_tokens
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "preview_tokens" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID        NOT NULL,
    "entry_id"     UUID        NOT NULL,
    "issued_by_id" UUID,
    "jti"          UUID        NOT NULL,
    "expires_at"   TIMESTAMPTZ NOT NULL,
    "revoked_at"   TIMESTAMPTZ,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "preview_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "preview_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "preview_tokens_entry_id_fkey" FOREIGN KEY ("entry_id")
        REFERENCES "content_entries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "preview_tokens_jti_key"             ON "preview_tokens" ("jti");
CREATE INDEX        "preview_tokens_tenant_entry_idx"    ON "preview_tokens" ("tenant_id", "entry_id");
CREATE INDEX        "preview_tokens_expires_at_idx"      ON "preview_tokens" ("expires_at");

-- ─────────────────────────────────────────────────────────────────────────
-- webhook subscriptions + deliveries
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE "webhook_subscriptions" (
    "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID          NOT NULL,
    "name"           VARCHAR(120)  NOT NULL,
    "url"            VARCHAR(2048) NOT NULL,
    "events"         VARCHAR(120)[] NOT NULL DEFAULT '{}',
    "signing_secret" TEXT          NOT NULL,
    "active"         BOOLEAN       NOT NULL DEFAULT TRUE,
    "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "webhook_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "webhook_subscriptions_tenant_active_idx"
    ON "webhook_subscriptions" ("tenant_id", "active");

CREATE TRIGGER webhook_subscriptions_set_updated_at
    BEFORE UPDATE ON "webhook_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE "webhook_deliveries" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL,
    "subscription_id" UUID         NOT NULL,
    "event_type"      VARCHAR(120) NOT NULL,
    "payload"         JSONB        NOT NULL,
    "attempt_count"   INTEGER      NOT NULL DEFAULT 0,
    "status"          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    "response_status" INTEGER,
    "response_body"   TEXT,
    "next_attempt_at" TIMESTAMPTZ,
    "delivered_at"    TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "webhook_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id")
        REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "webhook_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id")
        REFERENCES "webhook_subscriptions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "webhook_deliveries_status_check"
        CHECK ("status" IN ('pending', 'delivered', 'failed'))
);

CREATE INDEX "webhook_deliveries_tenant_status_next_attempt_idx"
    ON "webhook_deliveries" ("tenant_id", "status", "next_attempt_at");
CREATE INDEX "webhook_deliveries_subscription_created_idx"
    ON "webhook_deliveries" ("subscription_id", "created_at" DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────
-- Same FORCE + tenant_isolation pattern as users / audit_logs / pages
-- (20260527000100_rls). `content_types` carries an extra OR clause that
-- exposes platform-owned built-in rows to every tenant read; writes are
-- still pinned to the caller's tenant via WITH CHECK.

ALTER TABLE "content_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_types_tenant_isolation ON "content_types"
    AS PERMISSIVE FOR ALL
    USING (
        tenant_id = current_tenant_id()
        OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
    )
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "content_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_entries_tenant_isolation ON "content_entries"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "content_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_revisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_revisions_tenant_isolation ON "content_revisions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "content_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_references" FORCE ROW LEVEL SECURITY;
CREATE POLICY content_references_tenant_isolation ON "content_references"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "taxonomies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "taxonomies" FORCE ROW LEVEL SECURITY;
CREATE POLICY taxonomies_tenant_isolation ON "taxonomies"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "taxonomy_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "taxonomy_terms" FORCE ROW LEVEL SECURITY;
CREATE POLICY taxonomy_terms_tenant_isolation ON "taxonomy_terms"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "entry_taxonomy_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entry_taxonomy_terms" FORCE ROW LEVEL SECURITY;
CREATE POLICY entry_taxonomy_terms_tenant_isolation ON "entry_taxonomy_terms"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "authors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "authors" FORCE ROW LEVEL SECURITY;
CREATE POLICY authors_tenant_isolation ON "authors"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "redirects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "redirects" FORCE ROW LEVEL SECURITY;
CREATE POLICY redirects_tenant_isolation ON "redirects"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "navigation_menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "navigation_menus" FORCE ROW LEVEL SECURITY;
CREATE POLICY navigation_menus_tenant_isolation ON "navigation_menus"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "navigation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "navigation_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY navigation_items_tenant_isolation ON "navigation_items"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "preview_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preview_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY preview_tokens_tenant_isolation ON "preview_tokens"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "webhook_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_subscriptions_tenant_isolation ON "webhook_subscriptions"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant_isolation ON "webhook_deliveries"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;
CREATE POLICY media_assets_tenant_isolation ON "media_assets"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

ALTER TABLE "media_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_variants" FORCE ROW LEVEL SECURITY;
CREATE POLICY media_variants_tenant_isolation ON "media_variants"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
