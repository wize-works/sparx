import { withTenant } from '@sparx/db';
import type { Prisma } from '@sparx/db';

// Onboarding state lives in `tenants.settings.onboarding` — a JSON column
// rather than a dedicated table since (a) it is per-tenant 1:1, (b) the
// shape will change every time we ship another onboarding step, and (c) no
// other table needs to join against it.
//
// Step completion is *derived* from real domain data wherever possible
// (first page, payments connected, etc.) so the user never needs to "tick a
// box" manually. The persisted shape only carries dismissal state and any
// step that has no DB analogue yet.

export interface OnboardingState {
  /** User clicked "Skip" or finished — hide the welcome banner everywhere. */
  dismissed: boolean;
  /** Wall-clock timestamp the merchant landed on /welcome the first time. */
  startedAt: string | null;
  /** When the user finished or dismissed onboarding. */
  finishedAt: string | null;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
  dismissed: false,
  startedAt: null,
  finishedAt: null,
};

export function readOnboarding(settings: Prisma.JsonValue): OnboardingState {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return DEFAULT_ONBOARDING;
  }
  const raw = (settings as Record<string, unknown>).onboarding;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return DEFAULT_ONBOARDING;
  }
  const rec = raw as Record<string, unknown>;
  return {
    dismissed: typeof rec.dismissed === 'boolean' ? rec.dismissed : false,
    startedAt: typeof rec.startedAt === 'string' ? rec.startedAt : null,
    finishedAt: typeof rec.finishedAt === 'string' ? rec.finishedAt : null,
  };
}

export async function patchOnboarding(
  tenantId: string,
  patch: Partial<OnboardingState>,
): Promise<OnboardingState> {
  return withTenant({ tenantId }, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const current = readOnboarding(tenant?.settings ?? null);
    const next = { ...current, ...patch };
    const settings = mergeSettings(tenant?.settings ?? null, { onboarding: next });

    await tx.tenant.update({
      where: { id: tenantId },
      data: { settings },
    });
    return next;
  });
}

function mergeSettings(
  current: Prisma.JsonValue,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    typeof current === 'object' && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
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

export async function loadOnboardingProgress(tenantId: string): Promise<OnboardingProgress> {
  return withTenant({ tenantId }, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true, name: true },
    });
    const pageCount = await tx.page.count();

    const state = readOnboarding(tenant?.settings ?? null);
    const steps: OnboardingStep[] = [
      {
        id: 'account',
        title: 'Create your account',
        description: 'Email, password, and store name.',
        done: true,
      },
      {
        id: 'tenant',
        title: 'Confirm your store details',
        description: 'Make sure the contact email and store name look right.',
        done: Boolean(tenant?.name),
        cta: { label: 'Open settings', href: '/settings/general' },
      },
      {
        id: 'first-page',
        title: 'Add your first page',
        description: 'About, Contact, or any landing page to get started.',
        done: pageCount > 0,
        cta: { label: 'Open CMS', href: '/cms' },
      },
      {
        id: 'theme',
        title: 'Pick a theme',
        description: 'Themes ship with the Sitebuilder module.',
        done: false,
        comingSoon: true,
      },
      {
        id: 'domain',
        title: 'Connect a custom domain',
        description: 'Use your wizeworks subdomain for now; bring your own later.',
        done: false,
        comingSoon: true,
      },
      {
        id: 'payments',
        title: 'Connect payments',
        description: 'Stripe Connect — required to take orders.',
        done: false,
        comingSoon: true,
      },
    ];

    const actionable = steps.filter((s) => !s.comingSoon);
    const completion = actionable.length
      ? actionable.filter((s) => s.done).length / actionable.length
      : 1;

    return { state, pageCount, steps, completion };
  });
}
