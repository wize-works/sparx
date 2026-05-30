// Pipeline list view — flat table of every open deal in the pipeline,
// sortable by stage / value / close date. Server component; re-fetches on
// each view switch.

import Link from 'next/link';

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

import { api } from '@/lib/api-rest-client';

import { stageColor } from './kanban-types';

interface PipelineStage {
  id: string;
  name: string;
  color: string | null;
  stageType: 'open' | 'won' | 'lost';
}

interface Pipeline {
  id: string;
  stages: PipelineStage[];
}

interface DealRow {
  id: string;
  title: string;
  stageId: string;
  currency: string;
  value: string | number;
  probability: string | number;
  expectedCloseDate: string | null;
  updatedAt: string;
}

interface PipelineListProps {
  pipelineId: string;
}

export async function PipelineList({ pipelineId }: PipelineListProps) {
  const [{ data: deals }, pipeline] = await Promise.all([
    api.getPaged<DealRow[]>(`/v1/crm/deals?pipeline_id=${pipelineId}&take=250`),
    api.get<Pipeline>(`/v1/crm/pipelines/${pipelineId}`),
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
                      {d.expectedCloseDate
                        ? new Date(d.expectedCloseDate).toLocaleDateString()
                        : '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size="sm" variant="muted">
                      {new Date(d.updatedAt).toLocaleDateString()}
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
