import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { ModerateActions } from './_components/moderate-actions';
import { RespondForm } from './_components/respond-form';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

interface ReviewDetail {
  id: string;
  productId: string;
  variantId: string | null;
  customerId: string | null;
  orderId: string | null;
  rating: number;
  title: string;
  body: string;
  displayName: string | null;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  response: string | null;
  respondedAt: string | null;
  mediaAssetIds: string[];
  createdAt: string;
}

export async function ReviewDetailContent({ id }: Props) {
  let review: ReviewDetail;
  try {
    review = await api.get<ReviewDetail>(`/v1/commerce/reviews/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={2}>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={2}>
            <Stars value={review.rating} />
            <Heading level={1}>{review.title}</Heading>
          </Stack>
          <Stack direction="row" gap={2} align="center">
            <Badge variant={statusVariant(review.status)}>{review.status}</Badge>
            {review.verifiedPurchase && <Badge variant="success">verified purchase</Badge>}
            <Text size="sm" variant="muted">
              {review.displayName ?? (review.customerId ? 'Customer' : 'Anonymous')} ·{' '}
              {new Date(review.createdAt).toLocaleString()}
            </Text>
          </Stack>
        </Stack>
        <ModerateActions reviewId={review.id} status={review.status} />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Review body</Heading>
            <CardDescription>
              On the storefront this renders alongside the product gallery + variant picker. The
              merchant response (below) is shown immediately under the review when present.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={3}>
            <Text className="whitespace-pre-wrap">{review.body}</Text>
            {review.mediaAssetIds.length > 0 && (
              <Stack direction="row" gap={2} wrap>
                {review.mediaAssetIds.map((mid) => (
                  <Text key={mid} size="xs" className="font-mono" variant="muted">
                    {mid.slice(0, 8)}
                  </Text>
                ))}
              </Stack>
            )}
            <Stack direction="row" gap={4}>
              <Text size="xs" variant="muted">
                Helpful: {review.helpfulCount}
              </Text>
              <Text size="xs" variant="muted">
                Unhelpful: {review.unhelpfulCount}
              </Text>
              <Text size="xs" variant="muted">
                Product: {review.productId.slice(0, 8)}
              </Text>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Merchant response</Heading>
            <CardDescription>
              Public reply attributed to your team. Saving overwrites any previous response.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <RespondForm
            reviewId={review.id}
            initial={review.response}
            respondedAt={review.respondedAt}
          />
        </CardContent>
      </Card>
    </Stack>
  );
}

function statusVariant(
  status: 'pending' | 'approved' | 'rejected' | 'flagged'
): 'success' | 'warning' | 'outline' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'flagged') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'outline';
}

function Stars({ value }: { value: number }) {
  return (
    <Stack direction="row" gap={0} align="center">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= value
              ? 'h-4 w-4 fill-[var(--module-active)] text-[var(--module-active)]'
              : 'h-4 w-4 text-[var(--color-text-muted)]'
          }
        />
      ))}
    </Stack>
  );
}
