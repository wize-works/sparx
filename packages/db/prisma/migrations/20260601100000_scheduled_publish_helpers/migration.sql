-- Scheduled-publish helpers.
--
-- The scheduled-publish tick in services/api-rest runs as `sparx_app`, which
-- is FORCE RLS-bound. To find entries that have passed their `scheduled_at`
-- across ALL tenants without granting the app role wholesale RLS bypass, we
-- expose a SECURITY DEFINER function. The function is OWNED BY sparx_owner
-- (the migration role) and EXECUTEs under that role at call time, so the
-- SELECT inside it bypasses RLS — but only the column subset declared in
-- the RETURNS clause makes it back to the caller.
--
-- `pg_try_advisory_lock` / `pg_advisory_unlock` are PgPL-builtins available
-- to every role; no grants needed for those.

CREATE OR REPLACE FUNCTION find_due_scheduled_entries(p_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  type_key varchar(63),
  slug varchar(255),
  scheduled_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT id, tenant_id, type_key, slug, scheduled_at
  FROM content_entries
  WHERE status = 'scheduled'
    AND scheduled_at IS NOT NULL
    AND scheduled_at <= NOW()
    AND deleted_at IS NULL
  ORDER BY scheduled_at ASC
  LIMIT p_limit;
$$;

-- Revoke from PUBLIC so only explicitly-granted roles can call it.
REVOKE EXECUTE ON FUNCTION find_due_scheduled_entries(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_due_scheduled_entries(int) TO sparx_app;

COMMENT ON FUNCTION find_due_scheduled_entries IS
  'Returns up to p_limit content entries with status=scheduled whose scheduled_at <= NOW(). Runs as SECURITY DEFINER (sparx_owner) so the tick can scan across tenants without sparx_app having RLS bypass.';
