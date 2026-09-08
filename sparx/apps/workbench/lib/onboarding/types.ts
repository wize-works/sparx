// The onboarding vocabulary — every shape the setup flows and the welcome
// checklist read or write. Built fresh for the workbench (no dashboard import):
// the workbench drives onboarding from the browser over its own api-rest client,
// so there are no server-action result wrappers here — a call either resolves or
// throws, and react-query owns the pending/error state.
//
// Onboarding is NOT its own table. It lives as JSON on `tenants.settings.onboarding`
// and is reached entirely through api-rest: GET/PATCH `/v1/tenant/onboarding` and
// the derived GET `/v1/tenant/onboarding/progress`. The step-completion derivation
// (page counts, theme set, etc.) lives server-side so it stays in sync with the
// domain rather than being guessed in the browser.

import type { BlueprintVertical } from '@wizeworks/story-schemas';

export type { BlueprintVertical };

/* ── The classic wizard ─────────────────────────────────────────────────────
   Modules-first: the tenant picks modules FIRST (that selection drives billing
   AND filters the template catalog), then template → workspace → domain →
   payments → launch. Payments shows only when a selling module is on; launch is
   the preview-and-publish screen. */

export type OnboardingStepKey =
  'modules' | 'template' | 'workspace' | 'domain' | 'payments' | 'launch';

export interface OnboardingCompleted {
  modules: boolean;
  template: boolean;
  workspace: boolean;
  domain: boolean;
  payments: boolean;
}

/** A blueprint as the template gallery renders it — the catalog summary plus its
 *  "what's inside" counts and this site's install state. One element of
 *  `GET /v1/blueprints`'s response. */
export interface WizardBlueprint {
  key: string;
  version: string;
  name: string;
  summary: string;
  vertical: BlueprintVertical;
  preview: string | null;
  requiresModules: string[];
  contents: {
    products: number;
    categories: number;
    collections: number;
    content: number;
    pages: number;
    emails: number;
    components: number;
    theme: string;
    hasLayout: boolean;
  };
  install: { id: string; status: string; version: string; update_available: boolean } | null;
}

/** ICANN registrant contact — required to register any domain. Captured at the
 *  Domain step when a tenant chooses a paid domain, carried until Launch. */
export interface RegistrantContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/** A domain the tenant chose to BUY during onboarding. The choice (domain + ICANN
 *  contact + price) is captured at the Domain step but NOT charged or registered
 *  until Launch — a custom domain is the one paid, opt-in add-on, billed only when
 *  the tenant commits to going live. */
export interface PendingDomain {
  domain: string;
  /** First-year price incl. our fee, in cents — what we charge at launch. */
  displayPrice: number;
  /** Renewal price incl. our fee, in cents — per additional year. */
  renewalDisplayPrice: number;
  years: number;
  privacy: boolean;
  propertyId: string;
  contact: RegistrantContact;
}

export type SlugAvailability =
  | { available: true }
  | { available: false; reason: 'invalid' | 'reserved' | 'taken'; suggestions: string[] };

/* ── The persisted onboarding state (settings.onboarding) ───────────────────
   The raw record GET/PATCH `/v1/tenant/onboarding` reads and writes. Every field
   is optional on a partial PATCH; reads carry the routing hints the entry rule
   (see ./entry.ts) uses to resume the right front end. */

export interface OnboardingState {
  /** Set true when the tenant finishes or skips — hides the welcome banner. */
  dismissed?: boolean;
  /** ISO timestamp the tenant first landed on the welcome checklist. */
  startedAt?: string | null;
  /** ISO timestamp the tenant finished (or skipped) onboarding. Its presence is
   *  what tells the shell onboarding is DONE and the workbench may mount. */
  finishedAt?: string | null;
  /** The front end the tenant explicitly chose (`story` | `classic`) via a switch
   *  link. Outranks every other routing hint. */
  flow?: OnboardingFlow | null;
  /** Current classic-wizard step, when one is in progress. */
  currentStep?: OnboardingStepKey | null;
  /** Per-step completion flags from the classic wizard. */
  completed?: Partial<OnboardingCompleted> | null;
  /** The chosen template key + its install row id (resume + the Launch publish). */
  blueprintKey?: string | null;
  installId?: string | null;
  /** Whether that install brought the blueprint's examples (issue 098). */
  sampleData?: boolean;
  /** The natural-language story narrative, when onboarding came through the story
   *  flow. Persisted as the api-rest `StoryNarrative` shape; kept loose here. */
  story?: PersistedStory | null;
}

/** The narrative as persisted under `settings.onboarding.story`. The composer's
 *  live editable state is the structured subset; `text`/`modules`/`composedAt`
 *  are derived records kept but not edited. */
export interface PersistedStory {
  text?: string;
  tense?: string | null;
  industry?: string | null;
  audience?: string | null;
  name?: string;
  cust?: string[];
  lines?: string[][];
  slots?: Record<string, string>;
  modules?: string[];
  composedAt?: string;
}

/** The patch body accepted by PATCH `/v1/tenant/onboarding`. A superset of the
 *  fields any single step writes; every one is optional. */
export type OnboardingPatch = Partial<
  Pick<
    OnboardingState,
    | 'dismissed'
    | 'startedAt'
    | 'finishedAt'
    | 'flow'
    | 'currentStep'
    | 'blueprintKey'
    | 'installId'
    | 'sampleData'
    | 'story'
  >
> & { completed?: Partial<OnboardingCompleted> };

export type OnboardingFlow = 'story' | 'classic';

/* ── The welcome checklist (post-setup) ─────────────────────────────────────
   Derived from real domain data by api-rest, so the checklist reflects what the
   tenant has actually done rather than what a flag claims. */

export interface OnboardingStep {
  id: 'account' | 'tenant' | 'first-page' | 'theme' | 'domain' | 'payments';
  title: string;
  description: string;
  done: boolean;
  /** Where to send the operator to satisfy this step. In the workbench a CTA is a
   *  surface to open, not an href — the surface key + optional params. Params match
   *  the surface system's `SurfaceParams` (a flat string map) so a CTA feeds
   *  `ctx.open(surface, params)` directly. */
  cta?: { label: string; surface: string; params?: Readonly<Record<string, string>> };
  comingSoon?: boolean;
}

export interface OnboardingProgress {
  state: OnboardingState;
  pageCount: number;
  /** Steps and whether each is satisfied. Order matters for the UI. */
  steps: OnboardingStep[];
  /** 0..1 — how much of the checklist is done. */
  completion: number;
}

/** Raw progress from api-rest, whose CTAs are hrefs (the dashboard's shape). The
 *  workbench maps those hrefs to surface opens in ./api.ts. */
export interface RawOnboardingProgress {
  state: OnboardingState;
  pageCount: number;
  steps: (Omit<OnboardingStep, 'cta'> & { cta?: { label: string; href: string } })[];
  completion: number;
}
