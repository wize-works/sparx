import { Container, PageHeader, Stack } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { NewQuoteForm } from './_components/new-quote-form';

export const dynamic = 'force-dynamic';

interface CustomerLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}

interface B2bAccountLite {
  id: string;
  companyName: string;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewQuotePage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const [customers, b2bAccounts] = await Promise.all([
    api
      .getPaged<CustomerLite[]>('/v1/crm/customers?take=200&sort_by=updatedAt')
      .then((r) => r.data),
    api.getPaged<B2bAccountLite[]>('/v1/crm/b2b-accounts?take=200').then((r) => r.data),
  ]);
  const preselectedCustomerId = stringParam(sp.customerId) ?? null;

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New quote"
          description="Drafts can be edited freely. Submitting locks the quote; accepted quotes convert to a new Order atomically via the detail page."
        />

        <NewQuoteForm
          customers={customers.map((c) => ({
            id: c.id,
            label:
              [c.firstName, c.lastName].filter(Boolean).join(' ') ||
              (c.company ?? c.email ?? c.id.slice(0, 8)),
          }))}
          b2bAccounts={b2bAccounts.map((a) => ({
            id: a.id,
            label: a.companyName,
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
