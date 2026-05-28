import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, Mail, Phone } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { CrmNotFoundError, customerService } from '@sparx/crm';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

// Phase 1 customer detail — read-only profile + commerce snapshot. The
// activity timeline, deal list, task panel, and edit form land in Phase 2
// when the activity log + event consumers go live. The route exists now
// so the create-customer flow has a place to redirect.

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();

  let customer;
  try {
    customer = await customerService.get(
      { tenantId: session.user.tenantId, userId: session.user.id },
      id,
    );
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  const displayName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
    || customer.company
    || customer.email
    || 'Unnamed customer';

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to CRM
            </Link>
          </Button>
          <Stack direction="row" align="center" gap={3}>
            <Heading level={1}>{displayName}</Heading>
            <Badge variant="module">{customer.type}</Badge>
            {customer.doNotContact && <Badge variant="warning">Do not contact</Badge>}
          </Stack>
          {customer.company && (
            <Stack direction="row" align="center" gap={2}>
              <Building2 className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <Text variant="muted">{customer.company}</Text>
              {customer.jobTitle && (
                <Text variant="muted" size="sm">
                  · {customer.jobTitle}
                </Text>
              )}
            </Stack>
          )}
        </Stack>

        <Card variant="module">
          <CardHeader>
            <Heading level={3}>Contact</Heading>
          </CardHeader>
          <CardContent>
            <Stack gap={3}>
              {customer.email ? (
                <Stack direction="row" align="center" gap={2}>
                  <Mail className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                  <Text>{customer.email}</Text>
                </Stack>
              ) : (
                <Text variant="muted" size="sm">No email on file.</Text>
              )}
              {customer.phone && (
                <Stack direction="row" align="center" gap={2}>
                  <Phone className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                  <Text>{customer.phone}</Text>
                </Stack>
              )}
              {customer.preferredContactMethod && (
                <Text size="sm" variant="muted">
                  Preferred: {customer.preferredContactMethod}
                </Text>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Commerce</Heading>
          </CardHeader>
          <CardContent>
            <Stack direction="row" gap={6}>
              <Stack gap={1}>
                <Text size="xs" variant="muted">Total spent</Text>
                <Heading level={3}>${customer.totalSpent.toString()}</Heading>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" variant="muted">Orders</Text>
                <Heading level={3}>{customer.orderCount}</Heading>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" variant="muted">First order</Text>
                <Text>
                  {customer.firstOrderAt ? customer.firstOrderAt.toLocaleDateString() : '—'}
                </Text>
              </Stack>
              <Stack gap={1}>
                <Text size="xs" variant="muted">Last order</Text>
                <Text>
                  {customer.lastOrderAt ? customer.lastOrderAt.toLocaleDateString() : '—'}
                </Text>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {customer.tags.length > 0 && (
          <Card>
            <CardHeader>
              <Heading level={3}>Tags</Heading>
            </CardHeader>
            <CardContent>
              <Stack direction="row" gap={2} wrap>
                {customer.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}

        <Card variant="subtle">
          <CardHeader>
            <Heading level={3}>Coming in Phase 2</Heading>
          </CardHeader>
          <CardContent>
            <Text variant="muted" size="sm">
              Activity timeline · order list · linked deals · tasks · merge flow · edit form. The
              data model and event topics for these are already in place — Phase 2 wires the
              consumers and dashboard surface.
            </Text>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
