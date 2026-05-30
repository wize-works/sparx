import { requireSession } from '@sparx/auth';
import { api } from '@/lib/api-rest-client';
import { OnboardingWizard } from './_components/onboarding-wizard';
import type { OnboardingCompleted, OnboardingStepKey } from './_lib/types';

// Entry point for the guided 5-step setup. Reads the saved onboarding state +
// tenant basics once (both un-gated tenant endpoints — safe even before any
// module is enabled) and hands them to the client wizard, which resumes at the
// persisted `currentStep`. Module-gated reads (theme catalog) are deferred to
// the theme step, which loads them only after step 1 enables the modules.
export const dynamic = 'force-dynamic';

interface OnboardingStateDto {
  currentStep: OnboardingStepKey;
  category: string | null;
  completed: OnboardingCompleted;
  finishedAt: string | null;
}

export default async function OnboardingPage() {
  await requireSession();

  const [tenant, state] = await Promise.all([
    api.get<{ name: string; slug: string }>('/v1/tenant'),
    api.get<OnboardingStateDto>('/v1/tenant/onboarding'),
  ]);

  return (
    <OnboardingWizard
      initial={{
        step: state.currentStep,
        storeName: tenant.name ?? '',
        category: state.category,
        slug: tenant.slug ?? '',
        completed: state.completed,
      }}
    />
  );
}
