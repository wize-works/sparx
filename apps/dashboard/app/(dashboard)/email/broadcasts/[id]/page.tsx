import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  Grid,
  Heading,
  Stack,
  Text,
  type BadgeProps,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';
import { BroadcastActions } from './broadcast-actions';
import type { BroadcastRow, BroadcastStats } from '../../_lib/types';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<BroadcastRow['status'], BadgeProps['color']> = {
  draft: 'outline',
  scheduled: 'warning',
  sending: 'soft',
  sent: 'success',
  cancelled: 'default',
  failed: 'danger',
};

const STAT_LABELS: { key: keyof BroadcastStats; label: string }[] = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'opened', label: 'Opened' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'bounced', label: 'Bounced' },
  { key: 'complained', label: 'Complaints' },
  { key: 'unsubscribed', label: 'Unsubscribed' },
];

export default async function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let broadcast: BroadcastRow;
  try {
    broadcast = await api.get<BroadcastRow>(`/v1/email/broadcasts/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const stats =
    broadcast.status === 'sent' || broadcast.status === 'sending'
      ? await api.get<BroadcastStats>(`/v1/email/broadcasts/${id}/stats`).catch(() => null)
      : null;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Button color="primary" variant="link" size="sm" asChild>
          <Link href="/email/broadcasts">
            <ArrowLeft className="h-3.5 w-3.5" />
            Broadcasts
          </Link>
        </Button>

        <Stack direction="row" align="center" gap={3}>
          <Heading level={1}>{broadcast.name}</Heading>
          <Badge color={STATUS_BADGE[broadcast.status]}>{broadcast.status}</Badge>
        </Stack>
        <Text variant="muted">{broadcast.subject}</Text>

        {broadcast.status === 'draft' || broadcast.status === 'scheduled' ? (
          <Card>
            <CardHeader>
              <CardTitle>Send</CardTitle>
            </CardHeader>
            <CardContent>
              <BroadcastActions broadcast={broadcast} />
            </CardContent>
          </Card>
        ) : null}

        {stats ? (
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <Grid cols={2} mdCols={4} gap={4}>
                {STAT_LABELS.map(({ key, label }) => (
                  <Stack key={key} gap={1}>
                    <Heading level={2}>{stats[key]}</Heading>
                    <Text size="sm" variant="muted">
                      {label}
                    </Text>
                  </Stack>
                ))}
              </Grid>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </Container>
  );
}
