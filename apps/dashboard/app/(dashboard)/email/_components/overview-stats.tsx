// Server-rendered analytics summary for the Email Overview page — headline
// engagement tiles + recent activity, from /v1/email/analytics/overview.

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Grid,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  type BadgeProps,
} from '@sparx/ui';

import type { OverviewResult } from '../_lib/types';

function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

const EVENT_BADGE: Record<string, BadgeProps['color']> = {
  accepted: 'outline',
  delivered: 'success',
  opened: 'soft',
  clicked: 'module',
  bounced: 'danger',
  complained: 'danger',
  unsubscribed: 'warning',
  failed: 'danger',
};

export function OverviewStats({ overview }: { overview: OverviewResult }) {
  const { counts, suppressedTotal, recent, days } = overview;
  const tiles = [
    { label: 'Accepted', value: String(counts.accepted) },
    { label: 'Delivered', value: String(counts.delivered) },
    { label: 'Open rate', value: pct(counts.opened, counts.delivered) },
    { label: 'Click rate', value: pct(counts.clicked, counts.delivered) },
    { label: 'Bounced', value: String(counts.bounced) },
    { label: 'Suppressed', value: String(suppressedTotal) },
  ];

  return (
    <Stack gap={4}>
      <Card>
        <CardHeader>
          <CardTitle>Last {days} days</CardTitle>
        </CardHeader>
        <CardContent>
          <Grid cols={2} mdCols={3} lgCols={6} gap={4}>
            {tiles.map((t) => (
              <Stack key={t.label} gap={1}>
                <Heading level={2}>{t.value}</Heading>
                <Text size="sm" variant="muted">
                  {t.label}
                </Text>
              </Stack>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((e, i) => (
                  <TableRow key={`${e.recipient}-${e.occurredAt}-${i}`}>
                    <TableCell>
                      <Badge color={EVENT_BADGE[e.type] ?? 'outline'}>{e.type}</Badge>
                    </TableCell>
                    <TableCell>{e.recipient}</TableCell>
                    <TableCell>{new Date(e.occurredAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
