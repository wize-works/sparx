'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Code,
  Container,
  Grid,
  Heading,
  Stack,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@sparx/ui';
import { FileText } from 'lucide-react';

const PAGES = [
  { slug: 'home', title: 'Home', status: 'published', views: '12.4k' },
  { slug: 'about', title: 'About us', status: 'published', views: '3.2k' },
  { slug: 'pricing', title: 'Pricing', status: 'draft', views: '—' },
  { slug: 'b2b', title: 'Wholesale program', status: 'published', views: '824' },
];

export default function CmsPage() {
  const [draftsOnly, setDraftsOnly] = React.useState(false);
  const visible = draftsOnly ? PAGES.filter((p) => p.status === 'draft') : PAGES;

  return (
    <Container size="xl">
      <Stack gap={8} className="py-10">
        <Stack direction="row" align="center" justify="between">
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <FileText className="h-5 w-5" />
              <Heading level={1}>CMS</Heading>
              <Badge variant="module">teal active</Badge>
            </Stack>
            <Text variant="muted">
              Everything in this route is wrapped in{' '}
              <Code>&lt;ModuleProvider module=&quot;cms&quot;&gt;</Code>. Watch the buttons, badge,
              card stripes, and active tab indicator turn teal.
            </Text>
          </Stack>
          <Stack direction="row" align="center" gap={3}>
            <Text size="sm" variant="muted">Drafts only</Text>
            <Switch checked={draftsOnly} onCheckedChange={setDraftsOnly} />
          </Stack>
        </Stack>

        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="blog">Blog</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
          </TabsList>

          <TabsContent value="pages">
            <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
              {visible.map((p) => (
                <Card key={p.slug} variant="module">
                  <CardHeader>
                    <CardDescription>/{p.slug}</CardDescription>
                    <CardTitle>{p.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Stack direction="row" align="center" gap={2}>
                      <Badge variant={p.status === 'published' ? 'success' : 'outline'}>
                        {p.status}
                      </Badge>
                      <Text size="xs" variant="muted">{p.views} views</Text>
                    </Stack>
                  </CardContent>
                  <CardFooter>
                    <Button variant="module-outline" size="sm">
                      Edit
                    </Button>
                    <Button variant="module" size="sm">
                      View
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </Grid>
          </TabsContent>

          <TabsContent value="blog">
            <Text variant="muted">Blog list goes here.</Text>
          </TabsContent>

          <TabsContent value="media">
            <Text variant="muted">Media library goes here.</Text>
          </TabsContent>
        </Tabs>
      </Stack>
    </Container>
  );
}
