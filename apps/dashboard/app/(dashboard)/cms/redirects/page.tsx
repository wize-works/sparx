import { Badge, Container, PageHeader, Stack } from '@sparx/ui';
import { api } from '@/lib/api-rest-client';
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
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="Redirects"
          badge={<Badge variant="outline">{redirects.length}</Badge>}
          description="Forward old URLs to new ones. Loops and chains over 8 hops are rejected at insert."
        />
        <RedirectsList rows={redirects} />
      </Stack>
    </Container>
  );
}
