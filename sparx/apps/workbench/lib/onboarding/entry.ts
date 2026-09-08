// Which onboarding front end an unfinished tenant lands in.
//
// The natural-language story flow is the PRIMARY front end; the classic step
// wizard stays fully supported, and the two are freely interchangeable — both
// carry a switch link, and this module is the one place that decides the default.
//
// In the workbench there are no routes, so this resolves to a FLOW to mount, not
// an href — the gate reads it once, then the switch links flip it (and record the
// explicit choice) from there.
//
// Precedence:
//   1. The tenant EXPLICITLY chose a front end (a switch link)        → that one
//   2. A story narrative exists (committed OR an in-progress draft)   → story
//   3. The classic wizard was advanced (step moved off the first, or
//      any step flagged complete) WITHOUT a story                     → classic
//   4. Otherwise — a fresh tenant                                     → story
//
// Rule 1 outranks rule 2 for a reason: the story composer debounce-saves a draft
// as you type, so `story` goes truthy within seconds of touching it. Derived from
// state alone that draft is a one-way latch that would bounce a tenant back to the
// story flow no matter how they left. An explicit choice is the only signal that
// says "I know there's a draft; I want the wizard."

import type { OnboardingFlow, OnboardingState } from './types';

export type { OnboardingFlow };

export function resolveOnboardingFlow(state: OnboardingState | null | undefined): OnboardingFlow {
  if (!state) return 'story';
  if (state.flow === 'classic' || state.flow === 'story') return state.flow;
  if (state.story) return 'story';
  const advancedClassic =
    (!!state.currentStep && state.currentStep !== 'modules') ||
    Object.values(state.completed ?? {}).some(Boolean);
  return advancedClassic ? 'classic' : 'story';
}

/** Onboarding is finished when a finish/skip has stamped `finishedAt`. That is the
 *  single signal the shell gates on — everything else is progress, not completion. */
export function isOnboardingFinished(state: OnboardingState | null | undefined): boolean {
  return Boolean(state?.finishedAt);
}

/**
 * Whether setup has been ENGAGED: a step advanced, a phrase composed, a design
 * installed. Progress, not completion — and the one thing that separates a
 * business part-way through setup from a business that was never in it.
 *
 * `currentStep` counts only once it has MOVED. api-rest fills the field in for
 * every tenant, defaulting it to the first step, so a business with no stored
 * setup at all still reads `currentStep: 'modules'` — truthy, and meaning
 * nothing. `resolveOnboardingFlow` above makes the same distinction for the same
 * reason; treating the bare field as progress makes this predicate always true.
 */
export function isSetupStarted(state: OnboardingState | null | undefined): boolean {
  if (!state) return false;
  if (state.finishedAt || state.story) return true;
  if (state.installId || state.blueprintKey) return true;
  if (state.currentStep && state.currentStep !== 'modules') return true;
  return Object.values(state.completed ?? {}).some(Boolean);
}

/**
 * Whether setup would be running over a business that already exists.
 *
 * Setup writes over live state at every step: it flips the whole app switchboard
 * at once, lays a ready-made site into the site it is pointed at, and renames the
 * business and its site. That is right for a business being born and wrong for
 * one that is trading, so the flows ask this before they mount.
 *
 * `finishedAt` alone is not enough. It is stamped by finishing or skipping setup
 * IN THIS CONSOLE, and a business can be fully built without ever passing through
 * here — furnished at signup, seeded, or imported — which leaves `settings
 * .onboarding` absent entirely. So the second signal is the one the welcome
 * checklist already trusts: pages that actually exist. api-rest counts those from
 * real rows rather than from a flag, for the same reason.
 *
 * Order matters. A business PART-WAY through setup usually has pages by now (the
 * design step installs them), so the page count would lock it out of finishing
 * its own setup. Recorded progress therefore wins over the count.
 */
export function isBusinessRunning(
  state: OnboardingState | null | undefined,
  pageCount: number
): boolean {
  if (state?.finishedAt) return true;
  if (isSetupStarted(state)) return false;
  return pageCount > 0;
}
