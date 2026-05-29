// Next.js server-startup hook (runs once per process, both `next dev` and
// `next start`). The dashboard fires CRM events directly through Server
// Actions (apps/dashboard/app/(dashboard)/crm/*-actions.ts), so the same
// WebhookFanoutPublisher that api-rest / api-graphql / api-mcp install
// also needs to be installed here — otherwise dashboard-originated writes
// would emit `crm.*` events without enqueuing webhook deliveries.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installCrmWebhookFanout, preconnectWebhookFanout } = await import('@sparx/crm');
  installCrmWebhookFanout();
  await preconnectWebhookFanout();
}
