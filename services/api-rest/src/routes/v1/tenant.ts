// Tenant — general settings, module flags, onboarding state.
//
//   GET    /v1/tenant                              → basic tenant card
//   PATCH  /v1/tenant                              → name / email
//   GET    /v1/tenant/modules                      → [{slug, enabled}]
//   PATCH  /v1/tenant/modules/:slug                → toggle enabled (owner/admin)
//   GET    /v1/tenant/onboarding                   → raw onboarding state
//   PATCH  /v1/tenant/onboarding                   → patch onboarding state
//   GET    /v1/tenant/onboarding/progress          → derived progress + steps
//
// The tenants table is RLS-exempt by design (it's the dispatch table). Every
// route here therefore reads through the bare `prisma` client but pins the
// WHERE clause to `request.auth.tenantId` — a triple safety belt against any
// future bug that misses the tenant filter.
//
// Module toggles do **read-modify-write** on `settings.modules.<slug>` rather
// than Postgres `jsonb_set`: jsonb_set silently no-ops when the parent path
// (`settings.modules`) doesn't exist yet, which was the F-01 persistence
// repro that originally bit CRM activation. RMW always produces a valid
// nested structure regardless of starting shape.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@sparx/db';
import { ok } from '@sparx/api-core/envelope';
import { requireAuth, requireRole } from '@sparx/api-core/auth';
import { conflict, notFound } from '@sparx/api-core/errors';
import { invalidateModuleCache, type ModuleSlug } from '@sparx/auth';

const MODULE_SLUGS: ModuleSlug[] = [
  'storefront',
  'commerce',
  'cms',
  'crm',
  'email',
  'b2b',
  'dropship',
  'ai',
];
const MODULE_SLUG_SET = new Set<string>(MODULE_SLUGS);

const PatchTenant = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(255).optional(),
});

// Storefront subdomain rules (docs/04 §2): 3–63 chars, lowercase alnum +
// internal hyphens, plus a reserved-name guard.
const RESERVED_SLUGS = new Set<string>([
  'www',
  'api',
  'app',
  'admin',
  'mcp',
  'mail',
  'email',
  'ftp',
  'blog',
  'shop',
  'store',
  'dashboard',
  'static',
  'cdn',
  'assets',
  'help',
  'support',
  'status',
  'dev',
  'staging',
  'test',
  'sparx',
  'wize',
  'wizeworks',
  'account',
  'accounts',
  'login',
  'signup',
  'checkout',
  'cart',
  'docs',
  'about',
  'system',
  'internal',
]);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(SLUG_RE, 'Use lowercase letters, numbers, and hyphens.');
const SlugQuery = z.object({ slug: z.string().max(120) });
const SlugBody = z.object({ slug: SlugSchema });

// Three deterministic suggestions when a desired slug is taken/invalid.
function slugSuggestions(base: string): string[] {
  const clean =
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 55) || 'store';
  return [`${clean}-store`, `${clean}-shop`, `${clean}-co`];
}

const ModuleParams = z.object({
  slug: z.string().refine((s) => MODULE_SLUG_SET.has(s), 'Unknown module slug'),
});

const ModulePatch = z.object({
  enabled: z.boolean(),
});

const ONBOARDING_STEPS = ['business', 'theme', 'product', 'domain', 'payments', 'done'] as const;
type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const OnboardingPatch = z.object({
  dismissed: z.boolean().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  finishedAt: z.string().datetime().nullable().optional(),
  currentStep: z.enum(ONBOARDING_STEPS).optional(),
  category: z.string().max(63).nullable().optional(),
  completed: z
    .object({
      business: z.boolean().optional(),
      theme: z.boolean().optional(),
      product: z.boolean().optional(),
      domain: z.boolean().optional(),
      payments: z.boolean().optional(),
    })
    .optional(),
});

interface OnboardingCompleted {
  business: boolean;
  theme: boolean;
  product: boolean;
  domain: boolean;
  payments: boolean;
}

interface OnboardingState {
  dismissed: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  currentStep: OnboardingStep;
  category: string | null;
  completed: OnboardingCompleted;
}

const DEFAULT_COMPLETED: OnboardingCompleted = {
  business: false,
  theme: false,
  product: false,
  domain: false,
  payments: false,
};

