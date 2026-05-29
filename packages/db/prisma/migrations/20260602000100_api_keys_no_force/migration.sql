-- Same justification as 20260527162200_auth_tables_no_force_rls. The MCP
-- transport verifies external API keys by looking them up by their globally-
-- unique key_prefix BEFORE the tenant is known — that lookup needs to run
-- without an `app.tenant_id` GUC set. FORCE RLS would block sparx_owner from
-- doing that lookup at all.
--
-- The tenant_isolation policy stays in place so sparx_app — the role used by
-- request handlers — is still subject to row-level filtering when listing or
-- revoking keys from the dashboard. The verify path runs as sparx_owner (the
-- @sparx/auth connection) and bypasses non-forced RLS.

ALTER TABLE "api_keys" NO FORCE ROW LEVEL SECURITY;
