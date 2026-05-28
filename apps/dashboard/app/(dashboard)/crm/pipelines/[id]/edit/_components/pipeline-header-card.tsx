'use client';

// Pipeline header editor — name + default flag + archive action.
// Slug is immutable because the URL identifier should stay stable.

import * as React from 'react';
import { Archive } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Stack,
  Text,
} from '@sparx/ui';

export interface PipelineHeader {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  archivedAt: string | null;
}

interface PipelineHeaderCardProps {
  pipeline: PipelineHeader;
  onSave: (input: { name?: string; isDefault?: boolean }) => void;
  onArchive: () => void;
  pending: boolean;
}

export function PipelineHeaderCard({
  pipeline,
  onSave,
  onArchive,
  pending,
}: PipelineHeaderCardProps) {
  const [name, setName] = React.useState(pipeline.name);
  const [isDefault, setIsDefault] = React.useState(pipeline.isDefault);
  const dirty = name !== pipeline.name || isDefault !== pipeline.isDefault;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Header</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack gap={4}>
          <Stack direction="row" gap={4}>
            <Stack gap={2} className="flex-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Stack>
            <Stack gap={2} className="w-64">
              <Label>Slug</Label>
              <Input value={pipeline.slug} disabled />
              <Text size="xs" variant="muted">
                Slug is immutable to keep URLs stable.
              </Text>
            </Stack>
          </Stack>
          <Stack direction="row" align="center" gap={2}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4"
              id="isDefault-edit"
            />
            <Label htmlFor="isDefault-edit">Default pipeline</Label>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button
              variant="module"
              size="sm"
              disabled={!dirty || pending}
              onClick={() => onSave({ name, isDefault })}
            >
              Save header
            </Button>
            {!pipeline.archivedAt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onArchive}
                disabled={pending}
                leftIcon={<Archive className="h-3.5 w-3.5" />}
              >
                Archive pipeline
              </Button>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
