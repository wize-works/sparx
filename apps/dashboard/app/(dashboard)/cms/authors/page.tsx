import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { Pencil, Users } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from '../_components/cms-tabs';
import { AuthorCreateForm } from './author-create-form';

export const dynamic = 'force-dynamic';

interface ApiAuthor {
  id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  created_at: string;
}

export default async function AuthorsPage() {
  const authors = await api.get<ApiAuthor[]>('/v1/authors');

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="authors" />
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1}>Authors</Heading>
            <Badge variant="outline">{authors.length}</Badge>
          </Stack>
          <Text variant="muted">
            Bylines for blog posts and editorial entries. An author is independent from a staff user
            — a user can write under multiple pen names, an author can outlive a user row.
          </Text>
        </Stack>

        <AuthorCreateForm />

        <Card variant="module">
          <CardHeader>
            <Heading level={3}>Existing authors</Heading>
            <CardDescription>Click an author to edit name, slug, and bio.</CardDescription>
          </CardHeader>
          <CardContent>
            {authors.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No authors yet"
                description="Add your first author above to start attributing blog posts and editorial entries."
              />
            ) : (
              <Stack gap={2}>
                {authors.map((a) => (
                  <Stack
                    key={a.id}
                    direction="row"
                    align="center"
                    justify="between"
                    className="rounded-md border border-[var(--color-border-default)] px-3 py-2"
                  >
                    <Stack gap={0}>
                      <Text size="sm">{a.display_name}</Text>
                      <Text size="xs" variant="muted">
                        /{a.slug}
                        {a.bio ? ` · ${a.bio.slice(0, 80)}${a.bio.length > 80 ? '…' : ''}` : ''}
                      </Text>
                    </Stack>
                    <Button
                      asChild
                      variant="ghost"
                      size="xs"
                      leftIcon={<Pencil className="h-3 w-3" />}
                    >
                      <Link href={`/cms/authors/${a.id}`}>Edit</Link>
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
