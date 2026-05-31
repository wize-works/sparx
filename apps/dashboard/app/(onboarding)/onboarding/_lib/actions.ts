'use server';

import { revalidatePath } from 'next/cache';
import type { ThemePreset } from '@sparx/storefront-themes';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import type {
  OnboardingCompleted,
  OnboardingStepKey,
  SlugAvailability,
  WizardResult,
  WizardThemeOption,
} from './types';

// Server-action adapters for the onboarding wizard. Like the rest of the
// dashboard, every call goes through api-rest with the server-held JWT — the
// wizard islands never touch api-rest directly. Each step persists its result
// AND advances `currentStep` so the flow resumes where the merchant left off.

function fail(err: unknown): { ok: false; error: string } {
  const e = err as ApiRestError;
  return { ok: false, error: e?.message ?? 'Something went wrong.' };
}

const ok = { ok: true, data: undefined } as const;

interface OnboardingPatch {
  currentStep?: OnboardingStepKey;
  category?: string | null;
  finishedAt?: string | null;
  dismissed?: boolean;
  completed?: Partial<OnboardingCompleted>;
}

async function patchOnboarding(patch: OnboardingPatch): Promise<void> {
  await api.patch('/v1/tenant/onboarding', patch);
}

function toWizardTheme(t: ThemePreset): WizardThemeOption {
  const light = t.tokenDefaults.light as unknown as Record<string, string>;
  return {
    key: t.key,
    name: t.name,
    description: t.description,
    category: t.category,
    swatches: ['colorPrimary', 'colorAccent', 'colorBackground', 'colorForeground'].map(
      (k) => light[k] ?? '#000000'
    ),
  };
}

// Step 1 — Business. Saves the store name + category, then silently enables the
// `storefront` + `commerce` modules so the later steps' endpoints respond
// (theme catalog + product create are both module-gated). Also seeds the
// tenant-level brand (docs/30 §6): businessName always, plus an optional logo
// and primary color the merchant can set inline here. Brand is ungated, so this
// seeds the source of truth before any module choice — a tenant always has a
// brand even if Storefront is later turned off.
export async function saveBusinessAction(input: {
  name: string;
  category: string | null;
  logoMediaId?: string | null;
  colorPrimary?: string | null;
}): Promise<WizardResult> {
  try {
    const name = input.name.trim();
    if (!name) return { ok: false, error: 'Store name is required.' };

    const brandPatch: Record<string, unknown> = { businessName: name };
    if (input.logoMediaId) brandPatch.logoLightMediaId = input.logoMediaId;
    if (input.colorPrimary) brandPatch.colorPrimary = input.colorPrimary;

    await api.patch('/v1/tenant', { name });
    await Promise.all([
      api.patch('/v1/tenant/modules/storefront', { enabled: true }),
      api.patch('/v1/tenant/modules/commerce', { enabled: true }),
      api.patch('/v1/brand', brandPatch),
    ]);
    await patchOnboarding({
      category: input.category,
      completed: { business: true },
      currentStep: 'theme',
    });
    revalidatePath('/onboarding');
    return ok;
  } catch (err) {
    return fail(err);
  }
}

// Step 2 — Theme. Loads the catalog lazily (after modules are on) so the
// initial page render — which happens before the business step enables the
// module — never hits the gated endpoint.
export async function loadThemeStepAction(): Promise<
  WizardResult<{ themes: WizardThemeOption[]; currentThemeKey: string }>
> {
  try {
    const [catalog, config] = await Promise.all([
      api.get<{ themes: ThemePreset[] }>('/v1/sitebuilder/themes'),
      api.get<{ themeKey: string }>('/v1/sitebuilder/config'),
    ]);
    return {
      ok: true,
      data: { themes: catalog.themes.map(toWizardTheme), currentThemeKey: config.themeKey },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function applyThemeAction(themeKey: string): Promise<WizardResult> {
  try {
    await api.put('/v1/sitebuilder/config/theme', { themeKey });
    await patchOnboarding({ completed: { theme: true }, currentStep: 'product' });
    revalidatePath('/onboarding');
    return ok;
  } catch (err) {
    return fail(err);
  }
}

// Step 3 — Product. Creates the merchant's first product as `active` (the
// create endpoint treats that as publish-now). Variants/pricing/media are
// filled later from the product detail tabs.
export async function createFirstProductAction(input: {
  title: string;
  description?: string;
}): Promise<WizardResult> {
  try {
    const title = input.title.trim();
    if (!title) return { ok: false, error: 'Product title is required.' };

    const description = input.description?.trim();
    const body: Record<string, unknown> = { title, status: 'active' };
    if (description) body.description = description;
    await api.post('/v1/commerce/products', body);
    await patchOnboarding({ completed: { product: true }, currentStep: 'domain' });
    revalidatePath('/onboarding');
    return ok;
  } catch (err) {
    return fail(err);
  }
}

// Step 4 — Domain. Live check + commit of the storefront subdomain.
export async function checkSlugAction(slug: string): Promise<WizardResult<SlugAvailability>> {
  try {
    const data = await api.get<SlugAvailability>(
      `/v1/tenant/slug-availability?slug=${encodeURIComponent(slug)}`
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function saveSlugAction(slug: string): Promise<WizardResult> {
  try {
    await api.patch('/v1/tenant/slug', { slug });
    await patchOnboarding({ completed: { domain: true }, currentStep: 'payments' });
    revalidatePath('/onboarding');
    return ok;
  } catch (err) {
    return fail(err);
  }
}

// Advance/rewind without completing a step (Back, or Skip-for-now).
export async function goToStepAction(step: OnboardingStepKey): Promise<WizardResult> {
  try {
    await patchOnboarding({ currentStep: step });
    revalidatePath('/onboarding');
    return ok;
  } catch (err) {
    return fail(err);
  }
}

// Step 5 / finish — marks the wizard finished and lands on the Done screen.
// `finishedAt` flips the welcome checklist to its completed state; we leave
// `dismissed` false so the day-0+ banner still nudges any remaining work.
export async function finishOnboardingAction(input: {
  paymentsConnected?: boolean;
}): Promise<WizardResult> {
  try {
    await patchOnboarding({
      completed: input.paymentsConnected ? { payments: true } : undefined,
      currentStep: 'done',
      finishedAt: new Date().toISOString(),
    });
    revalidatePath('/');
    revalidatePath('/welcome');
    revalidatePath('/onboarding');
    return ok;
  } catch (err) {
    return fail(err);
  }
}
