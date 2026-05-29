-- crm_activities partition rollover helper.
--
-- ensureCrmActivitiesPartitions() (packages/crm/src/schedulers/partition-
-- rollover.ts) runs as sparx_app, which cannot CREATE TABLE in the public
-- schema. We expose a SECURITY DEFINER function so the cron tick can
-- create next month's partition without granting sparx_app schema-wide
-- DDL — same pattern as find_due_scheduled_entries (20260601100000) and
-- find_pending_webhook_deliveries (20260601100100).
--
-- The function is idempotent: CREATE TABLE IF NOT EXISTS is a no-op when
-- the partition already exists, so a daily tick that runs twice in one
-- day is fine. Returns the table name for logging.

CREATE OR REPLACE FUNCTION ensure_crm_activities_partition(p_from date, p_to date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table_name text;
BEGIN
  v_table_name := format('crm_activities_%s', to_char(p_from, 'YYYY_MM'));
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF crm_activities FOR VALUES FROM (%L) TO (%L)',
    v_table_name, p_from, p_to
  );
  RETURN v_table_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION ensure_crm_activities_partition(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_crm_activities_partition(date, date) TO sparx_app;

COMMENT ON FUNCTION ensure_crm_activities_partition IS
  'Idempotently creates a crm_activities monthly partition for [p_from, p_to). Runs as SECURITY DEFINER (sparx_owner) so the scheduled cron tick can issue DDL without sparx_app having schema-wide CREATE.';
