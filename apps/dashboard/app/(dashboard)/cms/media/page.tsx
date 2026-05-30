import Link from 'next/link';
import {
  Badge,
  Card,
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
import { Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/api-rest-client';
import { EntityRowLink } from '../../_components/entity-row-link';
import { CmsTabs } from '../_components/cms-tabs';
import { UploadButton } from './upload-button';

export const dynamic = 'force-dynamic';

interface MediaAsset {
  id: string;
  key: string;
  original_filename: string;
  mime_type: string;
  byte_size: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  dominant_color: string | null;
  status: string;
  alt_text: string | null;
  usage_count: number;
  variants: { id: string; format: string; width: number; url: string }[];
  original_url: string | null;
  updated_at: string;
}

export default async function MediaPage() {
  const assets = await api.get<MediaAsset[]>('/v1/media/assets?limit=100');

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CmsTabs current="media" />
        <Stack direction="row" align="end" justify="between">
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <ImageIcon className="h-5 w-5" />
              <Heading level={1}>Media library</Heading>
              <Badge variant="outline">{assets.length}</Badge>
            </Stack>
            <Text variant="muted">
              Images, video, and other files used across your pages and posts.
            </Text>
          </Stack>
          <UploadButton />
        </Stack>

        {assets.length === 100 && (
          <Text size="xs" variant="muted" role="note">
            Showing the 100 most recently updated assets. Search + sort + cursor pagination land in
            a follow-up — until then, upload-sort / filter via the API or the assets pane on the
            content entry that uses each one.
          </Text>
        )}

        {assets.length === 0 ? (
          <Card variant="module" padding="none">
            <EmptyState
              icon={<ImageIcon className="h-5 w-5" />}
              title="No media yet"
              description="Upload your first image to start using it in pages and posts."
              action={<UploadButton />}
            />
          </Card>
        ) : (
          <Grid cols={2} mdCols={3} lgCols={4} gap={4}>
            {assets.map((a) => (
              <MediaCard key={a.id} asset={a} />
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}

function MediaCard({ asset }: { asset: MediaAsset }) {
  // Prefer the smallest WebP variant for the thumbnail; fall back to the
  // original (LocalStorage mode where no variants exist).
  const thumb =
    asset.variants.find((v) => v.format === 'webp')?.url ??
    asset.variants[0]?.url ??
    asset.original_url ??
    null;
  const isImage = asset.mime_type.startsWith('image/');

  return (
    <Card variant="module" padding="none">
      <EntityRowLink
        href={`/cms/media/${asset.id}`}
        entityType="media"
        entityId={asset.id}
        className="block"
      >
        <div
          className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[var(--color-bg-subtle)]"
          style={asset.dominant_color ? { backgroundColor: asset.dominant_color } : undefined}
        >
          {isImage && thumb ? (
            <img
              src={thumb}
              alt={asset.alt_text ?? asset.original_filename}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="h-10 w-10 text-[var(--color-text-muted)]" />
          )}
          {asset.status !== 'ready' && (
            <Badge
              variant={asset.status === 'failed' ? 'danger' : 'outline'}
              className="absolute top-2 right-2"
            >
              {asset.status}
            </Badge>
          )}
        </div>
      </EntityRowLink>
      <CardHeader>
        <CardTitle className="truncate text-sm">{asset.original_filename}</CardTitle>
        <CardDescription>
          {asset.width && asset.height
            ? `${asset.width}×${asset.height}`
            : asset.mime_type.split('/')[1]?.toUpperCase()}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Stack direction="row" align="center" gap={2} className="w-full">
          <Badge variant={asset.usage_count > 0 ? 'success' : 'outline'}>
            {asset.usage_count > 0 ? `Used ${asset.usage_count}×` : 'Unused'}
          </Badge>
          <Text size="xs" variant="muted" className="ml-auto">
            {formatBytes(Number(asset.byte_size))}
          </Text>
        </Stack>
      </CardFooter>
    </Card>
  );
}

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
