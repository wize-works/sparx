import Link from 'next/link';
import { BarChart3, TrendingUp, Users, AlertCircle } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
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

import { api } from '@/lib/api-rest-client';

import { CrmTabs } from '../_components/crm-tabs';
import { stageColor } from '../pipelines/[id]/_components/kanban-types';

interface TenantSnapshot {
  customers: number;
  b2bAccounts: number;
  openDeals: number;
  pipelineValue: number;
  openTasks: number;
  overdueTasks: number;
}

interface PipelineLite {
  id: string;
  name: string;
  isDefault: boolean;
}

interface FunnelBucket {
  stageId: string;
  stageName: string;
  stageType: 'open' | 'won' | 'lost';
  count: number;
  totalValue: number;
}

interface WinLossRow {
  repId: string | null;
  won: number;
  lost: number;
  open: number;
  winRate: number;
  totalWonValue: number;
}

interface AcquisitionPoint {
  month: string;
  newCustomers: number;
}

// CRM reports landing — tenant snapshot + funnel for the default pipeline
// + recent acquisition. Each report is a server-rendered card calling
// reportingService directly (no rollup yet — Phase 6 follow-up).

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const [snapshot, pipelines, winLoss, acquisition] = await Promise.all([
    api.get<TenantSnapshot>('/v1/crm/reports/snapshot'),
    api.get<PipelineLite[]>('/v1/crm/pipelines'),
    api.get<WinLossRow[]>('/v1/crm/reports/win-loss'),
    api.get<AcquisitionPoint[]>('/v1/crm/reports/acquisition?months=12'),
  ]);

  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
  const funnel = defaultPipeline
    ? await api.get<FunnelBucket[]>(
        `/v1/crm/reports/pipeline-funnel?pipeline_id=${defaultPipeline.id}`
      )
    : [];

  const maxAcquisition = acquisition.reduce((m, p) => Math.max(m, p.newCustomers), 0);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="reports" />
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <BarChart3 className="h-5 w-5" />
            <Heading level={1}>Reports</Heading>
          </Stack>
          <Text variant="muted">
            Live tenant metrics. Numbers are derived from the source tables — a nightly rollup
            (Phase 6 follow-up) will back this page once daily aggregates are big enough to matter.
          </Text>
        </Stack>

        <div className="grid gap-4 md:grid-cols-4">
          <Card variant="module">
            <CardContent className="py-4">
              <Stat label="Customers" value={snapshot.customers.toLocaleString()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="B2B accounts" value={snapshot.b2bAccounts.toLocaleString()} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat
                label="Open deals"
                value={snapshot.openDeals.toLocaleString()}
                hint={`$${snapshot.pipelineValue.toLocaleString()} pipeline`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat
                label="Open tasks"
                value={snapshot.openTasks.toLocaleString()}
                hint={snapshot.overdueTasks > 0 ? `${snapshot.overdueTasks} overdue` : 'on track'}
              />
            </CardContent>
          </Card>
        </div>

        {defaultPipeline && funnel.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" align="center" gap={2}>
                  <TrendingUp className="h-4 w-4" /> Pipeline funnel — {defaultPipeline.name}
                </Stack>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={3}>
                {funnel.map((b) => {
                  const max = Math.max(...funnel.map((x) => x.count), 1);
                  return (
                    <Stack key={b.stageId} gap={1}>
                      <Stack direction="row" justify="between">
                        <Stack direction="row" align="center" gap={2}>
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: stageColor({
                                color: null,
                                stageType: b.stageType,
                              }),
                            }}
                          />
                          <Text size="sm" weight="medium">
                            {b.stageName}
                          </Text>
                          <Badge variant="outline" className="text-xs">
                            {b.count}
                          </Badge>
                        </Stack>
                        <Text size="sm" variant="muted" className="tabular-nums">
                          ${b.totalValue.toLocaleString()}
                        </Text>
                      </Stack>
                      <div className="h-2 rounded-full bg-[var(--color-surface-subtle)]">
                        <div
                          className="h-full rounded-full bg-[var(--module-active)]"
                          style={{ width: `${(b.count / max) * 100}%` }}
                        />
                      </div>
                    </Stack>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              <Stack direction="row" align="center" gap={2}>
                <Users className="h-4 w-4" /> Win/loss by rep
              </Stack>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {winLoss.length === 0 ? (
              <Text size="sm" variant="muted">
                No assigned-rep data yet.
              </Text>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rep</TableHead>
                    <TableHead className="text-right">Won</TableHead>
                    <TableHead className="text-right">Lost</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Win rate</TableHead>
                    <TableHead className="text-right">Won value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {winLoss.map((r, idx) => (
                    <TableRow key={r.repId ?? `unassigned-${idx}`}>
                      <TableCell>
                        {r.repId ? (
                          <code className="text-xs">{r.repId.slice(0, 8)}</code>
                        ) : (
                          <Text size="sm" variant="muted">
                            Unassigned
                          </Text>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.won}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.lost}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.open}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(r.winRate * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${r.totalWonValue.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer acquisition (last 12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap={2}>
              {acquisition.map((p) => (
                <Stack key={p.month} gap={1}>
                  <Stack direction="row" justify="between">
                    <Text size="sm">{p.month}</Text>
                    <Text size="sm" className="tabular-nums">
                      {p.newCustomers}
                    </Text>
                  </Stack>
                  <div className="h-1.5 rounded-full bg-[var(--color-surface-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--module-active)]"
                      style={{
                        width: `${
                          maxAcquisition > 0 ? (p.newCustomers / maxAcquisition) * 100 : 0
                        }%`,
                      }}
                    />
                  </div>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {snapshot.overdueTasks > 0 && (
          <Card variant="module">
            <CardContent>
              <Stack direction="row" align="center" gap={3}>
                <AlertCircle className="h-5 w-5 text-[var(--color-warning-500)]" />
                <Stack gap={1} className="flex-1">
                  <Text weight="medium">{snapshot.overdueTasks} overdue tasks across the team</Text>
                  <Text size="sm" variant="muted">
                    <Link href="/crm/tasks?scope=all" className="hover:underline">
                      Review and reassign →
                    </Link>
                  </Text>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
