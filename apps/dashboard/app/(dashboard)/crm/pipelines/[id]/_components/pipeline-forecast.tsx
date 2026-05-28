// Pipeline forecast view — weighted pipeline value by expected-close
// month, computed by dealService.forecast (which the MCP get_forecast tool
// also wraps, so REST/UI/AI all see identical numbers).

import { requireSession } from '@sparx/auth';
import { dealService } from '@sparx/crm';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

interface PipelineForecastProps {
  pipelineId: string;
}

export async function PipelineForecast({ pipelineId }: PipelineForecastProps) {
  const session = await requireSession();
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const result = await dealService.forecast(ctx, { pipelineId });
  const maxBucket = result.buckets.reduce((m, b) => Math.max(m, b.weightedValue), 0);

  return (
    <Stack gap={4}>
      <Stack direction="row" gap={4} wrap>
        <Card variant="module" className="min-w-[200px]">
          <CardContent className="py-4">
            <Stat label="Total weighted" value={`$${result.totalWeighted.toLocaleString()}`} />
          </CardContent>
        </Card>
        <Card className="min-w-[200px]">
          <CardContent className="py-4">
            <Stat label="Window" value={`${result.startMonth} → ${result.endMonth}`} />
          </CardContent>
        </Card>
        <Card className="min-w-[200px]">
          <CardContent className="py-4">
            <Stat
              label="Closed-won (window)"
              value={`$${result.buckets
                .reduce((s, b) => s + b.closedWonValue, 0)
                .toLocaleString()}`}
            />
          </CardContent>
        </Card>
      </Stack>

      <Card padding="none">
        <CardHeader>
          <CardTitle>Forecast by month</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap={3}>
            {result.buckets.map((b) => (
              <Stack key={b.month} gap={1}>
                <Stack direction="row" justify="between" align="center">
                  <Stack direction="row" align="center" gap={2}>
                    <Text size="sm" weight="medium">
                      {b.month}
                    </Text>
                    <Badge variant="outline" className="text-xs">
                      {b.dealCount} deal{b.dealCount === 1 ? '' : 's'}
                    </Badge>
                  </Stack>
                  <Text size="sm" className="tabular-nums">
                    ${b.weightedValue.toLocaleString()}
                  </Text>
                </Stack>
                <div className="h-2 rounded-full bg-[var(--color-surface-subtle)]">
                  <div
                    className="h-full rounded-full bg-[var(--module-active)]"
                    style={{
                      width: `${maxBucket > 0 ? (b.weightedValue / maxBucket) * 100 : 0}%`,
                    }}
                  />
                </div>
                {b.closedWonValue > 0 && (
                  <Text size="xs" variant="muted">
                    Closed-won: ${b.closedWonValue.toLocaleString()}
                  </Text>
                )}
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card padding="none">
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Open (weighted)</TableHead>
                <TableHead className="text-right">Closed-won</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.buckets.map((b) => (
                <TableRow key={b.month}>
                  <TableCell>{b.month}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.dealCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${b.openValue.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${b.closedWonValue.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${b.weightedValue.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
