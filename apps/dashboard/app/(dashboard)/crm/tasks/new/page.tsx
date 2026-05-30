import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { NewTaskForm } from './_components/new-task-form';

export const dynamic = 'force-dynamic';

interface CustomerLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}

interface TenantUser {
  id: string;
  name: string | null;
  email: string | null;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewTaskPage({ searchParams }: PageProps) {
  // requireSession stays — we need currentUserId for the form prop. Customers
  // and users both load from api-rest now.
  const session = await requireSession();
  const sp = await searchParams;

  const [customers, users] = await Promise.all([
    api.getPaged<CustomerLite[]>('/v1/crm/customers?take=200').then((r) => r.data),
    api.get<TenantUser[]>('/v1/users?take=100'),
  ]);

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/tasks">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to tasks
            </Link>
          </Button>
          <Heading level={1}>New task</Heading>
          <Text variant="muted">
            Assign a follow-up to yourself or a teammate. Tasks linked to a customer or deal show up
            on that record&apos;s task list as well.
          </Text>
        </Stack>

        <NewTaskForm
          currentUserId={session.user.id}
          users={users.map((u) => ({
            id: u.id,
            label: u.name ?? u.email ?? u.id.slice(0, 8),
          }))}
          customers={customers.map((c) => ({
            id: c.id,
            label:
              [c.firstName, c.lastName].filter(Boolean).join(' ') ||
              (c.company ?? c.email ?? c.id.slice(0, 8)),
          }))}
          preselectedCustomerId={stringParam(sp.customerId) ?? null}
          preselectedDealId={stringParam(sp.dealId) ?? null}
        />
      </Stack>
    </Container>
  );
}

function stringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
