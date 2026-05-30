'use client';

import * as React from 'react';
import { Badge, Button, Heading, Spinner, Stack, Text } from '@sparx/ui';
import { Check } from 'lucide-react';
import { applyThemeAction, loadThemeStepAction } from '../_lib/actions';
import type { WizardThemeOption } from '../_lib/types';
import type { StepNav } from './onboarding-wizard';

// The default theme key — gets a "Recommended" badge as a gentle starting point.
const RECOMMENDED = 'apex';

export function StepTheme({ nav }: { nav: StepNav }) {
  const [themes, setThemes] = React.useState<WizardThemeOption[] | null>(null);
  const [selected, setSelected] = React.useState<string>('');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    let active = true;
    void loadThemeStepAction().then((res) => {
      if (!active) return;
      if (res.ok) {
        setThemes(res.data.themes);
        setSelected(res.data.currentThemeKey || RECOMMENDED);
      } else {
        setLoadError(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function onContinue() {
    if (!selected) return;
    setSaveError(null);
    startTransition(async () => {
      const res = await applyThemeAction(selected);
      if (res.ok) nav.onNext();
      else setSaveError(res.error);
    });
  }

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Heading level={3}>Choose a theme</Heading>
        <Text variant="muted">
          A starting point for your storefront&apos;s look. You can fully customize colors, fonts,
          and sections later in Site Builder.
        </Text>
      </Stack>

      {themes === null && !loadError && (
        <Stack direction="row" align="center" gap={2} className="py-8" justify="center">
          <Spinner size="sm" />
          <Text variant="muted">Loading themes…</Text>
        </Stack>
      )}

      {loadError && (
        <Text size="sm" variant="danger" role="alert">
          {loadError}
        </Text>
      )}

      {themes && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => {
            const isSelected = t.key === selected;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelected(t.key)}
                aria-pressed={isSelected}
                className={
                  'flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors ' +
                  (isSelected
                    ? 'border-[var(--module-active)] ring-2 ring-[var(--module-active)]'
                    : 'border-[var(--color-border-default)] hover:border-[var(--module-active)]')
                }
              >
                <div className="flex h-16 overflow-hidden rounded-lg">
                  {t.swatches.map((c, i) => (
                    <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--color-text-primary)]">{t.name}</span>
                  {t.key === RECOMMENDED ? (
                    <Badge variant="secondary">Recommended</Badge>
                  ) : isSelected ? (
                    <Check className="h-4 w-4 text-[var(--module-active)]" />
                  ) : null}
                </div>
                <p className="min-h-[2.5rem] text-sm text-[var(--color-text-muted)]">
                  {t.description}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {saveError && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {saveError}
        </Text>
      )}

      <Stack direction="row" justify="between">
        <Button variant="ghost" onClick={nav.onBack} disabled={pending || nav.navPending}>
          Back
        </Button>
        <Button
          variant="module"
          onClick={onContinue}
          disabled={pending || !selected || themes === null}
          loading={pending}
        >
          Continue
        </Button>
      </Stack>
    </Stack>
  );
}
