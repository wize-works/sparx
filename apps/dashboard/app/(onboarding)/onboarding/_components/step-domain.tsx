'use client';

import * as React from 'react';
import { Button, Heading, Input, Label, Spinner, Stack, Text } from '@sparx/ui';
import { Check } from 'lucide-react';
import { checkSlugAction, saveSlugAction } from '../_lib/actions';
import type { SlugAvailability } from '../_lib/types';
import type { StepNav } from './onboarding-wizard';

const STORE_ZONE = 'sparx.zone';

const REASON_COPY: Record<string, string> = {
  invalid: 'Use lowercase letters, numbers, and hyphens (3–63 characters).',
  reserved: 'That subdomain is reserved — try another.',
  taken: 'That subdomain is already taken — try another.',
};

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; result: SlugAvailability };

export function StepDomain({ initialSlug, nav }: { initialSlug: string; nav: StepNav }) {
  const [slug, setSlug] = React.useState(initialSlug);
  const [check, setCheck] = React.useState<CheckState>({ status: 'idle' });
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Debounced availability check. The trimmed/lowercased value is what the API
  // normalizes to, so mirror that here for an accurate preview + check.
  const normalized = slug.trim().toLowerCase();

  React.useEffect(() => {
    if (!normalized) {
      setCheck({ status: 'idle' });
      return;
    }
    setCheck({ status: 'checking' });
    const handle = setTimeout(() => {
      void checkSlugAction(normalized).then((res) => {
        if (res.ok) setCheck({ status: 'done', result: res.data });
        else setCheck({ status: 'idle' });
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [normalized]);

  const available = check.status === 'done' && check.result.available;

  function onUse() {
    if (!available) return;
    setSaveError(null);
    startTransition(async () => {
      const res = await saveSlugAction(normalized);
      if (res.ok) nav.onNext();
      else setSaveError(res.error);
    });
  }

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Heading level={3}>Pick your store address</Heading>
        <Text variant="muted">
          Your storefront goes live at this address right away. Connect a custom domain later from
          settings.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Label htmlFor="ob-slug">Subdomain</Label>
        <div className="flex items-center gap-2">
          <Input
            id="ob-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="acme-diesel"
            className="flex-1"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
          <Text variant="muted" className="whitespace-nowrap">
            .{STORE_ZONE}
          </Text>
        </div>

        {check.status === 'checking' && (
          <Stack direction="row" align="center" gap={2}>
            <Spinner size="sm" />
            <Text size="xs" variant="muted">
              Checking availability…
            </Text>
          </Stack>
        )}
        {check.status === 'done' && check.result.available && (
          <Stack direction="row" align="center" gap={1}>
            <Check className="h-4 w-4 text-[var(--color-success-text)]" />
            <Text size="xs" className="text-[var(--color-success-text)]">
              {normalized}.{STORE_ZONE} is available
            </Text>
          </Stack>
        )}
        {check.status === 'done' && !check.result.available && (
          <Stack gap={1}>
            <Text size="xs" variant="danger">
              {REASON_COPY[check.result.reason] ?? 'That subdomain is unavailable.'}
            </Text>
            {check.result.suggestions.length > 0 && (
              <Stack direction="row" align="center" gap={2} className="flex-wrap">
                <Text size="xs" variant="muted">
                  Try:
                </Text>
                {check.result.suggestions.map((s) => (
                  <Button key={s} variant="link" size="sm" onClick={() => setSlug(s)}>
                    {s}
                  </Button>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Stack>

      {saveError && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {saveError}
        </Text>
      )}

      <Stack direction="row" justify="between">
        <Button variant="ghost" onClick={nav.onBack} disabled={pending || nav.navPending}>
          Back
        </Button>
        <Stack direction="row" gap={2}>
          <Button variant="ghost" onClick={nav.onSkip} disabled={pending || nav.navPending}>
            Skip for now
          </Button>
          <Button
            variant="module"
            onClick={onUse}
            disabled={pending || !available}
            loading={pending}
          >
            Use this address
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
