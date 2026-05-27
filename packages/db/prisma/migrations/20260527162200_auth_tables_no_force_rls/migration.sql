-- Allow the auth service to read users/sessions/accounts without an
-- app.tenant_id GUC set. Better Auth queries these tables before the
-- request has a tenant context (sign-in, session lookup, OAuth callback) —
-- FORCE RLS would lock those flows out for every role including sparx_owner.
--
-- Design: @sparx/auth connects as sparx_owner (table owner, bypasses non-
-- FORCED RLS). Business tables keep FORCE so sparx_app cannot accidentally
-- read cross-tenant data even if a callsite forgets to wrap in withTenant().
--
-- The policies stay in place so sparx_app — which cannot bypass — is still
-- subject to row-level filtering on these tables when used outside the
-- auth service.

ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "sessions" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "accounts" NO FORCE ROW LEVEL SECURITY;
