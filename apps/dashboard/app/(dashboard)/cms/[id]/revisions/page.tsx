import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';
import { GitCompare, History } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { RestoreButton } from './restore-button';

export const dynamic = 'force-dynamic';

interface RevisionMeta {
  revision_number: number;
  kind: 'autosave' | 'manual';
  status: string;
  summary: string | null;
  author_id: string | null;
  created_at: string;
}

interface EntryBasics {
  id: string;
  slug: string | null;
  body: { title?: string } & Record<string, unknown>;
  status: string;
}

export default async function RevisionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let entry: EntryBasics;
  let revisions: RevisionMeta[];
  try {
    [entry, revisions] = await Promise.all([
      api.get<EntryBasics>(`/v1/content/entries/${id}`),
      api.get<RevisionMeta[]>(`/v1/content/entries/${id}/revisions`),
    ]);
  } catch (err) {
    if ((err as ApiRestError).status === 404) notFound();
    throw err;
  }

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <PageHeader
            className="mb-0"
            icon={<History className="h-5 w-5" />}
            title="Revision history"
            badge={<Badge variant="outline">{revisions.length}</Badge>}
            description={
              <>
                Every save creates a revision. Click <strong>Restore</strong> to copy that
                revision&apos;s content back onto the current entry — your edits never disappear;
                restores create a fresh revision instead of overwriting history.
              </>
            }
          />
          <Text size="sm" variant="muted">
            Editing: <strong>{entry.body.title ?? '(untitled)'}</strong>
            {entry.slug && (
              <>
                {' '}
                <code>/{entry.slug}</code>
              </>
            )}
          </Text>
        </Stack>

        {revisions.length === 0 ? (
          <Card variant="module">
            <CardContent>
              <Text>No revisions yet. Save the entry to create the first one.</Text>
            </CardContent>
          </Card>
        ) : (
          <Stack gap={3}>
            {revisions.map((r) => (
              <Card key={r.revision_number} variant="module">
                <CardHeader>
                  <Stack direction="row" align="center" justify="between">
                    <Stack direction="row" align="center" gap={3}>
                      <Heading level={4}>#{r.revision_number}</Heading>
                      <Badge color={r.kind === 'manual' ? 'module' : 'outline'}>{r.kind}</Badge>
                      <Badge color={r.status === 'published' ? 'success' : 'outline'}>
                        {r.status}
                      </Badge>
                    </Stack>
                    <Stack direction="row" align="center" gap={2}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        asChild
                        leftIcon={<GitCompare className="h-3.5 w-3.5" />}
                      >
                        <Link href={`/cms/${id}/revisions/${r.revision_number}`}>Compare</Link>
                      </Button>
                      <RestoreButton entryId={id} revisionNumber={r.revision_number} />
                    </Stack>
                  </Stack>
                  <CardDescription>
                    {r.summary ?? 'Autosaved'} —{' '}
                    {new Date(r.created_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {r.author_id ? ` · author ${r.author_id.slice(0, 8)}` : ' · system'}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
