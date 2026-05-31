import Link from 'next/link';
import { Plus, Send } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Grid,
  Stack,
  Text,
  type BadgeProps,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EmailShell } from '../_components/email-shell';
import type { BroadcastRow } from '../_lib/types';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<BroadcastRow['status'], BadgeProps['color']> = {
  draft: 'outline',
  scheduled: 'warning',
  sending: 'soft',
  sent: 'success',
  cancelled: 'default',
  failed: 'danger',
};

export default async function BroadcastsPage() {
  const broadcasts = await api.get<BroadcastRow[]>('/v1/email/broadcasts');

  return (
    <EmailShell
      icon={<Send className="h-5 w-5" />}
      title="Broadcasts"
      description="Segment-targeted marketing campaigns."
      actions={
        <Button color="module" size="sm" asChild>
          <Link href="/email/broadcasts/new">
            <Plus className="h-4 w-4" />
            New broadcast
          </Link>
        </Button>
      }
    >
      {broadcasts.length === 0 ? (
        <EmptyState
          icon={<Send className="h-5 w-5" />}
          title="No broadcasts yet"
          description="Compose a campaign, target a CRM segment, and send or schedule it."
        />
      ) : (
        <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
          {broadcasts.map((b) => (
            <Card key={b.id} variant="module">
              <CardHeader>
                <Stack direction="row" align="center" justify="between" gap={2}>
                  <CardTitle>{b.name}</CardTitle>
                  <Badge color={STATUS_BADGE[b.status]}>{b.status}</Badge>
                </Stack>
                <CardDescription>{b.subject}</CardDescription>
              </CardHeader>
              <CardContent>
                <Stack gap={2}>
                  {b.status === 'sent' || b.status === 'scheduled' ? (
                    <Text size="sm" variant="muted">
                      {b.recipientCount} recipient{b.recipientCount === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/email/broadcasts/${b.id}`}>Open</Link>
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Grid>
      )}
    </EmailShell>
  );
}
