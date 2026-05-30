'use client';

import * as React from 'react';
import { Card, Heading, Stack, Stepper, Text } from '@sparx/ui';
import { goToStepAction } from '../_lib/actions';
import type { OnboardingStepKey, WizardInitialState } from '../_lib/types';
import { StepBusiness } from './step-business';
import { StepTheme } from './step-theme';
import { StepProduct } from './step-product';
import { StepDomain } from './step-domain';
import { StepPayments } from './step-payments';
import { StepDone } from './step-done';

// Step order is the single source for "next"/"back" math and the Stepper index.
// `done` is terminal and not shown as a Stepper node.
const ORDER: OnboardingStepKey[] = ['business', 'theme', 'product', 'domain', 'payments', 'done'];

const STEPPER_STEPS = [
  { label: 'Business', description: 'Name & category' },
  { label: 'Theme', description: 'Pick a look' },
  { label: 'Product', description: 'Add your first' },
  { label: 'Domain', description: 'Your address' },
  { label: 'Payments', description: 'Get paid' },
];

/** Each step receives a uniform navigation contract. */
export interface StepNav {
  /** Advance to the next step (client-only — the completing action already
   *  persisted `currentStep`). */
  onNext: () => void;
  /** Skip this step without completing it (persists + advances). */
  onSkip: () => void;
  /** Go back one step (persists + advances). */
  onBack: () => void;
  /** True while a persist-and-navigate transition is in flight. */
  navPending: boolean;
}

export function OnboardingWizard({ initial }: { initial: WizardInitialState }) {
  const [step, setStep] = React.useState<OnboardingStepKey>(initial.step);
  const [navPending, startNav] = React.useTransition();

  const idx = Math.max(0, ORDER.indexOf(step));
  const prevStep = ORDER[Math.max(idx - 1, 0)] ?? 'business';

  const goClient = React.useCallback((target: OnboardingStepKey) => setStep(target), []);

  // Persist `currentStep` then move — used by Skip/Back where no step action ran.
  const goPersist = React.useCallback(
    (target: OnboardingStepKey) => {
      startNav(async () => {
        await goToStepAction(target);
        setStep(target);
      });
    },
    [startNav]
  );

  const nav = (target: OnboardingStepKey): StepNav => ({
    onNext: () => goClient(target),
    onSkip: () => goPersist(target),
    onBack: () => goPersist(prevStep),
    navPending,
  });

  if (step === 'done') {
    return <StepDone slug={initial.slug} />;
  }

  return (
    <Stack gap={8}>
      <Stack gap={2}>
        <Heading level={1}>Set up your store</Heading>
        <Text variant="muted">
          Five quick steps to a live storefront. Everything here can be changed later.
        </Text>
      </Stack>

      <Stepper steps={STEPPER_STEPS} current={idx} />

      <Card padding="lg">
        {step === 'business' && (
          <StepBusiness
            initialName={initial.storeName}
            initialCategory={initial.category}
            nav={nav('theme')}
          />
        )}
        {step === 'theme' && <StepTheme nav={nav('product')} />}
        {step === 'product' && <StepProduct nav={nav('domain')} />}
        {step === 'domain' && <StepDomain initialSlug={initial.slug} nav={nav('payments')} />}
        {step === 'payments' && <StepPayments nav={nav('done')} />}
      </Card>
    </Stack>
  );
}
