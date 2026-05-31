import { CreditCard } from 'lucide-react';

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
import { ListToolbar } from '../../_components/list-toolbar';

export const dynamic = 'force-dynamic';

const STEP_ORDER = ['cart_review', 'contact', 'shipping', 'payment', 'review'] as const;

const STEP_OPTIONS = [
  ...STEP_ORDER.map((s) => ({ value: s, label: labelForStep(s) })),
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
];

interface CheckoutSessionRow {
  id: string;
  step: string;
  channel: string;
  currency: string;
  customerId: string | null;
  customerEmail: string | null;
  subtotalCents: number;
  totalCents: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export default async function CheckoutSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const qs = step ? `?step=${encodeURIComponent(step)}&take=200` : '?take=200';
  const sessions = await api.get<CheckoutSessionRow[]>(`/v1/commerce/checkout-sessions${qs}`);

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<CreditCard className="h-5 w-5" />}
          title="Checkout sessions"
          badge={<Badge color="module">{sessions.length} in-flight</Badge>}
          description="Read-only diagnostic. The state machine advances cart_review → contact → shipping → payment → review → completed. Sessions stuck in a non-terminal step are auto-expired on TTL by the worker; staff can manually expire a session from the API if needed."
        />

        <ListToolbar
          searchable={false}
          filters={[{ key: 'step', label: 'Steps', options: STEP_OPTIONS }]}
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>{step ? labelForStep(step) : 'Active'}</Heading>
              <CardDescription>
                Click a cart ID to see the items + pricing trace; the session lifecycle is the table
                here.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="h-5 w-5" />}
                title="No sessions"
                description="Checkout sessions appear here when the storefront starts writing."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {s.id.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>{s.customerEmail ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.channel}</Badge>
                      </TableCell>
                      <TableCell>
                        <StepBadge step={s.step} />
                      </TableCell>
                      <TableCell>
                        ${(s.totalCents / 100).toFixed(2)} {s.currency}
                      </TableCell>
                      <TableCell>{new Date(s.updatedAt).toLocaleString()}</TableCell>
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

function StepBadge({ step }: { step: string }) {
  const v: 'success' | 'warning' | 'outline' =
    step === 'completed' ? 'success' : step === 'expired' ? 'warning' : 'outline';
  return <Badge color={v}>{step}</Badge>;
}

function labelForStep(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
