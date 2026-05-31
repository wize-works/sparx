import { Container, PageHeader, Stack } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { NewOrderForm } from './_components/new-order-form';

export const dynamic = 'force-dynamic';

interface CustomerLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewOrderPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const { data: customers } = await api.getPaged<CustomerLite[]>(
    '/v1/crm/customers?take=200&sort_by=updatedAt'
  );
  const preselectedCustomerId = stringParam(sp.customerId) ?? null;

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New order"
          description={
            <>
              Place an order manually. Totals are derived from line items + header shipping; the
              service emits <code>order.created</code> after the transaction commits.
            </>
          }
        />

        <NewOrderForm
          customers={customers.map((c) => ({
            id: c.id,
            label:
              [c.firstName, c.lastName].filter(Boolean).join(' ') ||
              (c.company ?? c.email ?? c.id.slice(0, 8)),
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
