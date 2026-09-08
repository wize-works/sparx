import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasCapability, requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import { Input, Label, NativeSelect } from '@wizeworks/silicaui-react';
import { Button, Card, Heading, Stack, Text } from '@wizeworks/ui';
import {
  OperatorApiError,
  type OperatorEmailLogResult,
  type OperatorSearchIndexStatus,
  type OperatorTenantDetail,
} from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';
import { SearchIndexCard } from './_components/search-index-card';
import { EmailLogTable } from './_components/email-log-table';

const EMAIL_EVENT_TYPES = [
  'accepted',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'unsubscribed',
  'failed',
];

export default async function TenantSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recipient?: string; type?: string; messageId?: string }>;
}) {
  const operator = await requireCapability('support:read');
  const canAct = hasCapability(operator, 'support:act');
  const { id } = await params;
  const sp = await searchParams;
  const recipient = (sp.recipient ?? '').trim();
  const type = (sp.type ?? '').trim();
  const messageId = (sp.messageId ?? '').trim();

  try {
    await logOperatorAction({
      operatorId: operator.id,
      operatorEmail: operator.email,
      capability: 'support:read',
      action: 'tenant.support.view',
      targetTenantId: id,
    });
  } catch {
    // best-effort audit
  }

  let tenant: OperatorTenantDetail | null = null;
  let error: string | null = null;
  try {
    tenant = await operatorApi().getTenant(id, operator.id);
  } catch (err) {
    if (err instanceof OperatorApiError && err.status === 404) notFound();
    error = err instanceof OperatorApiError ? err.message : 'Could not reach api-rest.';
  }

  const backLink = (
    <Link href={`/sparx/tenants/${id}`} className="text-base-content text-sm hover:underline">
      ← Back to tenant
    </Link>
  );

  if (!tenant) {
    return (
      <Stack gap={6}>
        {backLink}
        <Card>
          <Text variant="muted">{error ?? 'Tenant unavailable.'}</Text>
        </Card>
      </Stack>
    );
  }

  const [index, log] = await Promise.all([
    operatorApi()
      .getSearchIndex(id, operator.id)
      .catch((): OperatorSearchIndexStatus => ({
        tenantId: id,
        collections: [],
        unavailable: true,
      })),
    operatorApi()
      .getEmailLog(
        id,
        {
          recipient: recipient || undefined,
          type: type || undefined,
          messageId: messageId || undefined,
        },
        operator.id
      )
      .catch((): OperatorEmailLogResult => ({ events: [] })),
  ]);

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        {backLink}
        <Heading level={1}>{tenant.name} · Support</Heading>
        <Text variant="muted">
          Search-index health and the email delivery log for this tenant. Cross-tenant order and
          customer lookup lives in{' '}
          <Link href="/sparx/support" className="text-module hover:underline">
            Support
          </Link>
          .
        </Text>
      </Stack>

      <SearchIndexCard tenantId={id} index={index} canAct={canAct} />

      <Card>
        <Stack gap={4}>
          <Heading level={3}>Email delivery log</Heading>
          <form method="get" className="grid gap-3 sm:grid-cols-4">
            <Stack gap={1} className="sm:col-span-2">
              <Label htmlFor="recipient">Recipient</Label>
              <Input
                id="recipient"
                name="recipient"
                defaultValue={recipient}
                placeholder="name@example.com"
              />
            </Stack>
            <Stack gap={1}>
              <Label htmlFor="type">Event</Label>
              <NativeSelect id="type" name="type" defaultValue={type}>
                <option value="">All events</option>
                {EMAIL_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </Stack>
            <Stack gap={1} className="flex sm:items-end">
              <Button type="submit" variant="soft">
                Filter
              </Button>
            </Stack>
            {messageId ? <input type="hidden" name="messageId" value={messageId} /> : null}
          </form>

          {log.events.length === 0 ? (
            <Text variant="muted">
              {recipient || type || messageId
                ? 'No email events match those filters.'
                : 'No email events recorded for this tenant yet.'}
            </Text>
          ) : (
            <EmailLogTable events={log.events} />
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
