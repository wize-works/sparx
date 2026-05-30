import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Star, Archive, Users, Code2 } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { CrmNotFoundError, segmentService } from '@sparx/crm';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Heading,
  Stack,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { RecomputeButton } from '../_components/recompute-button';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

export async function SegmentDetailContent({ id }: Props) {
  const session = await requireSession();
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let segment;
  try {
    segment = await segmentService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  const [members, total] = await Promise.all([
    segmentService.members(ctx, id, { limit: 100 }),
    segmentService.memberCount(ctx, id),
  ]);

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Stack direction="row" align="center" justify="between" wrap gap={3}>
          <Stack direction="row" align="center" gap={3} wrap>
            <Heading level={1}>{segment.name}</Heading>
            {segment.isBuiltIn && (
              <Badge variant="outline">
                <Star className="h-3 w-3" /> Built-in
              </Badge>
            )}
            {segment.archivedAt && (
              <Badge variant="warning">
                <Archive className="h-3 w-3" /> Archived
              </Badge>
            )}
            <code className="text-xs text-[var(--color-text-tertiary)]">{segment.slug}</code>
          </Stack>
          <RecomputeButton segmentId={segment.id} />
        </Stack>
        {segment.description && <Text variant="muted">{segment.description}</Text>}
      </Stack>

      <div className="grid gap-4 md:grid-cols-3">
        <Card variant="module">
          <CardContent className="py-4">
            <Stat label="Members" value={total.toLocaleString()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <Stat label="Created" value={segment.createdAt.toLocaleDateString()} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <Stat label="Updated" value={segment.updatedAt.toLocaleDateString()} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Stack direction="row" align="center" gap={2}>
              <Code2 className="h-4 w-4" /> Rule
            </Stack>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-[var(--color-surface-subtle)] p-3 text-xs">
            {JSON.stringify(segment.rules, null, 2)}
          </pre>
          <Text size="xs" variant="muted" className="mt-2">
            {segment.isBuiltIn
              ? 'Built-in segments are read-only — clone to customize. (Visual rule editor lands in the next dashboard iteration.)'
              : 'Visual rule editor lands in the next dashboard iteration; until then the JSON above is the source of truth and can be edited via the API.'}
          </Text>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Stack direction="row" align="center" gap={2}>
              <Users className="h-4 w-4" /> Members
              <Badge variant="outline">{total}</Badge>
            </Stack>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState
              title="No members yet"
              description={
                segment.isBuiltIn
                  ? 'Membership is updated as events flow. Place an order or import customers, then check back.'
                  : 'New segments only materialise after a recompute. Click Recompute above to evaluate every customer against the rule, then refresh.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead>Entered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.customerId}>
                    <TableCell>
                      <Link
                        href={`/crm/customers/${m.customerId}`}
                        className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                      >
                        {customerLabel(m.customer)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {m.customer.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${Number(m.customer.totalSpent).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Text size="sm" variant="muted">
                        {m.enteredAt.toLocaleDateString()}
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
  );
}

function customerLabel(c: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}): string {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return fullName !== '' ? fullName : (c.company ?? c.email ?? 'Unnamed customer');
}
