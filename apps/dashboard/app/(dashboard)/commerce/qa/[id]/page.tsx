import { Container, Stack } from '@sparx/ui';
import { QuestionDetailContent } from './_content';

export const dynamic = 'force-dynamic';

export default async function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <QuestionDetailContent id={id} />
      </Stack>
    </Container>
  );
}
