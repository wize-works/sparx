import { notFound } from 'next/navigation';
import { Container, Heading, Stack, Text } from '@sparx/ui';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { GeneralForm } from './general-form';

interface TenantCard {
  id: string;
  name: string;
  email: string;
  slug: string;
  plan: string;
}

// First real database-backed dashboard page. Now reads the merchant's tenant
// through api-rest (`GET /v1/tenant`) instead of Prisma directly — the
// dashboard no longer touches the database.
export default async function GeneralSettingsPage() {
  let tenant: TenantCard;
  try {
    tenant = await api.get<TenantCard>('/v1/tenant');
  } catch (err) {
    if ((err as ApiRestError).status === 404) notFound();
    throw err;
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Heading level={1}>General settings</Heading>
          <Text variant="muted">Update how your merchant account presents itself.</Text>
        </Stack>
        <GeneralForm
          tenant={{ name: tenant.name, email: tenant.email, slug: tenant.slug, plan: tenant.plan }}
        />
      </Stack>
    </Container>
  );
}
