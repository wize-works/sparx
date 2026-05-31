import { Card, CardContent, CardHeader, CardTitle, Container, PageHeader, Stack } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { BroadcastComposer } from '../_components/broadcast-composer';
import type { SegmentOption, TemplateListResponse } from '../../_lib/types';

export const dynamic = 'force-dynamic';

export default async function NewBroadcastPage() {
  const [segments, templateList] = await Promise.all([
    api.get<SegmentOption[]>('/v1/crm/segments').catch(() => [] as SegmentOption[]),
    api.get<TemplateListResponse>('/v1/email/templates'),
  ]);

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader title="New broadcast" />

        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
          </CardHeader>
          <CardContent>
            <BroadcastComposer
              segments={segments.map((s) => ({ id: s.id, name: s.name }))}
              templates={templateList.authored}
            />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
