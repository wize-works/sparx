import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  Grid,
  Heading,
  Stack,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';
import { BuiltinEditor } from './builtin-editor';
import { PreviewFrame } from '../../_components/preview-frame';
import type { BuiltinTemplateView, RenderedPreview } from '../../../_lib/types';

export const dynamic = 'force-dynamic';

export default async function BuiltinTemplatePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  let view: BuiltinTemplateView;
  let preview: RenderedPreview;
  try {
    [view, preview] = await Promise.all([
      api.get<BuiltinTemplateView>(`/v1/email/templates/builtin/${key}`),
      api.get<RenderedPreview>(`/v1/email/templates/builtin/${key}/preview`),
    ]);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Button color="primary" variant="link" size="sm" asChild>
          <Link href="/email/templates">
            <ArrowLeft className="h-3.5 w-3.5" />
            Templates
          </Link>
        </Button>
        <Heading level={1}>{view.name}</Heading>

        <Grid cols={1} lgCols={2} gap={6}>
          <Card>
            <CardHeader>
              <CardTitle>Customize</CardTitle>
            </CardHeader>
            <CardContent>
              <BuiltinEditor view={view} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <PreviewFrame html={preview.html} target={{ kind: 'builtin', key }} />
            </CardContent>
          </Card>
        </Grid>
      </Stack>
    </Container>
  );
}
