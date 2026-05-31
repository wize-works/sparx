'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardContent, CardHeader, Heading, Stack, Text } from '@sparx/ui';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { dismissOnboarding } from './actions';
import type { OnboardingProgress } from './onboarding';

export interface WelcomeChecklistProps {
  progress: OnboardingProgress;
}

export function WelcomeChecklist({ progress }: WelcomeChecklistProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const completionPct = Math.round(progress.completion * 100);

  function onSkip() {
    startTransition(async () => {
      await dismissOnboarding();
      router.push('/');
      router.refresh();
    });
  }

  return (
    <Stack gap={6}>
      <Card>
        <CardHeader>
          <Stack direction="row" align="center" justify="between">
            <Heading level={3}>Setup progress</Heading>
            <Text size="sm" variant="muted">
              {completionPct}% complete
            </Text>
          </Stack>
        </CardHeader>
        <CardContent>
          <ProgressBar value={progress.completion} />
        </CardContent>
      </Card>

      <Stack gap={3}>
        {progress.steps.map((step) => (
          <Card key={step.id}>
            <Stack direction="row" align="start" gap={3}>
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
              >
                {step.done ? (
                  <Check className="h-4 w-4 text-[var(--color-success-text)]" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </span>
              <Stack gap={1} className="flex-1">
                <Stack direction="row" align="center" gap={2}>
                  <Text weight="medium">{step.title}</Text>
                  {step.comingSoon && <Badge variant="outline">Coming soon</Badge>}
                  {step.done && !step.comingSoon && <Badge color="success">Done</Badge>}
                </Stack>
                <Text size="sm" variant="muted">
                  {step.description}
                </Text>
              </Stack>
              {step.cta && !step.done && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  <Link href={step.cta.href}>{step.cta.label}</Link>
                </Button>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>

      <Stack direction="row" align="center" justify="between">
        <Text size="sm" variant="muted">
          You can finish the rest from the dashboard anytime.
        </Text>
        <Stack direction="row" gap={2}>
          <Button variant="ghost" onClick={onSkip} disabled={pending}>
            Skip for now
          </Button>
          <Button asChild>
            <Link href="/">Go to dashboard</Link>
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]"
    >
      <div
        className="h-full bg-[var(--color-primary)] transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
