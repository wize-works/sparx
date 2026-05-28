import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Grid,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { FileText, Plus } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from './_components/cms-tabs';

export const dynamic = 'force-dynamic';

interface ApiEntry {
  id: string;
  slug: string | null;
  status: string;
  body: { title?: string } & Record<string, unknown>;
  updated_at: string;
}

export default async function CmsPage() {
  const entries = await api.get<ApiEntry[]>('/v1/content/entries?type=page&limit=100');

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CmsTabs current="pages" />
        <Stack direction="row" align="end" justify="between">
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <FileText className="h-5 w-5" />
              <Heading level={1}>CMS</Heading>
              <Badge variant="module">teal active</Badge>
            </Stack>
            <Text variant="muted">
              Pages, landing pages, and policy content for your storefront.
            </Text>
          </Stack>
          <Button asChild variant="module" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/cms/new">New page</Link>
          </Button>
        </Stack>

        {entries.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No pages yet"
              description="Create your first page to start building out your store."
              action={
                <Button asChild>
                  <Link href="/cms/new">Create a page</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {entries.map((e) => (
              <Card key={e.id} variant="module">
                <CardHeader>
                  <CardDescription>/{e.slug ?? ''}</CardDescription>
                  <CardTitle>{e.body.title ?? '(untitled)'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Stack direction="row" align="center" gap={2}>
                    <Badge variant={e.status === 'published' ? 'success' : 'outline'}>
                      {e.status}
                    </Badge>
                    <Text size="xs" variant="muted">
                      Updated {new Date(e.updated_at).toLocaleDateString()}
                    </Text>
                  </Stack>
                </CardContent>
                <CardFooter>
                  <Button variant="module-outline" size="sm" asChild>
                    <Link href={`/cms/${e.id}`}>Edit</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
