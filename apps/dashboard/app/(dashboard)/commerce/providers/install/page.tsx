import { notFound, redirect } from 'next/navigation';

import type { ProviderKind, ProviderMetadata } from '@sparx/commerce-schemas';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  PageHeader,
  Stack,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';
import { ensureProvidersRegistered } from '../../../../../lib/providers-bootstrap';

import { InstallProviderForm } from './_components/install-provider-form';

export const dynamic = 'force-dynamic';

const KIND_VALUES = new Set([
  'payment',
  'tax',
  'shipping',
  'subscription_billing',
  'dropship',
  'identity',
]);

export default async function InstallProviderPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; kind?: string }>;
}) {
  ensureProvidersRegistered();

  const { slug, kind } = await searchParams;
  if (!slug || !kind) redirect('/commerce/providers');
  if (!KIND_VALUES.has(kind)) redirect('/commerce/providers');

  let metadata: ProviderMetadata | null;
  try {
    metadata = await api.get<ProviderMetadata | null>(
      `/v1/commerce/providers/metadata/${encodeURIComponent(slug)}`
    );
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }
  if (!metadata) notFound();
  if (!metadata.kinds.includes(kind as ProviderKind)) redirect('/commerce/providers');

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title={`Install ${metadata.displayName}`}
          badge={
            <>
              <Badge variant="outline">{kind}</Badge>
              {metadata.sandboxAvailable && (
                <Badge variant="outline" className="text-xs">
                  sandbox available
                </Badge>
              )}
            </>
          }
          description={metadata.description}
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Configuration</Heading>
              <CardDescription>
                Secret values (API keys, signing secrets) should reference Google Secret Manager
                paths — never paste the literal secret here.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <InstallProviderForm
              providerSlug={metadata.slug}
              kind={kind as ProviderKind}
              displayName={metadata.displayName}
              configSchemaJson={metadata.configSchemaJson}
              sandboxAvailable={metadata.sandboxAvailable}
              webhookPathTemplate={metadata.webhookPathTemplate}
            />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
