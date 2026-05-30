import { notFound } from 'next/navigation';
import { DollarSign } from 'lucide-react';

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

import { PriceListStatusBar } from './_components/price-list-status-bar';
import { PriceListEntriesEditor } from './_components/price-list-entries-editor';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

interface Props {
  id: string;
}

interface PriceListDetail {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  channel: string | null;
  customerSegmentId: string | null;
  b2bAccountId: string | null;
  collectionId: string | null;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  entryCount: number;
  updatedAt: string;
}

interface EntryRow {
  id: string;
  variantId: string;
  variantSku: string;
  productTitle: string;
  fixedPriceCents: number | null;
  percentOffList: number | null;
  minQuantity: number;
  maxQuantity: number | null;
}

interface VariantListRow {
  id: string;
  sku: string;
  title: string | null;
  priceCents: number;
  productTitle: string;
}

export async function PriceListDetailContent({ id }: Props) {
  let priceList: PriceListDetail;
  try {
    priceList = await api.get<PriceListDetail>(`/v1/commerce/price-lists/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const [entries, variantRows] = await Promise.all([
    api.get<EntryRow[]>(`/v1/commerce/price-lists/${id}/entries`),
    api.get<VariantListRow[]>('/v1/commerce/variants?take=500'),
  ]);

  const variantSummaries = variantRows.map((v) => ({
    id: v.id,
    sku: v.sku,
    title: v.title,
    basePriceCents: v.priceCents,
    productTitle: v.productTitle,
  }));

  return (
    <Stack gap={6}>
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
              Pick a variant from the dropdown, then set either a fixed price or a percent-off-list.
              Quantity ranges let you ladder pricing (e.g. 1-9 at $20, 10+ at $18).
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
  );
}
