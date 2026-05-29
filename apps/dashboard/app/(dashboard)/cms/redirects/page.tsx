import { Badge, Container, Heading, Stack, Text } from '@sparx/ui';
import { api } from '@/lib/api-rest-client';
import { CmsTabs } from '../_components/cms-tabs';
import { RedirectsList } from './redirects-list';

export const dynamic = 'force-dynamic';

interface ApiRedirect {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  hit_count: number;
  created_at: string;
}

export default async function RedirectsPage() {
  const redirects = await api.get<ApiRedirect[]>('/v1/redirects');

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="redirects" />
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1}>Redirects</Heading>
            <Badge variant="outline">{redirects.length}</Badge>
          </Stack>
          <Text variant="muted">
            Forward old URLs to new ones. Loops and chains over 8 hops are rejected at insert.
          </Text>
        </Stack>
        <RedirectsList rows={redirects} />
      </Stack>
    </Container>
  );
}
