import { notFound } from 'next/navigation';

import type {
  ProviderInstallStatus,
  ProviderKind,
  ProviderMetadata,
} from '@sparx/commerce-schemas';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';
import { ensureProvidersRegistered } from '../../../../../lib/providers-bootstrap';

import { ProviderActionsBar } from './_components/provider-actions-bar';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

interface InstallationRow {
  id: string;
  providerSlug: string;
  kind: ProviderKind;
  environment: 'sandbox' | 'production';
  enabled: boolean;
  status: ProviderInstallStatus;
  label: string | null;
  providerAccountId: string | null;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
  errorCount: number;
  installedAt: string;
}

export async function ProviderInstallationDetailContent({ id }: Props) {
  ensureProvidersRegistered();

  let installation: InstallationRow | null;
  try {
    installation = await api.get<InstallationRow | null>(
      `/v1/commerce/providers/installations/${id}`
    );
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }
  if (!installation) notFound();

  const metadata = await api.get<ProviderMetadata | null>(
    `/v1/commerce/providers/metadata/${encodeURIComponent(installation.providerSlug)}`
  );

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={2}>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1}>{metadata?.displayName ?? installation.providerSlug}</Heading>
            <Badge variant="outline">{installation.kind}</Badge>
            <Badge color={installation.environment === 'production' ? 'success' : 'warning'}>
              {installation.environment}
            </Badge>
            <Badge color={installation.enabled ? 'success' : 'outline'}>
              {installation.enabled ? 'enabled' : 'disabled'}
            </Badge>
          </Stack>
          {installation.label && (
            <Text size="sm" variant="muted">
              {installation.label}
            </Text>
          )}
        </Stack>
        <ProviderActionsBar installationId={installation.id} enabled={installation.enabled} />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Status</Heading>
            <CardDescription>
              The platform records every successful + failed call here; persistent errors surface to
              the dashboard alerts strip.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={3}>
            <Row label="Status" value={installation.status} />
            <Row
              label="Last health check"
              value={
                installation.lastHealthCheckAt
                  ? `${installation.lastHealthStatus ?? 'unknown'} · ${new Date(
                      installation.lastHealthCheckAt
                    ).toLocaleString()}`
                  : 'never'
              }
            />
            <Row label="Error count" value={String(installation.errorCount)} />
            <Row label="Provider account id" value={installation.providerAccountId ?? '—'} />
            <Row label="Installed" value={new Date(installation.installedAt).toLocaleString()} />
          </Stack>
        </CardContent>
      </Card>

      {metadata && (
        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Webhook</Heading>
              <CardDescription>
                Paste this URL into the provider&apos;s webhook configuration so callbacks land at
                the right tenant. The path&apos;s <code>:installationId</code> token is auto-filled
                on dispatch.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <Text className="font-mono text-xs">
              {metadata.webhookPathTemplate.replace(':installationId', installation.id)}
            </Text>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" gap={4}>
      <Text size="sm" className="w-40" variant="muted">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Stack>
  );
}
