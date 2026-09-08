'use client';

// Step 3 — Workspace (the work pane). A controlled form: company name, the free
// web address (slug, with live availability), and the first site's name. Every value
// is lifted to the orchestrator so the setup card echoes the address live and its
// Continue can save them. The slug is the last chance to change the address before
// launch locks it — so its availability is checked as you type.

import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  Loading,
} from '@wizeworks/silicaui-react';
import type { SlugAvailability } from '../../../lib/onboarding/types';

const SITE_ZONE = 'sparx.zone';

/** The live availability of the typed slug, owned + debounced by the orchestrator. */
export type SlugCheck =
  { status: 'idle' } | { status: 'checking' } | { status: 'done'; result: SlugAvailability };

const REASON_COPY: Record<string, string> = {
  invalid: 'Use lowercase letters, numbers, and hyphens (3–63 characters).',
  reserved: 'That address is reserved — try another.',
  taken: 'That address is already taken — try another.',
};

export function StepWorkspace({
  companyName,
  slug,
  siteName,
  onCompany,
  onSlug,
  onSite,
  check,
  unchangedSlug,
  showErrors,
}: {
  companyName: string;
  slug: string;
  siteName: string;
  onCompany: (v: string) => void;
  onSlug: (v: string) => void;
  onSite: (v: string) => void;
  check: SlugCheck;
  /** True while the slug still equals the one already saved — no need to re-check. */
  unchangedSlug: boolean;
  /** The orchestrator flips this on a failed Continue so empty required fields
   *  reveal their error only after an attempt, not on a pristine pre-filled form. */
  showErrors: boolean;
}) {
  const normalized = slug.trim().toLowerCase();
  const result = !unchangedSlug && check.status === 'done' ? check.result : null;
  const slugAvailable = result?.available === true;
  const slugUnavailable = result != null && !result.available;

  const companyError = showErrors && companyName.trim().length === 0 ? 'Add a company name.' : null;
  const siteError = showErrors && siteName.trim().length === 0 ? 'Name your first site.' : null;

  return (
    <div className="border-base-300 bg-base-100 flex max-w-xl flex-col gap-5 rounded-xl border p-6">
      <Field>
        <FieldLabel required>Company name</FieldLabel>
        <FieldControl
          render={
            <Input
              color={companyError ? 'error' : 'module'}
              value={companyName}
              onChange={(e) => onCompany(e.target.value)}
              placeholder="Bob's Barbers"
            />
          }
        />
        {companyError ? (
          <FieldStatus status="error">{companyError}</FieldStatus>
        ) : (
          <FieldDescription>The business this workspace belongs to.</FieldDescription>
        )}
      </Field>

      <Field>
        <FieldLabel required>Your web address</FieldLabel>
        <div className="flex items-center gap-2">
          <FieldControl
            render={
              <Input
                color={slugUnavailable ? 'error' : slugAvailable ? 'success' : 'module'}
                value={slug}
                onChange={(e) => onSlug(e.target.value)}
                placeholder="bobs-barbers"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            }
          />
          <span className="whitespace-nowrap">.{SITE_ZONE}</span>
        </div>

        {check.status === 'checking' && !unchangedSlug ? (
          <div className="flex items-center gap-2">
            <Loading size="sm" />
            <span className="text-sm">Checking availability…</span>
          </div>
        ) : null}

        {slugAvailable ? (
          <FieldStatus status="success">
            {normalized}.{SITE_ZONE} is available
          </FieldStatus>
        ) : null}

        {slugUnavailable && result && !result.available ? (
          <div className="flex flex-col gap-1.5">
            <FieldStatus status="error">
              {REASON_COPY[result.reason] ?? 'That address is unavailable.'}
            </FieldStatus>
            {result.suggestions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm">Try:</span>
                {result.suggestions.map((s) => (
                  <Button key={s} color="module" variant="link" size="sm" onClick={() => onSlug(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!slugAvailable && !slugUnavailable && check.status !== 'checking' ? (
          <FieldDescription>
            Your site goes live here the moment you launch — free, and yours to keep.
          </FieldDescription>
        ) : null}
      </Field>

      <Field>
        <FieldLabel required>Site name</FieldLabel>
        <FieldControl
          render={
            <Input
              color={siteError ? 'error' : 'module'}
              value={siteName}
              onChange={(e) => onSite(e.target.value)}
              placeholder="Primary"
            />
          }
        />
        {siteError ? (
          <FieldStatus status="error">{siteError}</FieldStatus>
        ) : (
          <FieldDescription>You can add more sites later.</FieldDescription>
        )}
      </Field>
    </div>
  );
}
