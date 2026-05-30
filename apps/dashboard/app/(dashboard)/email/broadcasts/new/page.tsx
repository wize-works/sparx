import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  Heading,
  Stack,
} from '@sparx/ui';

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
        <Button variant="link" size="sm" asChild>
          <Link href="/email/broadcasts">
            <ArrowLeft className="h-3.5 w-3.5" />
            Broadcasts
          </Link>
        </Button>
        <Heading level={1}>New broadcast</Heading>

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
