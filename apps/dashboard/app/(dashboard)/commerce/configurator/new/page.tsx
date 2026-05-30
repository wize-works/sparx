import Link from 'next/link';
import { ArrowLeft, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../../components/module-stub';

import { NewTemplateForm, type ProductOption } from './_components/new-template-form';

export const dynamic = 'force-dynamic';

export default async function NewConfiguratorTemplatePage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to create configurators."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const products = await loadProducts(ctx);

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/configurator"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to configurator
          </Link>
          <Heading level={1}>New configurator template</Heading>
          <Text variant="muted">
            Bind a template to a configurable product. Start with a single option to learn the
            grammar, then add rules + add-ons from the detail page.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Template basics</Heading>
              <CardDescription>
                The starter payload below is a minimal valid template. Edit it as JSON, save, then
                expand from the detail editor.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <NewTemplateForm products={products} />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

async function loadProducts(ctx: { tenantId: string; userId: string }): Promise<ProductOption[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.product.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      take: 500,
      select: { id: true, title: true, handle: true, status: true },
    });
    return rows.map((p) => ({ id: p.id, title: p.title, handle: p.handle, status: p.status }));
  });
}
