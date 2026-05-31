// Content type browser.
//
// Lists every content type the tenant can author, plus a count of entries
// per type. Built-ins (page, blog_post, module, feature, faq_item,
// editorial_section) are surfaced from api-rest's /v1/content/types; any
// custom merchant-defined types (Pro+ plan) appear here too.

import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  Grid,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';
import { Database, ArrowRight, Plus, Settings } from 'lucide-react';
import { api } from '@/lib/api-rest-client';

export const dynamic = 'force-dynamic';

interface ApiContentType {
  key: string;
  name: string;
  plural_name: string;
  url_pattern: string | null;
  is_built_in: boolean;
  is_singleton: boolean;
  description: string | null;
}

interface ApiEntry {
  id: string;
  type_key: string;
}

export default async function ContentTypesPage() {
  const [types, entries] = await Promise.all([
    api.get<ApiContentType[]>('/v1/content/types'),
    api.get<ApiEntry[]>('/v1/content/entries?limit=250'),
  ]);

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.type_key, (counts.get(e.type_key) ?? 0) + 1);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Database className="h-5 w-5" />}
          title="Content types"
          badge={<Badge variant="outline">{types.length}</Badge>}
          description="Authoring spaces for blog posts, modules, FAQs, editorial sections, and any custom merchant type. Pages have a dedicated tab; this view covers everything else."
          actions={
            <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/cms/types/new">New custom type</Link>
            </Button>
          }
        />

        <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
          {types
            .filter((t) => t.key !== 'page')
            .map((t) => {
              const count = counts.get(t.key) ?? 0;
              return (
                <Card key={t.key} variant="module">
                  <CardHeader>
                    <CardTitle>{t.plural_name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Stack gap={2}>
                      {t.description && (
                        <Text size="sm" variant="muted">
                          {t.description}
                        </Text>
                      )}
                      <Stack direction="row" align="center" gap={2}>
                        <Badge color={t.is_built_in ? 'outline' : 'default'}>
                          {t.is_built_in ? 'built-in' : 'custom'}
                        </Badge>
                        {t.is_singleton && <Badge variant="outline">singleton</Badge>}
                        <Text size="xs" variant="muted">
                          {count} entr{count === 1 ? 'y' : 'ies'}
                        </Text>
                      </Stack>
                    </Stack>
                  </CardContent>
                  <CardFooter>
                    <Stack direction="row" gap={2}>
                      <Button
                        asChild
                        color="module"
                        variant="outline"
                        size="sm"
                        rightIcon={<ArrowRight className="h-3 w-3" />}
                      >
                        <Link href={`/cms/types/${t.key}`}>Manage</Link>
                      </Button>
                      {!t.is_built_in && (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          leftIcon={<Settings className="h-3 w-3" />}
                        >
                          <Link href={`/cms/types/${t.key}/schema`}>Schema</Link>
                        </Button>
                      )}
                    </Stack>
                  </CardFooter>
                </Card>
              );
            })}
        </Grid>
      </Stack>
    </Container>
  );
}