const DEFAULT_ONBOARDING: OnboardingState = {
  dismissed: false,
  startedAt: null,
  finishedAt: null,
  currentStep: 'business',
  category: null,
  completed: DEFAULT_COMPLETED,
};

function readOnboarding(settings: unknown): OnboardingState {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return DEFAULT_ONBOARDING;
  }
  const raw = (settings as Record<string, unknown>).onboarding;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_ONBOARDING;
  }
  const rec = raw as Record<string, unknown>;
  const completedRaw = (rec.completed ?? {}) as Record<string, unknown>;
  return {
    dismissed: typeof rec.dismissed === 'boolean' ? rec.dismissed : false,
    startedAt: typeof rec.startedAt === 'string' ? rec.startedAt : null,
    finishedAt: typeof rec.finishedAt === 'string' ? rec.finishedAt : null,
    currentStep: ONBOARDING_STEPS.includes(rec.currentStep as OnboardingStep)
      ? (rec.currentStep as OnboardingStep)
      : 'business',
    category: typeof rec.category === 'string' ? rec.category : null,
    completed: {
      business: completedRaw.business === true,
      theme: completedRaw.theme === true,
      product: completedRaw.product === true,
      domain: completedRaw.domain === true,
      payments: completedRaw.payments === true,
    },
  };
}

