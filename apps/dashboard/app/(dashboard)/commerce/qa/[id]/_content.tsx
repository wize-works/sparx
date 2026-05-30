import { notFound } from 'next/navigation';
import { PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
import { Badge, Card, CardContent, CardDescription, CardHeader, Heading, Stack, Text } from '@sparx/ui';

import { ModuleStub } from '../../../../../components/module-stub';

import { AnswerForm } from './_components/answer-form';
import { QuestionModerateActions } from './_components/question-moderate-actions';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

export async function QuestionDetailContent({ id }: Props) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to manage Q&A."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const detail = await withTenant(ctx, async (tx) => {
    return tx.productQuestion.findFirst({
      where: { id },
      include: { answers: { orderBy: [{ isOfficial: 'desc' }, { createdAt: 'asc' }] } },
    });
  });
  if (!detail) notFound();

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
              {detail.displayName ?? (detail.customerId ? 'Customer' : 'Anonymous')} ·{' '}
              {new Date(detail.createdAt).toLocaleString()}
            </Text>
          </Stack>
        </Stack>
        <QuestionModerateActions questionId={detail.id} status={detail.status} />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Question body</Heading>
            <CardDescription>Product: {detail.productId.slice(0, 8)}</CardDescription>
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
