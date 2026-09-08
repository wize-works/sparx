'use client';

// The onboarding flows as REOPENABLE surfaces.
//
// The gate runs onboarding at first run in the full viewport. But an operator may
// want to come back to setup — resume a story they were composing, revisit the
// wizard, redo a step — long after the gate is gone. These wrappers register each
// flow as a normal surface so ⌘K and a deep link can reopen it into a pane. Same
// flow component, same foundation; only the chrome differs (a pane has its own
// toolbar, so there is no gate header here) and "finish"/"switch" close or swap the
// pane instead of falling through to the shell.
//
// Both sit behind `SetupGate`. The first-run gate cannot reach a tenant that is
// already trading; THESE can, from ⌘K or a deep link, and the flows they mount
// rewrite the module switchboard, the site and the business name without reading
// any of them first. A tenant part-way through setup still gets the flow.
//
// Scoped to the Builder hue like the gate, so a reopened flow reads identically to
// the first run.

import { ModuleScope } from '../../components/module-scope';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { ClassicWizard } from './wizard/wizard';
import { StoryFlow } from './story/story-flow';
import { SetupGate } from './setup-gate';

export function OnboardingWizardSurface({ ctx }: { ctx: SurfaceContext }) {
  return (
    <ModuleScope module="builder" className="flex h-full w-full flex-col overflow-hidden">
      <SetupGate ctx={ctx}>
        <ClassicWizard
          onSwitchToStory={() => {
            ctx.open('workbench.onboarding.story');
            ctx.close();
          }}
          onFinished={() => {
            ctx.close();
          }}
        />
      </SetupGate>
    </ModuleScope>
  );
}

export function OnboardingStorySurface({ ctx }: { ctx: SurfaceContext }) {
  return (
    <ModuleScope module="builder" className="flex h-full w-full flex-col overflow-hidden">
      <SetupGate ctx={ctx}>
        <StoryFlow
          onSwitchToClassic={() => {
            ctx.open('workbench.onboarding');
            ctx.close();
          }}
          onFinished={() => {
            ctx.close();
          }}
        />
      </SetupGate>
    </ModuleScope>
  );
}
