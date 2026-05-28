// Pipeline list view — flat table of every open deal in the pipeline,
// sortable by stage / value / close date. Server component; re-fetches on
// each view switch.

import Link from 'next/link';

import { requireSession } from '@sparx/auth';
import { dealService, pipelineService } from '@sparx/crm';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { stageColor } from './kanban-types';

interface PipelineListProps {
  pipelineId: string;
}

export async function PipelineList({ pipelineId }: PipelineListProps) {
  const session = await requireSession();
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [{ items: deals }, pipeline] = await Promise.all([
    dealService.list(ctx, { pipelineId, take: 250 }),
    pipelineService.get(ctx, pipelineId),
  ]);
  const stagesById = new Map(pipeline.stages.map((s) => [s.id, s]));

  if (deals.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          title="No deals yet"
          description="Create a deal to start tracking opportunities through this pipeline."
        />
      </Card>
    );
  }

  return (
    <Card padding="none">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Probability</TableHead>
              <TableHead>Expected close</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((d) => {
              const stage = stagesById.get(d.stageId);
              return (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link
                      href={`/crm/deals/${d.id}`}
                      className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                    >
                      {d.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {stage && (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: stageColor(stage),
                          color: stageColor(stage),
                        }}
                      >
                        {stage.name}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.currency} {Number(d.value).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(d.probability)}%
                  </TableCell>
                  <TableCell>
                    <Text size="sm" variant="muted">
                      {d.expectedCloseDate ? d.expectedCloseDate.toLocaleDateString() : '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size="sm" variant="muted">
                      {d.updatedAt.toLocaleDateString()}
                    </Text>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
