import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, DollarSign, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { CommerceNotFoundError, pricingService } from '@sparx/commerce';
import { withTenant } from '@sparx/db';
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

import { ModuleStub } from '../../../../../components/module-stub';

import { PriceListStatusBar } from './_components/price-list-status-bar';
import { PriceListEntriesEditor } from './_components/price-list-entries-editor';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

export default async function PriceListDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Commerce is disabled. Activate it from Billing to manage pricing."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let priceList;
  try {
    priceList = await pricingService.getPriceList(ctx, id);
  } catch (err) {
    if (err instanceof CommerceNotFoundError) notFound();
    throw err;
  }

  const [entries, variantSummaries] = await Promise.all([
    pricingService.listEntries(ctx, id),
    loadActiveVariants(ctx),
  ]);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/pricing"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to pricing
          </Link>
          <Stack direction="row" align="end" justify="between" wrap gap={4}>
            <Stack gap={2}>
              <Stack direction="row" align="center" gap={3} wrap>
                <DollarSign className="h-5 w-5" />
                <Heading level={1}>{priceList.name}</Heading>
                <Badge variant={STATUS_VARIANT[priceList.status] ?? 'outline'}>
                  {priceList.status}
                </Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  {priceList.currency}
                </Badge>
                {priceList.channel && <Badge variant="outline">{priceList.channel}</Badge>}
              </Stack>
              <Text size="sm" variant="muted">
                Priority {priceList.priority} · {entries.length} entries
              </Text>
            </Stack>
            <PriceListStatusBar priceListId={priceList.id} status={priceList.status} />
          </Stack>
        </Stack>

        {priceList.description && (
          <Card>
            <CardContent>
              <Text>{priceList.description}</Text>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Per-variant entries</Heading>
              <CardDescription>
                Pick a variant from the dropdown, then set either a fixed price or a
                percent-off-list. Quantity ranges let you ladder pricing (e.g. 1-9 at $20, 10+ at
                $18).
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <PriceListEntriesEditor
              priceListId={priceList.id}
              entries={entries}
              variants={variantSummaries}
            />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

async function loadActiveVariants(ctx: { tenantId: string; userId: string }) {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productVariant.findMany({
      where: { deletedAt: null },
      orderBy: [{ product: { title: 'asc' } }, { sku: 'asc' }],
      take: 500,
      select: {
        id: true,
        sku: true,
        title: true,
        priceCents: true,
        product: { select: { title: true } },
      },
    });
    return rows.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      basePriceCents: v.priceCents,
      productTitle: v.product.title,
    }));
  });
}
