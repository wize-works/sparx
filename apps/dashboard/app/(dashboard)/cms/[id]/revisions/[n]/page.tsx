// Side-by-side diff of a historical revision against the current entry.
//
// Title + SEO fields render as a "before / after" pair with inline cues
// when they differ. The body is harder to diff char-by-char (it's a
// nested TipTap doc), so we render both bodies through the cms-editor
// sanitizing serializer and let the eye compare them. Restore lives on
// the same page so the editor can review then act in one step.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { renderDocToHtml } from '@sparx/cms-editor';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  Grid,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { CmsTabs } from '../../../_components/cms-tabs';
import { RestoreButton } from '../restore-button';

export const dynamic = 'force-dynamic';

interface RevisionFull {
  revision_number: number;
  kind: 'autosave' | 'manual';
  status: string;
  summary: string | null;
  author_id: string | null;
  created_at: string;
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
}

interface CurrentEntry {
  id: string;
  slug: string | null;
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
  status: string;
  updated_at: string;
}

interface PageParams {
  params: Promise<{ id: string; n: string }>;
}

export default async function RevisionDiffPage({ params }: PageParams) {
  const { id, n } = await params;
  const revisionNumber = Number.parseInt(n, 10);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) notFound();

  let revision: RevisionFull;
  let current: CurrentEntry;
  try {
    [revision, current] = await Promise.all([
      api.get<RevisionFull>(`/v1/content/entries/${id}/revisions/${revisionNumber}`),
      api.get<CurrentEntry>(`/v1/content/entries/${id}`),
    ]);
  } catch (err) {
    if ((err as ApiRestError).status === 404) notFound();
    throw err;
  }

  const revBody = revision.body;
  const curBody = current.body;
  const revTitle = typeof revBody.title === 'string' ? revBody.title : '';
  const curTitle = typeof curBody.title === 'string' ? curBody.title : '';
  const revDoc =
    revBody.body && typeof revBody.body === 'object'
      ? (revBody.body as { type: string; content?: unknown[] })
      : { type: 'doc', content: [] };
  const curDoc =
    curBody.body && typeof curBody.body === 'object'
      ? (curBody.body as { type: string; content?: unknown[] })
      : { type: 'doc', content: [] };

  const revHtml = renderDocToHtml(revDoc);
  const curHtml = renderDocToHtml(curDoc);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CmsTabs current="pages" />
        <Stack gap={2}>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href={`/cms/${id}/revisions`}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to revisions
            </Link>
          </Button>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1}>Revision #{revision.revision_number}</Heading>
            <Badge color={revision.kind === 'manual' ? 'module' : 'outline'}>{revision.kind}</Badge>
            <Badge color={revision.status === 'published' ? 'success' : 'outline'}>
              {revision.status}
            </Badge>
          </Stack>
          <Text variant="muted">
            Saved{' '}
            {new Date(revision.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {revision.summary ? ` — ${revision.summary}` : ''}
          </Text>
          <Stack direction="row" align="center" gap={2}>
            <RestoreButton entryId={id} revisionNumber={revision.revision_number} />
          </Stack>
        </Stack>

        <FieldDiff label="Title" revision={revTitle} current={curTitle} />

        <SeoDiff revision={revision.seo} current={current.seo} />

        <Card variant="module">
          <CardHeader>
            <Stack direction="row" align="center" gap={2}>
              <Heading level={3}>Body</Heading>
              {revHtml === curHtml ? (
                <Badge variant="outline">unchanged</Badge>
              ) : (
                <Badge color="module">changed</Badge>
              )}
            </Stack>
          </CardHeader>
          <CardContent>
            {revHtml === curHtml ? (
              <Text variant="muted">
                The body is identical between this revision and the current entry.
              </Text>
            ) : (
              <Grid cols={1} mdCols={2} gap={6}>
                <BodyPanel title={`Revision #${revision.revision_number}`} html={revHtml} />
                <BodyPanel title="Current" html={curHtml} />
              </Grid>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

function FieldDiff({
  label,
  revision,
  current,
}: {
  label: string;
  revision: string;
  current: string;
}) {
  const changed = revision !== current;
  return (
    <Card variant="module">
      <CardHeader>
        <Stack direction="row" align="center" gap={2}>
          <Heading level={4}>{label}</Heading>
          {changed ? (
            <Badge color="module">changed</Badge>
          ) : (
            <Badge variant="outline">unchanged</Badge>
          )}
        </Stack>
      </CardHeader>
      <CardContent>
        <Grid cols={1} mdCols={2} gap={6}>
          <Stack gap={1}>
            <Text size="xs" variant="muted">
              Revision
            </Text>
            <Text size="sm">{revision || <em>empty</em>}</Text>
          </Stack>
          <Stack gap={1}>
            <Text size="xs" variant="muted">
              Current
            </Text>
            <Text size="sm">{current || <em>empty</em>}</Text>
          </Stack>
        </Grid>
      </CardContent>
    </Card>
  );
}

function SeoDiff({
  revision,
  current,
}: {
  revision: Record<string, unknown>;
  current: Record<string, unknown>;
}) {
  const keys = ['title', 'description', 'canonical', 'robots', 'ogImage'] as const;
  const rows = keys.map((k) => ({
    key: k,
    rev: typeof revision[k] === 'string' ? revision[k] : '',
    cur: typeof current[k] === 'string' ? current[k] : '',
  }));
  const anyChanged = rows.some((r) => r.rev !== r.cur);

  const changedRows = rows.filter((r) => r.rev !== r.cur);
  const unchangedRows = rows.filter((r) => r.rev === r.cur);

  return (
    <Card variant="module">
      <CardHeader>
        <Stack direction="row" align="center" gap={2}>
          <Heading level={4}>SEO</Heading>
          {anyChanged ? (
            <Badge color="module">{changedRows.length} changed</Badge>
          ) : (
            <Badge variant="outline">unchanged</Badge>
          )}
        </Stack>
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          {changedRows.map(({ key, rev, cur }) => (
            <SeoDiffRow key={key} fieldKey={key} rev={rev} cur={cur} />
          ))}
          {unchangedRows.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-[var(--color-text-muted)]">
                Show {unchangedRows.length} unchanged{' '}
                {unchangedRows.length === 1 ? 'field' : 'fields'}
              </summary>
              <Stack gap={3} className="pt-3">
                {unchangedRows.map(({ key, rev, cur }) => (
                  <SeoDiffRow key={key} fieldKey={key} rev={rev} cur={cur} />
                ))}
              </Stack>
            </details>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SeoDiffRow({ fieldKey, rev, cur }: { fieldKey: string; rev: string; cur: string }) {
  return (
    <Grid
      cols={1}
      mdCols={3}
      gap={4}
      className="border-b border-[var(--color-border-default)] pb-2"
    >
      <Text size="sm">{fieldKey}</Text>
      <Text size="sm" className="font-mono break-all">
        {rev || <em>empty</em>}
      </Text>
      <Text size="sm" className="font-mono break-all">
        {cur || <em>empty</em>}
      </Text>
    </Grid>
  );
}

function BodyPanel({ title, html }: { title: string; html: string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" variant="muted">
        {title}
      </Text>
      <div
        className="sparx-content max-h-[600px] min-h-[200px] overflow-auto rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Stack>
  );
}
