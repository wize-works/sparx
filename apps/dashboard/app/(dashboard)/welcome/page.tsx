import { requireSession } from '@sparx/auth';
import { Badge, Container, PageHeader, Stack } from '@sparx/ui';
import { loadOnboardingProgress } from './onboarding';
import { WelcomeChecklist } from './welcome-checklist';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const { user } = await requireSession();
  const progress = await loadOnboardingProgress(user.tenantId);

  return (
    <Container size="lg">
      <Stack gap={8} className="py-10">
        <PageHeader
          title="Welcome to Sparx"
          badge={progress.state.finishedAt ? <Badge color="success">All set</Badge> : undefined}
          description="A short checklist to get your store production-ready. You can skip and come back any time."
        />

        <WelcomeChecklist progress={progress} />
      </Stack>
    </Container>
  );
}
