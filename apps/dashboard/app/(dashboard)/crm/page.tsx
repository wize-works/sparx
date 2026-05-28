import Link from 'next/link';
import { Users, Plus, Building2, UserPlus } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { customerService } from '@sparx/crm';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Grid,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../components/module-stub';

// Server component. Dynamic because customer state changes constantly —
// caching would mask new orders / segment changes / staff updates.
export const dynamic = 'force-dynamic';

const TYPE_LABELS = {
  prospect: 'Prospect',
  retail: 'Customer',
  b2b: 'B2B contact',
} as const;

export default async function CrmPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'crm');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<Users className="h-5 w-5" />}
        title="CRM"
        tagline="Customers, segments, and lifecycle automation."
        description="The CRM module unifies customer profiles across storefront, B2B, and email so you can segment, score, and re-engage them. Activate it to start tracking customers."
        features={[
          { title: 'Customer profiles', description: 'Order history, tags, notes, and engagement.' },
          { title: 'Pipeline', description: 'Kanban deal flow for B2B and high-touch sales.' },
          { title: 'Segments', description: 'Live audiences updated incrementally by event.' },
          { title: 'Automation', description: 'Trigger emails, tasks, and webhooks on customer events.' },
          { title: 'Activity log', description: 'Append-only timeline of every touchpoint.' },
          { title: 'MCP integration', description: 'AI-readable customer intelligence surface.' },
        ]}
      />
    );
  }

  const { items: customers, total } = await customerService.list(
    { tenantId: session.user.tenantId, userId: session.user.id },
    { take: 24, sortBy: 'updatedAt' },
  );

  return (
    <Container size="xl">
      <Stack gap={8} className="py-10">
        <Stack direction="row" align="end" justify="between">
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Users className="h-5 w-5" />
              <Heading level={1}>CRM</Heading>
              <Badge variant="module">{total} customer{total === 1 ? '' : 's'}</Badge>
            </Stack>
            <Text variant="muted">
              Customer intelligence for the whole platform — orders, segments, deals, and activity.
            </Text>
          </Stack>
          <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/crm/customers/new">New customer</Link>
          </Button>
        </Stack>

        {customers.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="No customers yet"
              description="Add your first customer manually, or wait for orders and prospects to populate the list automatically."
              action={
                <Button asChild variant="module">
                  <Link href="/crm/customers/new">Add a customer</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {customers.map((c) => (
              <Card key={c.id} variant="module">
                <CardHeader>
                  <CardDescription>
                    {TYPE_LABELS[c.type as keyof typeof TYPE_LABELS] ?? c.type}
                  </CardDescription>
                  <CardTitle>{customerDisplayName(c)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Stack gap={2}>
                    {c.company && (
                      <Stack direction="row" align="center" gap={2}>
                        <Building2 className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                        <Text size="sm" variant="muted">{c.company}</Text>
                      </Stack>
                    )}
                    <Stack direction="row" align="center" gap={2}>
                      {c.orderCount > 0 ? (
                        <Badge variant="success">
                          {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                        </Badge>
                      ) : (
                        <Badge variant="outline">No orders</Badge>
                      )}
                      {c.doNotContact && <Badge variant="warning">DNC</Badge>}
                      <Text size="xs" variant="muted">
                        Updated {c.updatedAt.toLocaleDateString()}
                      </Text>
                    </Stack>
                  </Stack>
                </CardContent>
                <CardFooter>
                  <Button variant="module-outline" size="sm" asChild>
                    <Link href={`/crm/customers/${c.id}`}>Open</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}

function customerDisplayName(c: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}): string {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (c.company) return c.company;
  if (c.email) return c.email;
  return 'Unnamed customer';
}
