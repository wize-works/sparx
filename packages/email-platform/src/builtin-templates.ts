// Built-in transactional template catalog.
//
// These render via code-defined React Email components in @sparx/email (keyed
// by `key`). Merchants customize a constrained layer only — subject + intro/
// outro slots + branding (branding is global, via brand-service) — never
// structure, so the typed event props stay safe. The catalog drives the
// dashboard Templates list + the preview's sample data.
//
// Adding a built-in: ship the React Email component + props in @sparx/email,
// extend TemplateSend there, then add a catalog entry here.

import type { TemplateId } from '@sparx/email';

export interface BuiltinTemplate {
  key: TemplateId;
  name: string;
  kind: 'transactional';
  description: string;
  /** Variables available to the merchant (for the dashboard variable picker). */
  variables: string[];
  /** Whether intro/outro editable slots are supported by the component. */
  supportsSlots: boolean;
  /** Default subject (overridable per tenant). */
  defaultSubject: string;
  /** Realistic props for rendering the preview. */
  sampleProps: Record<string, unknown>;
}

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    key: 'welcome-merchant',
    name: 'Welcome',
    kind: 'transactional',
    description: 'Sent when a new store is created — onboarding kickoff.',
    variables: ['name', 'storeName', 'dashboardUrl'],
    supportsSlots: true,
    defaultSubject: 'Welcome to Sparx',
    sampleProps: {
      name: 'Alex',
      storeName: 'Acme Store',
      dashboardUrl: 'https://app.sparx.works/welcome',
    },
  },
  {
    key: 'password-reset',
    name: 'Password reset',
    kind: 'transactional',
    description: 'Sent when a customer requests a password reset link.',
    variables: ['name', 'resetUrl', 'expiresInMinutes'],
    supportsSlots: true,
    defaultSubject: 'Reset your Sparx password',
    sampleProps: {
      name: 'Alex',
      resetUrl: 'https://app.sparx.works/reset?token=sample-token',
      expiresInMinutes: 60,
    },
  },
] as const;

export function getBuiltinTemplate(key: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.key === key);
}

export const BUILTIN_TEMPLATE_KEYS: readonly string[] = BUILTIN_TEMPLATES.map((t) => t.key);
