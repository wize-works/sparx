import { notFound } from 'next/navigation';
import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
import { Container, Heading, Stack, Text } from '@sparx/ui';
import { GeneralForm } from './general-form';

// First real database-backed dashboard page. Reads the merchant's tenant row
// through withTenant() so the same connection that the rest of the app uses
// for tenant-scoped queries goes through here. The tenants table itself has
// no RLS (it's the dispatch table), but the WHERE id = session.tenantId means
// even a misconfigured RLS policy could not leak other tenants.
export default async function GeneralSettingsPage() {
  const { user } = await requireSession();

  const tenant = await withTenant({ tenantId: user.tenantId }, (tx) =>
    tx.tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true, email: true, slug: true, plan: true },
    })
  );

  if (!tenant) {
    notFound();
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Heading level={1}>General settings</Heading>
          <Text variant="muted">Update how your merchant account presents itself.</Text>
        </Stack>
        <GeneralForm tenant={tenant} />
      </Stack>
    </Container>
  );
}
