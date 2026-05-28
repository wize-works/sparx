import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { customerService } from '@sparx/crm';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';

import { NewOrderForm } from './_components/new-order-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewOrderPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sp = await searchParams;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const customersResult = await customerService.list(ctx, { take: 200, sortBy: 'updatedAt' });
  const preselectedCustomerId = stringParam(sp.customerId) ?? null;

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/orders">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to orders
            </Link>
          </Button>
          <Heading level={1}>New order</Heading>
          <Text variant="muted">
            Place an order manually. Totals are derived from line items + header shipping; the
            service emits <code>order.created</code> after the transaction commits.
          </Text>
        </Stack>

        <NewOrderForm
          customers={customersResult.items.map((c) => ({
            id: c.id,
            label:
              [c.firstName, c.lastName].filter(Boolean).join(' ') ||
              c.company ||
              c.email ||
              c.id.slice(0, 8),
          }))}
          preselectedCustomerId={preselectedCustomerId}
        />
      </Stack>
    </Container>
  );
}

function stringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
