import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  CreditCard,
  CheckSquare,
  AlertCircle,
} from 'lucide-react';

import { requireSession } from '@sparx/auth';
import {
  CrmNotFoundError,
  activityService,
  b2bAccountService,
  customerService,
  taskService,
} from '@sparx/crm';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  Heading,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@sparx/ui';

import { ActivityTimeline } from '../_components/activity-timeline';
import { RecordActivityForm } from '../_components/record-activity-form';

// Unified customer record (Phase 2).
//   • Profile header — name / type / company / contact / DNC.
//   • Stat row — total spent, order count, AOV, lifetime days.
//   • B2B card (if linked) — account name, pricing tier, credit utilization.
//   • Tabs — Activity (default), Tasks, Deals, B2B, Notes.
//   • Right rail — manual activity recording.
//
// Everything is read off the live service layer. The activity timeline shows
// rows the Phase 2 consumers populate from order/email/quote/auth events
// plus anything staff entered manually via RecordActivityForm.

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let customer;
  try {
    customer = await customerService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  // Fan out the secondary queries in parallel — none depend on the others.
  const [activities, openTasks, b2bAccount] = await Promise.all([
    activityService.list(ctx, { customerId: id, limit: 100 }),
    taskService.list(ctx, { customerId: id, status: 'open', take: 25 }),
    customer.b2bAccountId
      ? b2bAccountService.get(ctx, customer.b2bAccountId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const displayName =
    [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() ||
    customer.company ||
    customer.email ||
    'Unnamed customer';

  const totalSpent = Number(customer.totalSpent);
  const aov = customer.orderCount > 0 ? totalSpent / customer.orderCount : 0;
  const lifetimeDays = Math.max(
    1,
    Math.floor((Date.now() - customer.createdAt.getTime()) / 86_400_000)
  );

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
          <Stack direction="row" align="center" gap={3} wrap>
            <Heading level={1}>{displayName}</Heading>
            <Badge variant="module">{customer.type}</Badge>
            {customer.doNotContact && <Badge variant="warning">Do not contact</Badge>}
            {customer.mergedIntoCustomerId && (
              <Badge variant="outline">Merged into another record</Badge>
            )}
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

        {/* Stat row */}
        <Card>
          <CardContent>
            <Stack direction="row" gap={8} wrap>
              <StatItem label="Total spent" value={`$${totalSpent.toLocaleString()}`} />
              <StatItem label="Orders" value={customer.orderCount.toString()} />
              <StatItem
                label="Average order"
                value={customer.orderCount > 0 ? `$${aov.toFixed(2)}` : '—'}
              />
              <StatItem
                label="Lifetime"
                value={`${lifetimeDays} day${lifetimeDays === 1 ? '' : 's'}`}
              />
              <StatItem
                label="First order"
                value={customer.firstOrderAt ? customer.firstOrderAt.toLocaleDateString() : '—'}
              />
              <StatItem
                label="Last order"
                value={customer.lastOrderAt ? customer.lastOrderAt.toLocaleDateString() : '—'}
              />
            </Stack>
          </CardContent>
        </Card>

        {/* Two-column body — left: tabs (activity / tasks / etc), right: contact + B2B + actions */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Tabs defaultValue="activity">
              <TabsList>
                <TabsTrigger value="activity">
                  Activity{' '}
                  {activities.length > 0 && <Badge variant="outline">{activities.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="tasks">
                  Tasks{' '}
                  {openTasks.length > 0 && <Badge variant="warning">{openTasks.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="deals">Deals</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="activity">
                <Card>
                  <CardHeader>
                    <CardTitle>Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activities.length === 0 ? (
                      <Text variant="muted" size="sm">
                        No activity recorded yet. Orders, emails, and notes will appear here as they
                        happen.
                      </Text>
                    ) : (
                      <ActivityTimeline activities={activities} />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks">
                <Card>
                  <CardHeader>
                    <Stack direction="row" align="center" justify="between">
                      <CardTitle>Open tasks</CardTitle>
                      <Button asChild size="sm" variant="module-outline">
                        <Link href={`/crm/tasks/new?customerId=${customer.id}`}>New task</Link>
                      </Button>
                    </Stack>
                  </CardHeader>
                  <CardContent>
                    {openTasks.length === 0 ? (
                      <Text variant="muted" size="sm">
                        No open tasks for this customer.
                      </Text>
                    ) : (
                      <Stack gap={3}>
                        {openTasks.map((task) => (
                          <Stack
                            key={task.id}
                            direction="row"
                            align="center"
                            justify="between"
                            className="rounded-md border border-[var(--color-border-default)] p-3"
                          >
                            <Stack gap={1}>
                              <Stack direction="row" align="center" gap={2}>
                                <CheckSquare className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                                <Text size="sm">{task.title}</Text>
                                <Badge variant={taskPriorityVariant(task.priority)}>
                                  {task.priority}
                                </Badge>
                              </Stack>
                              {task.dueAt && (
                                <Text size="xs" variant="muted">
                                  Due {task.dueAt.toLocaleDateString()}
                                </Text>
                              )}
                            </Stack>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="deals">
                <Card>
                  <CardContent>
                    <Text variant="muted" size="sm">
                      Deal list lands in Phase 3 (sales pipeline). Until then, deals attached to
                      this customer can be opened from the Pipeline view.
                    </Text>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes">
                <Card>
                  <CardContent>
                    <Stack gap={4}>
                      <Text variant="muted" size="sm">
                        Notes are recorded as activities of type{' '}
                        <Badge variant="outline">note</Badge>. Use the right rail to add one.
                      </Text>
                      <ActivityTimeline activities={activities.filter((a) => a.type === 'note')} />
                    </Stack>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right rail */}
          <Stack gap={6}>
            <Card variant="module">
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent>
                <Stack gap={3}>
                  {customer.email ? (
                    <Stack direction="row" align="center" gap={2}>
                      <Mail className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                      <Text size="sm">{customer.email}</Text>
                    </Stack>
                  ) : (
                    <Text variant="muted" size="sm">
                      No email on file.
                    </Text>
                  )}
                  {customer.phone && (
                    <Stack direction="row" align="center" gap={2}>
                      <Phone className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                      <Text size="sm">{customer.phone}</Text>
                    </Stack>
                  )}
                  {customer.preferredContactMethod && (
                    <Text size="xs" variant="muted">
                      Preferred: {customer.preferredContactMethod}
                    </Text>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {b2bAccount && <B2BAccountCard account={b2bAccount} />}

            <Card>
              <CardHeader>
                <CardTitle>Record activity</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordActivityForm customerId={customer.id} />
              </CardContent>
            </Card>

            {customer.tags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Tags</CardTitle>
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
          </Stack>
        </div>
      </Stack>
    </Container>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1}>
      <Text size="xs" variant="muted">
        {label}
      </Text>
      <Heading level={3}>{value}</Heading>
    </Stack>
  );
}

function B2BAccountCard({
  account,
}: {
  account: {
    id: string;
    companyName: string;
    pricingTier: string | null;
    creditLimit: unknown;
    creditUsed: unknown;
    paymentTerms: string | null;
    status: string;
  };
}) {
  const limit = Number(account.creditLimit ?? 0);
  const used = Number(account.creditUsed ?? 0);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <Card variant="module">
      <CardHeader>
        <Stack direction="row" align="center" gap={2}>
          <Building2 className="h-4 w-4" />
          <CardTitle>B2B account</CardTitle>
        </Stack>
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          <Stack gap={1}>
            <Text size="sm">{account.companyName}</Text>
            <Stack direction="row" gap={2}>
              {account.pricingTier && <Badge variant="outline">{account.pricingTier}</Badge>}
              {account.status === 'credit_hold' && (
                <Badge variant="warning">
                  <AlertCircle className="h-3 w-3" />
                  Credit hold
                </Badge>
              )}
              {account.status === 'suspended' && <Badge variant="warning">Suspended</Badge>}
            </Stack>
          </Stack>
          {limit > 0 && (
            <Stack gap={1}>
              <Stack direction="row" justify="between">
                <Text size="xs" variant="muted">
                  <CreditCard className="mr-1 inline h-3 w-3" />
                  Credit
                </Text>
                <Text size="xs">
                  ${used.toLocaleString()} / ${limit.toLocaleString()}
                </Text>
              </Stack>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                <div className="h-full bg-[var(--module-active)]" style={{ width: `${pct}%` }} />
              </div>
            </Stack>
          )}
          {account.paymentTerms && (
            <Text size="xs" variant="muted">
              Terms: {account.paymentTerms}
            </Text>
          )}
          <Button asChild size="sm" variant="module-outline">
            <Link href={`/crm/b2b/${account.id}`}>Open account</Link>
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function taskPriorityVariant(priority: string): 'outline' | 'warning' | 'danger' {
  if (priority === 'urgent') return 'danger';
  if (priority === 'high') return 'warning';
  return 'outline';
}
