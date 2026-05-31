import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';

import { cmsManifest } from '@sparx/cms-editor/manifest';
import {
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Heading,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';

import { OverviewChartCard, SAMPLE_CMS_PUBLISHING_8W } from '../_components/overview-charts';

// CMS overview — the module landing (docs/34 §4 Module Overview archetype).
// Publishing snapshot + section cards; the Pages list lives one level deeper
// at /cms/pages. Module gate runs in layout.tsx.

export const dynamic = 'force-dynamic';

// "Pages" leads; the rest of the surfaces come straight from the manifest so
// the overview and the panel nav never drift.
const PAGES_SECTION = { id: 'pages', label: 'Pages', href: '/cms/pages', icon: FileText };
const MANAGE = [
  PAGES_SECTION,
  ...cmsManifest.sections.filter((s) => s.href !== cmsManifest.routePrefix && s.id !== 'pages'),
];

export default function CmsOverviewPage() {
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          className="mb-0"
          icon={<FileText className="h-5 w-5" />}
          title="CMS"
          description="Pages, content types, media, and navigation for your storefront."
          actions={
            <Button asChild color="module" leftIcon={<Plus className="h-4 w-4" />}>
              <Link href="/cms/new">New page</Link>
            </Button>
          }
        />

        <OverviewChartCard
          title="Publishing"
          description="Pages published vs. drafts created, last 8 weeks"
          data={SAMPLE_CMS_PUBLISHING_8W}
          series={[
            { key: 'published', label: 'Published', color: 'module' },
            { key: 'drafts', label: 'Drafts' },
          ]}
          type="bar"
          format="number"
        />

        <Stack gap={4}>
          <Heading level={2}>Manage</Heading>
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {MANAGE.map((section) => {
              const Icon = section.icon;
              return (
                <Card key={section.id} variant="module">
                  <CardContent>
                    <Stack direction="row" gap={3} align="center">
                      <span className="text-[var(--module-active)]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <Link href={section.href} className="font-medium hover:underline">
                        {section.label}
                      </Link>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Grid>
          <Text size="xs" variant="muted">
            The publishing chart shows sample data until CMS reporting timeseries endpoints land.
          </Text>
        </Stack>
      </Stack>
    </Container>
  );
}
