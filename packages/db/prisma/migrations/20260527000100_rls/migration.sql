-- Row Level Security policies — docs/05-data-model.md §4, docs/16-auth-security.md §4.
--
-- Strategy:
--   1. Tenant-scoped tables: ENABLE + FORCE RLS, policy filters on
--      current_setting('app.tenant_id'). FORCE means even table owners
--      (e.g. sparx_owner) cannot bypass — closing the BYPASSRLS hole
--      called out as Decision F3.
--   2. Global tables (tenants itself, verifications): no RLS.
--      - tenants is the dispatch table; an API request needs to read it
--        BEFORE it knows which tenant id to set.
--      - verifications are keyed by email/identifier, not tenant_id, and
--        are short-lived single-use tokens (magic links, password reset).
--   3. User-scoped auth tables (sessions, accounts): RLS keyed on user_id,
--      which the auth middleware sets via `app.user_id`. These are not
--      tenant-scoped because a Better Auth user can belong to multiple
--      organizations in principle; in Sparx today the constraint is
--      enforced by `users.tenant_id`.
--
-- Postgres accepts unregistered custom GUCs as long as they have a dotted
-- prefix (e.g. `app.tenant_id`); reading via current_setting('…', true)
-- returns NULL instead of erroring when unset, so no pre-registration is
-- required.

-- Helper: cast the current tenant GUC to UUID, returning NULL if unset.
-- Policies use `tenant_id = current_tenant_id()` so an unset GUC means
-- "no rows visible" rather than a cast error.

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.tenant_id', true), '')::UUID;
EXCEPTION
    WHEN invalid_text_representation THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.user_id', true), '')::UUID;
EXCEPTION
    WHEN invalid_text_representation THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- users --------------------------------------------------------------------

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON "users"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- audit_logs ---------------------------------------------------------------

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation ON "audit_logs"
    AS PERMISSIVE FOR ALL
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- sessions -----------------------------------------------------------------
-- Keyed on user_id; auth middleware sets app.user_id once the token is
-- validated. Sessions inherit tenant scope transitively via users.tenant_id.

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY sessions_user_isolation ON "sessions"
    AS PERMISSIVE FOR ALL
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- accounts -----------------------------------------------------------------

ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;

CREATE POLICY accounts_user_isolation ON "accounts"
    AS PERMISSIVE FOR ALL
    USING (user_id = current_user_id())
    WITH CHECK (user_id = current_user_id());

-- Auth flows (login, magic link callback, signup) need to read sessions /
-- accounts / users BEFORE a user_id or tenant_id is known. Those code paths
-- run on a privileged role (`sparx_owner`) that bypasses RLS — but per
-- Decision F3 we use FORCE RLS, which blocks the owner too. The escape
-- hatch is a SECURITY DEFINER function the auth service calls; that lives
-- with the auth service, not in this migration.
