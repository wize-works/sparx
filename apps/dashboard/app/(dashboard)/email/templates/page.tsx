import Link from 'next/link';
import { LayoutTemplate, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Grid,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EmailShell } from '../_components/email-shell';
import type { TemplateListResponse } from '../_lib/types';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const { builtins, authored } = await api.get<TemplateListResponse>('/v1/email/templates');

  return (
    <EmailShell
      width="full"
      icon={<LayoutTemplate className="h-5 w-5" />}
      title="Templates"
      description="Built-in transactional templates and your own marketing templates."
      actions={
        <Button color="module" size="sm" asChild>
          <Link href="/email/templates/new">
            <Plus className="h-4 w-4" />
            New template
          </Link>
        </Button>
      }
    >
      <Stack gap={3}>
        <Heading level={3}>Transactional</Heading>
        <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
          {builtins.map((t) => (
            <Card key={t.key} variant="module">
              <CardHeader>
                <Stack direction="row" align="center" justify="between" gap={2}>
                  <CardTitle>{t.name}</CardTitle>
                  {t.customized ? <Badge color="primary">Customized</Badge> : null}
                </Stack>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Stack gap={2}>
                  <Text size="sm" variant="muted">
                    Subject: {t.subject}
                  </Text>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/email/templates/builtin/${t.key}`}>Customize</Link>
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Grid>
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>Marketing</Heading>
        {authored.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate className="h-5 w-5" />}
            title="No marketing templates yet"
            description="Author a reusable marketing template to drop into broadcasts."
          />
        ) : (
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {authored.map((t) => (
              <Card key={t.id} variant="module">
                <CardHeader>
                  <Stack direction="row" align="center" justify="between" gap={2}>
                    <CardTitle>{t.name}</CardTitle>
                    <Badge color={t.status === 'active' ? 'success' : 'outline'}>{t.status}</Badge>
                  </Stack>
                  <CardDescription>Subject: {t.subject}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/email/templates/${t.id}`}>Edit</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </EmailShell>
  );
}
