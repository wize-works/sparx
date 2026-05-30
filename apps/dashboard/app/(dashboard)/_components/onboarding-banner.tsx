import Link from 'next/link';
import { Badge, Button, Card, Heading, Stack, Text } from '@sparx/ui';
import { ArrowRight } from 'lucide-react';
import type { OnboardingProgress } from '../welcome/onboarding';

// Compact welcome banner shown on the dashboard home until the merchant
// either finishes every actionable step OR dismisses onboarding. If the guided
// wizard hasn't been finished yet, the CTA resumes it (/onboarding picks up at
// the saved step); once finished, it points at the day-0+ checklist (/welcome).

export interface OnboardingBannerProps {
  progress: OnboardingProgress;
}

export function OnboardingBanner({ progress }: OnboardingBannerProps) {
  if (progress.state.dismissed) return null;

  const actionable = progress.steps.filter((s) => !s.comingSoon);
  const done = actionable.filter((s) => s.done).length;
  if (done === actionable.length) return null;

  const pct = Math.round(progress.completion * 100);
  const wizardFinished = Boolean(progress.state.finishedAt);
  const cta = wizardFinished
    ? { href: '/welcome', label: 'Open checklist' }
    : { href: '/onboarding', label: 'Resume setup' };

  return (
    <Card variant="subtle">
      <Stack direction="row" align="center" justify="between" gap={4}>
        <Stack gap={1} className="flex-1">
          <Stack direction="row" align="center" gap={2}>
            <Heading level={3}>Finish setting up Sparx</Heading>
            <Badge variant="outline">
              {done} of {actionable.length} done
            </Badge>
          </Stack>
          <Text size="sm" variant="muted">
            A few quick steps to get your store production-ready ({pct}% complete).
          </Text>
        </Stack>
        <Button asChild rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      </Stack>
    </Card>
  );
}