function readModuleFlags(settings: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const slug of MODULE_SLUGS) out[slug] = false;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return out;
  const modules = (settings as Record<string, unknown>).modules;
  if (!modules || typeof modules !== 'object') return out;
  for (const slug of MODULE_SLUGS) {
    const slot = (modules as Record<string, unknown>)[slug];
    if (slot && typeof slot === 'object' && (slot as Record<string, unknown>).enabled === true) {
      out[slug] = true;
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync type demands async; no top-level await needed because route registration is sync.
const tenantRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/tenant', async (request) => {
    const auth = requireAuth(request);
    const row = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { id: true, name: true, email: true, slug: true, plan: true },
    });
    if (!row) throw notFound('Tenant', auth.tenantId);
    return ok(row);
  });

  app.patch('/v1/tenant', async (request) => {
    const auth = requireRole(request, 'admin');
    const input = PatchTenant.parse(request.body);
    const row = await prisma.tenant.update({
      where: { id: auth.tenantId },
      data: input,
      select: { id: true, name: true, email: true, slug: true, plan: true },
    });
    return ok(row);
  });

  // Subdomain availability check for the onboarding domain step. Returns
  // { available, reason?, suggestions? } so the wizard can guide the merchant.
  app.get('/v1/tenant/slug-availability', async (request) => {
    const auth = requireAuth(request);
    const { slug } = SlugQuery.parse(request.query);
    const normalized = slug.trim().toLowerCase();

    if (!SLUG_RE.test(normalized) || normalized.length < 3 || normalized.length > 63) {
      return ok({ available: false, reason: 'invalid', suggestions: slugSuggestions(normalized) });
    }
    if (RESERVED_SLUGS.has(normalized)) {
      return ok({ available: false, reason: 'reserved', suggestions: slugSuggestions(normalized) });
    }
    const existing = await prisma.tenant.findUnique({
      where: { slug: normalized },
      select: { id: true },
    });
    if (existing && existing.id !== auth.tenantId) {
      return ok({ available: false, reason: 'taken', suggestions: slugSuggestions(normalized) });
    }
    return ok({ available: true });
  });

  // Update the tenant's storefront subdomain. Owner/admin only.
  app.patch('/v1/tenant/slug', async (request) => {
    const auth = requireRole(request, 'admin');
    const { slug } = SlugBody.parse(request.body);
    const normalized = slug.trim().toLowerCase();
    if (RESERVED_SLUGS.has(normalized)) {
      throw conflict('That subdomain is reserved.', 'slug');
    }
    const existing = await prisma.tenant.findUnique({
      where: { slug: normalized },
      select: { id: true },
    });
    if (existing && existing.id !== auth.tenantId) {
      throw conflict('That subdomain is already taken.', 'slug');
    }
    const row = await prisma.tenant.update({
      where: { id: auth.tenantId },
      data: { slug: normalized },
      select: { id: true, name: true, email: true, slug: true, plan: true },
    });
    return ok(row);
  });

  app.get('/v1/tenant/modules', async (request) => {
    const auth = requireAuth(request);
    const row = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { settings: true },
    });
    const flags = readModuleFlags(row?.settings);
    return ok(MODULE_SLUGS.map((slug) => ({ slug, enabled: flags[slug] === true })));
  });

  app.patch('/v1/tenant/modules/:slug', async (request) => {
    const auth = requireRole(request, 'admin');
    const { slug } = ModuleParams.parse(request.params);
    const { enabled } = ModulePatch.parse(request.body);

    const before = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { settings: true },
    });
    if (!before) throw notFound('Tenant', auth.tenantId);

    const currentSettings = (before.settings as Record<string, unknown> | null) ?? {};
    const currentModules = (currentSettings.modules as Record<string, unknown> | undefined) ?? {};
    const currentSlot = (currentModules[slug] as Record<string, unknown> | undefined) ?? {};
    const nextSettings = {
      ...currentSettings,
      modules: {
        ...currentModules,
        [slug]: { ...currentSlot, enabled },
      },
    } as Prisma.InputJsonValue;

    await prisma.tenant.update({
      where: { id: auth.tenantId },
      data: { settings: nextSettings },
    });
    invalidateModuleCache(auth.tenantId, slug as ModuleSlug);

    return ok({ slug, enabled });
  });

  app.get('/v1/tenant/onboarding', async (request) => {
    const auth = requireAuth(request);
    const row = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { settings: true },
    });
    return ok(readOnboarding(row?.settings ?? null));
  });

  app.patch('/v1/tenant/onboarding', async (request) => {
    const auth = requireAuth(request);
    const input = OnboardingPatch.parse(request.body);

    const before = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { settings: true },
    });
    if (!before) throw notFound('Tenant', auth.tenantId);

    const currentSettings = (before.settings as Record<string, unknown> | null) ?? {};
    const currentOnboarding = readOnboarding(before.settings ?? null);
    const nextOnboarding: OnboardingState = {
      ...currentOnboarding,
      ...input,
      // `completed` is a nested partial — deep-merge so a single step flip
      // doesn't clobber the other steps' flags.
      completed: { ...currentOnboarding.completed, ...(input.completed ?? {}) },
    };
    const nextSettings = {
      ...currentSettings,
      onboarding: nextOnboarding,
    } as unknown as Prisma.InputJsonValue;

    await prisma.tenant.update({
      where: { id: auth.tenantId },
      data: { settings: nextSettings },
    });
    return ok(nextOnboarding);
  });

  app.get('/v1/tenant/onboarding/progress', async (request) => {
    const auth = requireAuth(request);
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { name: true, settings: true },
    });
    if (!tenant) throw notFound('Tenant', auth.tenantId);

    const state = readOnboarding(tenant.settings ?? null);
    // Page count is the only derived signal that lives outside the tenant
    // row today. Reading through the bare prisma client is fine — the Page
    // table is RLS-enabled, but we explicitly filter by tenantId here and
    // never expose any per-page data, just the count.
    const pageCount = await prisma.page.count({ where: { tenantId: auth.tenantId } });

    const steps = [
      {
        id: 'account' as const,
        title: 'Create your account',
        description: 'Email, password, and store name.',
        done: true,
      },
      {
        id: 'tenant' as const,
        title: 'Confirm your store details',
        description: 'Make sure the contact email and store name look right.',
        done: Boolean(tenant.name),
        cta: { label: 'Open settings', href: '/settings/general' },
      },
      {
        id: 'first-page' as const,
        title: 'Add your first page',
        description: 'About, Contact, or any landing page to get started.',
        done: pageCount > 0,
        cta: { label: 'Open CMS', href: '/cms' },
      },
      {
        id: 'theme' as const,
        title: 'Pick a theme',
        description: 'Themes ship with the Sitebuilder module.',
        done: false,
        comingSoon: true,
      },
      {
        id: 'domain' as const,
        title: 'Connect a custom domain',
        description: 'Use your wizeworks subdomain for now; bring your own later.',
        done: false,
        comingSoon: true,
      },
      {
        id: 'payments' as const,
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

    return ok({ state, pageCount, steps, completion });
  });
};

export default tenantRoutes;
