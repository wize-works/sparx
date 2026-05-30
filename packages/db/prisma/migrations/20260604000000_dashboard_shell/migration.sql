-- Dashboard shell — per-user, per-tenant pinned navigation state.
--
-- Favorites store the user's pinned manifest actions (e.g.
-- "commerce.product.create", "/cms/types"). Recents are updated on
-- navigation and read in reverse-chronological order, capped at 20 by
-- the query.
--
-- Both tables key on (user_id, tenant_id) — see docs/24-dashboard-shell.md
-- §8 for the rationale (Better Auth's organization plugin will later
-- introduce a `tenant_memberships` row that subsumes this composite key).
--
-- RLS: tenant-isolated via current_tenant_id(). Both tables get ENABLE +
-- FORCE per the standard pattern (memory/feedback_sparx_db_rls_pattern.md).

CREATE TABLE "user_favorites" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID         NOT NULL,
    "tenant_id"  UUID         NOT NULL,
    "action_id"  VARCHAR(120) NOT NULL,
    "position"   INTEGER      NOT NULL,
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_favorites_user_tenant_action_key"
    ON "user_favorites" ("user_id", "tenant_id", "action_id");
CREATE INDEX "user_favorites_user_tenant_position_idx"
    ON "user_favorites" ("user_id", "tenant_id", "position");

ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_favorites" FORCE  ROW LEVEL SECURITY;
CREATE POLICY user_favorites_tenant_isolation ON "user_favorites"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());


CREATE TABLE "user_recents" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         UUID         NOT NULL,
    "tenant_id"       UUID         NOT NULL,
    "action_id"       VARCHAR(120) NOT NULL,
    "last_visited_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_recents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_recents_user_tenant_action_key"
    ON "user_recents" ("user_id", "tenant_id", "action_id");
CREATE INDEX "user_recents_user_tenant_recency_idx"
    ON "user_recents" ("user_id", "tenant_id", "last_visited_at" DESC);

ALTER TABLE "user_recents" ADD CONSTRAINT "user_recents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_recents" ADD CONSTRAINT "user_recents_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_recents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_recents" FORCE  ROW LEVEL SECURITY;
CREATE POLICY user_recents_tenant_isolation ON "user_recents"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());
