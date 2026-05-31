import { requireSession } from '@sparx/auth';
import { Badge, Container, Heading, Stack, Text } from '@sparx/ui';
import { loadOnboardingProgress } from './onboarding';
import { WelcomeChecklist } from './welcome-checklist';

export const dynamic = 'force-dynamic';

export default async function WelcomePage() {
  const { user } = await requireSession();
  const progress = await loadOnboardingProgress(user.tenantId);

  return (
    <Container size="lg">
      <Stack gap={8} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1}>Welcome to Sparx</Heading>
            {progress.state.finishedAt && <Badge color="success">All set</Badge>}
          </Stack>
          <Text variant="muted">
            A short checklist to get your store production-ready. You can skip and come back any
            time.
          </Text>
        </Stack>

        <WelcomeChecklist progress={progress} />
      </Stack>
    </Container>
  );
}
