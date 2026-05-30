import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { providerService } from '@sparx/commerce';
import type { ProviderKind } from '@sparx/commerce-schemas';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { ensureProvidersRegistered } from '../../../../../lib/providers-bootstrap';
import { ModuleStub } from '../../../../../components/module-stub';

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

  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to install providers."
        features={[]}
      />
    );
  }

  const { slug, kind } = await searchParams;
  if (!slug || !kind) redirect('/commerce/providers');
  if (!KIND_VALUES.has(kind)) redirect('/commerce/providers');

  const metadata = await providerService.getMetadata(slug);
  if (!metadata) notFound();
  if (!metadata.kinds.includes(kind as ProviderKind)) redirect('/commerce/providers');

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/providers"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to providers
          </Link>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1}>Install {metadata.displayName}</Heading>
            <Badge variant="outline">{kind}</Badge>
            {metadata.sandboxAvailable && (
              <Badge variant="outline" className="text-xs">
                sandbox available
              </Badge>
            )}
          </Stack>
          <Text variant="muted">{metadata.description}</Text>
        </Stack>

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
