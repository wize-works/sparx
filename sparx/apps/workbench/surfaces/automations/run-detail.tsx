'use client';

// One run of a rule — read-only, the record of exactly what happened when it
// fired. It's a transaction view, so it keeps an identity heading (which rule,
// when) rather than an editable name.
//
// The heart of it is the step timeline: each action the run attempted, its
// result, and — crucially — its GATE LOG. A step marked "held back" is NOT a
// failure: a policy gate stopped that one effect and recorded why. Surfacing the
// gate decisions in plain rows is what makes the run auditable.

import { useEffect } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Heading,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { ShieldCheck } from 'lucide-react';
import type { GateLogEntry } from '@wizeworks/automation-schemas';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { actionLabel } from './automations-catalog';
import { runState, stepState } from './automations-presentation';
import {
  useAutomation,
  useAutomationRun,
  type AutomationRunStepRow,
  type Tone,
} from './automations-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function gateDecisionTone(decision: string): Tone {
  switch (decision) {
    case 'allow':
      return 'success';
    case 'deny':
      return 'danger';
    case 'defer':
      return 'warning';
    case 'transform':
      return 'info';
    default:
      return 'neutral';
  }
}

function gateDecisionLabel(decision: string): string {
  switch (decision) {
    case 'allow':
      return 'Allowed';
    case 'deny':
      return 'Blocked';
    case 'defer':
      return 'Deferred';
    case 'transform':
      return 'Adjusted';
    default:
      return decision;
  }
}

function parseGateLog(raw: unknown): GateLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: GateLogEntry[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object') {
      const e = entry as { gate?: unknown; decision?: unknown; reason?: unknown };
      if (typeof e.gate === 'string' && typeof e.decision === 'string') {
        out.push({
          gate: e.gate,
          decision: e.decision as GateLogEntry['decision'],
          ...(typeof e.reason === 'string' ? { reason: e.reason } : {}),
        });
      }
    }
  }
  return out;
}

function StepCard({ step }: { step: AutomationRunStepRow }) {
  const state = stepState(step.status);
  const gates = parseGateLog(step.gateLog);
  return (
    <div className="border-base-300 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-base-200 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {step.actionIndex + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-medium">
          {actionLabel(step.actionType)}
        </span>
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </div>

      <span className="font-mono text-xs break-all">{step.actionType}</span>

      {step.error ? <Text className="text-error text-sm">{step.error}</Text> : null}

      {gates.length > 0 ? (
        <div className="border-base-300 flex flex-col gap-1.5 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              Policy checks
            </Text>
          </div>
          {gates.map((gate, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-2">
              <Badge color={gateDecisionTone(gate.decision)} variant="soft" size="sm">
                {gateDecisionLabel(gate.decision)}
              </Badge>
              <span className="font-mono text-xs">{gate.gate}</span>
              {gate.reason ? (
                <Text as="span" className="text-sm">
                  {gate.reason}
                </Text>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AutomationRunDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const automationId = typeof ctx.params.automationId === 'string' ? ctx.params.automationId : '';
  const runId = typeof ctx.params.runId === 'string' ? ctx.params.runId : '';

  const { data: automation } = useAutomation(automationId);
  const { data: run, isPending, isError, error, refetch } = useAutomationRun(automationId, runId);

  useEffect(() => {
    if (run) ctx.setTitle(automation ? `${automation.name} — run` : 'Run');
  }, [ctx, run, automation]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="run"
        title="Could not load this run"
        description="This is a problem reaching the server, or the run no longer exists."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !run) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const state = runState(run.status);
  const steps = [...run.steps].sort((a, b) => a.actionIndex - b.actionIndex);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Run details"
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {run.automationVersion !== null ? (
              <Badge color="neutral" variant="outline" size="sm">
                v{run.automationVersion}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {automation ? automation.name : 'Automation run'}
            </Heading>
            <Text className="text-sm">
              Started <Timestamp value={run.startedAt} format="absolute" />
              {run.completedAt ? (
                <>
                  {' · '}Finished <Timestamp value={run.completedAt} format="relative" />
                </>
              ) : null}
            </Text>
          </div>

          <Alert color={run.status === 'failed' ? 'error' : state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>{run.errorMessage ?? state.detail}</AlertDescription>
            </AlertContent>
          </Alert>

          <FormSection
            title="What happened, step by step"
            description="Each step this run attempted, in order. “Held back” means a safety check stopped that one step — it is not a failure of the run."
          >
            {steps.length === 0 ? (
              <Text className="text-sm">
                No steps were recorded — the run’s conditions may not have matched.
              </Text>
            ) : (
              <div className="flex flex-col gap-3">
                {steps.map((step) => (
                  <StepCard key={step.id} step={step} />
                ))}
              </div>
            )}
          </FormSection>
        </div>
      </div>
    </div>
  );
}
