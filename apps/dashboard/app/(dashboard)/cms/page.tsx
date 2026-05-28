import Link from 'next/link';
import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
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

export const dynamic = 'force-dynamic';

interface PageRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: Date;
}

async function loadPages(tenantId: string): Promise<PageRow[]> {
  return withTenant({ tenantId }, (tx) =>
    tx.page.findMany({
      select: { id: true, slug: true, title: true, status: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    })
  );
}

export default async function CmsPage() {
  const { user } = await requireSession();
  const pages = await loadPages(user.tenantId);

  return (
    <Container size="xl">
      <Stack gap={8} className="py-10">
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

        {pages.length === 0 ? (
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
            {pages.map((p) => (
              <Card key={p.id} variant="module">
                <CardHeader>
                  <CardDescription>/{p.slug}</CardDescription>
                  <CardTitle>{p.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Stack direction="row" align="center" gap={2}>
                    <Badge variant={p.status === 'published' ? 'success' : 'outline'}>
                      {p.status}
                    </Badge>
                    <Text size="xs" variant="muted">
                      Updated {p.updatedAt.toLocaleDateString()}
                    </Text>
                  </Stack>
                </CardContent>
                <CardFooter>
                  <Button variant="module-outline" size="sm" asChild>
                    <Link href={`/cms/${p.id}`}>Edit</Link>
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
