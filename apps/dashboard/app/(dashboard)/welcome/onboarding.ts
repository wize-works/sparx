import 'server-only';
import { api } from '@/lib/api-rest-client';

// Onboarding state used to live in `tenants.settings.onboarding` and was read
// through Prisma. It now goes through api-rest (`GET /v1/tenant/onboarding`,
// `PATCH /v1/tenant/onboarding`, `GET /v1/tenant/onboarding/progress`). The
// derivation of step completion from real domain data (pageCount, etc.) lives
// on the api-rest side so it stays in sync with whatever the future Pub/Sub
// onboarding workers compute.

export interface OnboardingState {
  /** User clicked "Skip" or finished — hide the welcome banner everywhere. */
  dismissed: boolean;
  /** ISO wall-clock timestamp the merchant landed on /welcome the first time. */
  startedAt: string | null;
  /** ISO timestamp when the user finished or dismissed onboarding. */
  finishedAt: string | null;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
  dismissed: false,
  startedAt: null,
  finishedAt: null,
};

export async function patchOnboarding(
  _tenantId: string,
  patch: Partial<OnboardingState>
): Promise<OnboardingState> {
  return api.patch<OnboardingState>('/v1/tenant/onboarding', patch);
}

export interface OnboardingProgress {
  state: OnboardingState;
  pageCount: number;
  /** Steps and whether each is satisfied. Order matters for the UI. */
  steps: OnboardingStep[];
  /** 0..1 — how much of the checklist is done. */
  completion: number;
}

export interface OnboardingStep {
  id: 'account' | 'tenant' | 'first-page' | 'theme' | 'domain' | 'payments';
  title: string;
  description: string;
  done: boolean;
  cta?: { label: string; href: string };
  comingSoon?: boolean;
}

export async function loadOnboardingProgress(_tenantId: string): Promise<OnboardingProgress> {
  return api.get<OnboardingProgress>('/v1/tenant/onboarding/progress');
}
