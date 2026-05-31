import { Gift } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  PageHeader,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { IssueGiftCardForm } from './_components/issue-gift-card-form';

interface GiftCardSummary {
  id: string;
  code: string;
  balanceCents: number;
  initialBalanceCents: number;
  currency: string;
  status: string;
  expiresAt: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  createdAt: string;
}

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  spent: 'outline',
  expired: 'warning',
  cancelled: 'warning',
};

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default async function GiftCardsPage() {
  const cards = await api.get<GiftCardSummary[]>('/v1/commerce/gift-cards?take=100');

  const outstandingCents = cards
    .filter((c) => c.status === 'active')
    .reduce((acc, c) => acc + c.balanceCents, 0);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Gift className="h-5 w-5" />}
          title="Gift cards"
          badge={
            <Badge color="module">{moneyFmt.format(outstandingCents / 100)} outstanding</Badge>
          }
          description="Issue, look up, and adjust gift cards. Cards sold as a product (a future Phase 4 sellable product type) link back to the order item so a refund revokes the unspent balance."
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Issue a new card</Heading>
              <CardDescription>
                Codes are auto-generated (16 alphanumeric, hyphen-grouped). Use a custom code only
                when migrating from a legacy system.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <IssueGiftCardForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Issued cards</Heading>
          </CardHeader>
          <CardContent>
            {cards.length === 0 ? (
              <EmptyState
                icon={<Gift className="h-5 w-5" />}
                title="No gift cards yet"
                description="Issue one above. Cards stay active until spent, expired, or cancelled."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Initial</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((card) => (
                    <TableRow key={card.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{card.code}</span>
                      </TableCell>
                      <TableCell>{moneyFmt.format(card.balanceCents / 100)}</TableCell>
                      <TableCell>
                        <Text size="xs" variant="muted">
                          {moneyFmt.format(card.initialBalanceCents / 100)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {card.recipientEmail ? (
                          <Stack gap={0}>
                            <Text size="sm">{card.recipientName ?? '—'}</Text>
                            <Text size="xs" variant="muted">
                              {card.recipientEmail}
                            </Text>
                          </Stack>
                        ) : (
                          <Text size="xs" variant="muted">
                            none
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge color={STATUS_VARIANT[card.status] ?? 'outline'}>
                          {card.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" variant="muted">
                          {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString() : 'never'}
                        </Text>
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
