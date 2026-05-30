import Link from 'next/link';
import { PackageOpen, Settings2 } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { configuratorService } from '@sparx/commerce';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../components/module-stub';
import { EntityRowLink } from '../../_components/entity-row-link';

// Configurator — option-matrix-with-rules templates that resolve a
// storefront selection into a ResolvedConfiguration. Per-product
// templates live on the product detail page; this index lists every
// template across products for staff overview + bulk activation.

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

export default async function ConfiguratorPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Option matrices with rules + add-ons."
        description="Activate the Commerce module from Billing to manage configurators."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const templates = await configuratorService.listAllTemplates(ctx);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Settings2 className="h-5 w-5" />
            <Heading level={1}>Configurator</Heading>
            <Badge variant="module">{templates.length}</Badge>
          </Stack>
          <Text variant="muted">
            Templates drive any configurable product — play structures, beauty gift sets, custom
            auto parts, configurable dogfood crates. Each template is a set of options + rules +
            add-ons; the resolver turns a user&apos;s selections into a cart line.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>All templates</Heading>
              <CardDescription>
                Templates are scoped to a product. Edit them from the product detail page&apos;s
                Configurator tab.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <EmptyState
                icon={<Settings2 className="h-5 w-5" />}
                title="No configurators yet"
                description="Open any configurable product (e.g. a play structure or gift-set) and add a configurator template from its detail page."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Options</TableHead>
                    <TableHead>Rules</TableHead>
                    <TableHead>Add-ons</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link
                          href={`/commerce/products/${t.productId}`}
                          className="hover:text-[var(--module-active)]"
                        >
                          {t.productTitle}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/configurator/${t.id}`}
                          entityType="configurator-template"
                          entityId={t.id}
                          className="hover:text-[var(--module-active)]"
                        >
                          {t.name}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>{t.optionCount}</TableCell>
                      <TableCell>{t.ruleCount}</TableCell>
                      <TableCell>{t.addOnCount}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[t.status] ?? 'outline'}>{t.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
