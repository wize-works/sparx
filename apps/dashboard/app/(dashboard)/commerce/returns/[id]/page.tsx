import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { returnService } from '@sparx/commerce';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../../components/module-stub';

import { ReturnApprovalForm } from './_components/return-approval-form';
import { ReturnInspectionForm } from './_components/return-inspection-form';
import { ReturnRefundForm } from './_components/return-refund-form';
import { ReturnStatusBar } from './_components/return-status-bar';

export const dynamic = 'force-dynamic';

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to manage returns."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const ret = await returnService.get(ctx, id).catch(() => null);
  if (!ret) notFound();

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/returns"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to returns
          </Link>
          <Stack direction="row" align="end" justify="between" wrap gap={2}>
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2}>
                <Heading level={1} className="font-mono text-2xl">
                  {ret.id.slice(0, 8)}
                </Heading>
                <Badge variant="outline">{ret.status}</Badge>
                <Badge variant="outline">prefer {ret.preferredOutcome}</Badge>
              </Stack>
              <Text variant="muted">
                Order{' '}
                <Text className="font-mono" size="sm">
                  {ret.orderId.slice(0, 8)}
                </Text>
                {ret.customerId && (
                  <>
                    {' · '}customer{' '}
                    <Text className="font-mono" size="sm">
                      {ret.customerId.slice(0, 8)}
                    </Text>
                  </>
                )}
              </Text>
            </Stack>
            <ReturnStatusBar returnId={ret.id} status={ret.status} />
          </Stack>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Requested items</Heading>
              <CardDescription>
                Customer asked to return these. Use Approve below to set per-line approved quantity.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order item</TableHead>
                  <TableHead>Requested qty</TableHead>
                  <TableHead>Approved qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ret.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <Text size="xs" className="font-mono">
                        {it.orderItemId.slice(0, 8)}
                      </Text>
                    </TableCell>
                    <TableCell>{it.quantity}</TableCell>
                    <TableCell>{it.approvedQuantity}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{it.reasonCode}</Badge>
                    </TableCell>
                    <TableCell>
                      {it.customerNote ?? (
                        <Text size="xs" variant="muted">
                          —
                        </Text>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {ret.status === 'requested' && (
          <Card>
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Approve</Heading>
                <CardDescription>
                  Per-line approved quantity may be less than requested.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <ReturnApprovalForm returnId={ret.id} items={ret.items} />
            </CardContent>
          </Card>
        )}

        {(ret.status === 'received' || ret.status === 'inspecting') && (
          <Card>
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Record inspection</Heading>
                <CardDescription>
                  Mark each line's condition and whether it can be restocked.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <ReturnInspectionForm returnId={ret.id} items={ret.items} />
            </CardContent>
          </Card>
        )}

        {(ret.status === 'inspected' || ret.status === 'received') && (
          <Card>
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Issue refund</Heading>
                <CardDescription>
                  Refund to original payment or as store credit. Provider-side settlement runs
                  alongside.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <ReturnRefundForm returnId={ret.id} preferredOutcome={ret.preferredOutcome} />
            </CardContent>
          </Card>
        )}

        {ret.inspections.length > 0 && (
          <Card>
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Inspection history</Heading>
              </Stack>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Restockable</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ret.inspections.map((ins) => (
                    <TableRow key={ins.id}>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {ins.returnLineItemId.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ins.condition}</Badge>
                      </TableCell>
                      <TableCell>{ins.restockable ? 'yes' : 'no'}</TableCell>
                      <TableCell>
                        {ins.warehouseId ? (
                          <Text size="xs" className="font-mono">
                            {ins.warehouseId.slice(0, 8)}
                          </Text>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {ins.note ?? (
                          <Text size="xs" variant="muted">
                            —
                          </Text>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {ret.status === 'refunded' && (
          <Card>
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Settlement</Heading>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                <Row
                  label="Refunded amount"
                  value={
                    ret.refundedAmountCents != null
                      ? `$${(ret.refundedAmountCents / 100).toFixed(2)}`
                      : '—'
                  }
                />
                <Row
                  label="Restocking fee"
                  value={
                    ret.restockingFeeCents != null
                      ? `$${(ret.restockingFeeCents / 100).toFixed(2)}`
                      : '—'
                  }
                />
                <Row label="Issued as" value={ret.refundIssuedAs ?? '—'} />
                <Row
                  label="Refunded at"
                  value={ret.refundedAt ? new Date(ret.refundedAt).toLocaleString() : '—'}
                />
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" gap={4}>
      <Text size="sm" className="w-40" variant="muted">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Stack>
  );
}
