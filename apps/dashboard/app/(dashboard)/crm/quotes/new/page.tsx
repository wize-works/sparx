import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { b2bAccountService, customerService } from '@sparx/crm';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';

import { NewQuoteForm } from './_components/new-quote-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewQuotePage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sp = await searchParams;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const [customersResult, b2bResult] = await Promise.all([
    customerService.list(ctx, { take: 200, sortBy: 'updatedAt' }),
    b2bAccountService.list(ctx, { take: 200 }),
  ]);
  const preselectedCustomerId = stringParam(sp.customerId) ?? null;

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/quotes">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to quotes
            </Link>
          </Button>
          <Heading level={1}>New quote</Heading>
          <Text variant="muted">
            Drafts can be edited freely. Submitting locks the quote; accepted quotes convert to a
            new Order atomically via the detail page.
          </Text>
        </Stack>

        <NewQuoteForm
          customers={customersResult.items.map((c) => ({
            id: c.id,
            label:
              [c.firstName, c.lastName].filter(Boolean).join(' ') ||
              (c.company ?? c.email ?? c.id.slice(0, 8)),
          }))}
          b2bAccounts={b2bResult.items.map((a) => ({
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
