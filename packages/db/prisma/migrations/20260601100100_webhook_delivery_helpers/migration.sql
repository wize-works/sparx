-- Webhook-delivery helpers.
--
-- Cross-tenant SELECT for webhook_deliveries whose `next_attempt_at` has
-- passed (or who have never been attempted). The delivery worker tick in
-- services/api-rest/src/lib/webhook-delivery.ts iterates the result.
--
-- Like find_due_scheduled_entries (20260601100000), this runs as SECURITY
-- DEFINER under sparx_owner so sparx_app can scan across tenants without
-- gaining RLS bypass — the only column subset crossing the boundary is
-- the one declared in the RETURNS clause.

CREATE OR REPLACE FUNCTION find_pending_webhook_deliveries(p_limit int DEFAULT 100)
RETURNS TABLE(
  delivery_id uuid,
  tenant_id uuid,
  subscription_id uuid,
  event_type varchar(120),
  payload jsonb,
  attempt_count int,
  subscription_url varchar(2048),
  signing_secret text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT d.id, d.tenant_id, d.subscription_id, d.event_type, d.payload,
         d.attempt_count, s.url, s.signing_secret
  FROM webhook_deliveries d
  JOIN webhook_subscriptions s ON s.id = d.subscription_id
  WHERE d.status = 'pending'
    AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= NOW())
    AND s.active = true
  ORDER BY d.created_at ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION find_pending_webhook_deliveries(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_pending_webhook_deliveries(int) TO sparx_app;

COMMENT ON FUNCTION find_pending_webhook_deliveries IS
  'Returns up to p_limit webhook deliveries ready to attempt (status=pending and next_attempt_at <= NOW()), joined with their subscription URL + signing secret. SECURITY DEFINER.';
