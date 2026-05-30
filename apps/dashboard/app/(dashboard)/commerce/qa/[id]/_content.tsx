import { notFound } from 'next/navigation';

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

import { AnswerForm } from './_components/answer-form';
import { QuestionModerateActions } from './_components/question-moderate-actions';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

interface AnswerRow {
  id: string;
  body: string;
  isOfficial: boolean;
  authorCustomerId: string | null;
  authorUserId: string | null;
  createdAt: string;
}

interface QuestionCustomer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface QuestionDetail {
  id: string;
  productId: string;
  body: string;
  status: string;
  createdAt: string;
  productTitle: string | null;
  productHandle: string | null;
  customer: QuestionCustomer | null;
  answers: AnswerRow[];
}

function displayCustomer(c: QuestionCustomer | null): string {
  if (!c) return 'Anonymous';
  const full = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return full !== '' ? full : (c.email ?? 'Customer');
}

export async function QuestionDetailContent({ id }: Props) {
  let detail: QuestionDetail;
  try {
    detail = await api.get<QuestionDetail>(`/v1/commerce/questions/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={2}>
        <Stack gap={1}>
          <Heading level={1}>Question</Heading>
          <Stack direction="row" gap={2} align="center">
            <Badge
              variant={
                detail.status === 'published'
                  ? 'success'
                  : detail.status === 'rejected'
                    ? 'danger'
                    : 'outline'
              }
            >
              {detail.status}
            </Badge>
            <Text size="sm" variant="muted">
              {displayCustomer(detail.customer)} · {new Date(detail.createdAt).toLocaleString()}
            </Text>
          </Stack>
        </Stack>
        <QuestionModerateActions questionId={detail.id} status={detail.status} />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Question body</Heading>
            <CardDescription>
              Product: {detail.productTitle ?? detail.productId.slice(0, 8)}
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Text className="whitespace-pre-wrap">{detail.body}</Text>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Answers</Heading>
            <CardDescription>
              Official answers are shown first on the storefront and carry a staff badge.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            {detail.answers.length === 0 ? (
              <Text variant="muted" size="sm">
                No answers yet — post the first one below.
              </Text>
            ) : (
              detail.answers.map((a) => (
                <Stack key={a.id} gap={1}>
                  <Stack direction="row" gap={2} align="center">
                    {a.isOfficial ? (
                      <Badge variant="success">staff</Badge>
                    ) : (
                      <Badge variant="outline">customer</Badge>
                    )}
                    <Text size="xs" variant="muted">
                      {new Date(a.createdAt).toLocaleString()}
                    </Text>
                  </Stack>
                  <Text className="whitespace-pre-wrap">{a.body}</Text>
                </Stack>
              ))
            )}
            <AnswerForm questionId={detail.id} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
