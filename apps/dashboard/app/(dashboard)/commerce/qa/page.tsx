import Link from 'next/link';
import { HelpCircle, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { reviewService } from '@sparx/commerce';
import { withTenant } from '@sparx/db';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
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

import { ModuleStub } from '../../../../components/module-stub';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'Pending' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

export default async function QaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Customer questions."
        description="Activate the Commerce module from Billing to manage product Q&A."
        features={[]}
      />
    );
  }

  const { status: statusParam } = await searchParams;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const rows = await loadQuestions(ctx, statusParam);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <HelpCircle className="h-5 w-5" />
            <Heading level={1}>Questions &amp; answers</Heading>
            <Badge variant="module">{rows.length} shown</Badge>
          </Stack>
          <Text variant="muted">
            Customer questions are moderated before they reach the storefront. Answering with the
            staff badge marks the response as official; community answers can land too once the
            question is published.
          </Text>
        </Stack>

        <Stack direction="row" gap={2} wrap>
          {STATUS_FILTERS.map((f) => (
            <FilterLink key={f.label} current={statusParam} value={f.value} label={f.label} />
          ))}
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>{labelFor(statusParam)}</Heading>
              <CardDescription>
                Click a question to publish or reject, and post an official answer.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState
                icon={<HelpCircle className="h-5 w-5" />}
                title="No questions"
                description="Questions arrive here once the storefront PDP starts accepting them."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Answers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Asked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Link
                          href={`/commerce/qa/${q.id}`}
                          className="hover:text-[var(--module-active)]"
                        >
                          {truncate(q.body, 80)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {q.productId.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>{q.displayName ?? (q.customerId ? 'Customer' : 'Anon')}</TableCell>
                      <TableCell>{q.answerCount}</TableCell>
                      <TableCell>
                        <StatusBadge status={q.status} />
                      </TableCell>
                      <TableCell>{new Date(q.createdAt).toLocaleDateString()}</TableCell>
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

async function loadQuestions(
  ctx: { tenantId: string; userId: string },
  statusParam: string | undefined
) {
  if (statusParam === undefined) {
    const rows = await reviewService.listPendingQuestions(ctx);
    return rows.map((q) => ({ ...q, answerCount: q.answers.length }));
  }
  return withTenant(ctx, async (tx) => {
    const where =
      statusParam === 'all'
        ? {}
        : { status: statusParam === 'published' ? 'published' : 'rejected' };
    const rows = await tx.productQuestion.findMany({
      where,
      include: { _count: { select: { answers: true } } },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      customerId: r.customerId,
      displayName: r.displayName,
      body: r.body,
      status: r.status,
      helpfulCount: r.helpfulCount,
      createdAt: r.createdAt.toISOString(),
      answerCount: r._count.answers,
    }));
  });
}

function labelFor(s: string | undefined): string {
  if (s === undefined) return 'Pending';
  if (s === 'all') return 'All questions';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function FilterLink({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const isActive = current === value;
  const href = value ? `/commerce/qa?status=${value}` : '/commerce/qa';
  return (
    <Link
      href={href}
      className={
        isActive
          ? 'rounded bg-[var(--module-active)] px-3 py-1 text-xs text-white'
          : 'rounded border border-[var(--color-border-default)] px-3 py-1 text-xs hover:bg-[var(--color-bg-subtle)]'
      }
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: 'success' | 'outline' | 'danger' =
    status === 'published' ? 'success' : status === 'rejected' ? 'danger' : 'outline';
  return <Badge variant={variant}>{status}</Badge>;
}
