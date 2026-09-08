// Whether setup should run at all.
//
// Pinned because both setup flows are reachable ONLY from the menu in this
// console — there is no first-run gate — so everybody who opens one already has
// an account, and most already have a business. Running setup over one turns off
// every app the story does not mention, lays a ready-made site over the site she
// has, and renames the business (issue 364).

import { describe, expect, it } from 'vitest';
import { isBusinessRunning, isSetupStarted, resolveOnboardingFlow } from './entry';
import type { OnboardingState } from './types';

/** What `GET /v1/tenant/onboarding` actually returns: api-rest fills EVERY field
 *  in, so a business with nothing stored still reads `currentStep: 'modules'`.
 *  Trimming this fixture would hide the exact trap the predicate is about. */
const FRESH: OnboardingState = {
  dismissed: false,
  startedAt: null,
  finishedAt: null,
  currentStep: 'modules',
  flow: null,
  blueprintKey: null,
  installId: null,
  sampleData: true,
  story: null,
  completed: {
    modules: false,
    template: false,
    workspace: false,
    domain: false,
    payments: false,
  },
};

describe('isSetupStarted', () => {
  it('is false for a business that has done nothing', () => {
    expect(isSetupStarted(FRESH)).toBe(false);
  });

  it('does NOT count the default currentStep as progress', () => {
    // The whole trap. api-rest defaults the field rather than leaving it null, so
    // reading it as truthy makes the predicate always true and the gate a no-op.
    expect(isSetupStarted({ ...FRESH, currentStep: 'modules' })).toBe(false);
    expect(isSetupStarted({ ...FRESH, currentStep: 'template' })).toBe(true);
  });

  it('counts a completed step, a story, and an installed design', () => {
    expect(isSetupStarted({ ...FRESH, completed: { ...FRESH.completed, modules: true } })).toBe(
      true
    );
    expect(isSetupStarted({ ...FRESH, story: { text: 'a shop' } })).toBe(true);
    expect(isSetupStarted({ ...FRESH, installId: 'i_1' })).toBe(true);
    expect(isSetupStarted({ ...FRESH, blueprintKey: 'bp' })).toBe(true);
  });

  it('is false when nothing was read at all', () => {
    expect(isSetupStarted(null)).toBe(false);
    expect(isSetupStarted(undefined)).toBe(false);
  });
});

describe('isBusinessRunning', () => {
  it('lets a brand-new business through', () => {
    expect(isBusinessRunning(FRESH, 0)).toBe(false);
  });

  it('lets a business PART-WAY through setup finish, even once it has pages', () => {
    // The regression risk: the design step installs pages, so a page count alone
    // would lock somebody out of finishing their own setup.
    const midway: OnboardingState = {
      ...FRESH,
      currentStep: 'workspace',
      installId: 'i_1',
      blueprintKey: 'bp',
      completed: { ...FRESH.completed, modules: true, template: true },
    };
    expect(isBusinessRunning(midway, 9)).toBe(false);
  });

  it('stops on a business that finished setup here', () => {
    const done = { ...FRESH, finishedAt: '2026-01-01T00:00:00.000Z' };
    expect(isBusinessRunning(done, 40)).toBe(true);
    // Even with no pages: finishing is a decision somebody made, not a count.
    expect(isBusinessRunning(done, 0)).toBe(true);
  });

  it('stops on a business built some OTHER way', () => {
    // Seeded, imported, or furnished at signup: no onboarding record was ever
    // written, so `finishedAt` misses it entirely. Real pages are the signal.
    expect(isBusinessRunning(FRESH, 51)).toBe(true);
  });

  it('does not block when nothing could be read', () => {
    // A business that cannot be measured is treated as one that still needs
    // setup, which is the state the flows were built for.
    expect(isBusinessRunning(null, 0)).toBe(false);
  });
});

describe('resolveOnboardingFlow', () => {
  it('defaults a fresh business to the story', () => {
    expect(resolveOnboardingFlow(FRESH)).toBe('story');
    expect(resolveOnboardingFlow(null)).toBe('story');
  });

  it('honours an explicit choice over a saved draft', () => {
    // The composer debounce-saves as you type, so `story` goes truthy within
    // seconds — derived from state alone it would be a one-way latch.
    expect(resolveOnboardingFlow({ ...FRESH, flow: 'classic', story: { text: 'x' } })).toBe(
      'classic'
    );
  });

  it('sends somebody who advanced the wizard back to the wizard', () => {
    expect(
      resolveOnboardingFlow({ ...FRESH, completed: { ...FRESH.completed, modules: true } })
    ).toBe('classic');
  });
});
