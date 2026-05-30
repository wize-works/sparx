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
import type { CmsDoc } from '@sparx/cms-editor';

import { api, type ApiRestError } from '@/lib/api-rest-client';
import { AuthoredForm } from '../_components/authored-form';
import { PreviewFrame } from '../_components/preview-frame';
import type { AuthoredTemplateDetail, RenderedPreview } from '../../_lib/types';

export const dynamic = 'force-dynamic';

export default async function AuthoredTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail: AuthoredTemplateDetail;
  let preview: RenderedPreview;
  try {
    [detail, preview] = await Promise.all([
      api.get<AuthoredTemplateDetail>(`/v1/email/templates/${id}`),
      api.get<RenderedPreview>(`/v1/email/templates/${id}/preview`),
    ]);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const body = (detail.body as CmsDoc | null) ?? { type: 'doc', content: [] };

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Button variant="link" size="sm" asChild>
          <Link href="/email/templates">
            <ArrowLeft className="h-3.5 w-3.5" />
            Templates
          </Link>
        </Button>
        <Heading level={1}>{detail.name}</Heading>

        <Grid cols={1} lgCols={2} gap={6}>
          <Card>
            <CardHeader>
              <CardTitle>Edit</CardTitle>
            </CardHeader>
            <CardContent>
              <AuthoredForm
                initial={{
                  id: detail.id,
                  name: detail.name,
                  subject: detail.subject ?? '',
                  preheader: detail.preheader,
                  body,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <PreviewFrame html={preview.html} target={{ kind: 'authored', id }} />
            </CardContent>
          </Card>
        </Grid>
      </Stack>
    </Container>
  );
}
