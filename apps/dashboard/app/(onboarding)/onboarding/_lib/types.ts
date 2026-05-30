// Client-safe types shared across the onboarding wizard. Kept free of any
// server-only import so the wizard islands can pull them into the browser
// bundle without dragging in the api-rest client.

export type OnboardingStepKey = 'business' | 'theme' | 'product' | 'domain' | 'payments' | 'done';

export interface OnboardingCompleted {
  business: boolean;
  theme: boolean;
  product: boolean;
  domain: boolean;
  payments: boolean;
}

/** A theme as the wizard renders it — a few swatches + copy, no token map. */
export interface WizardThemeOption {
  key: string;
  name: string;
  description: string;
  category: string;
  /** Four hex swatches (primary, accent, background, foreground) for the card. */
  swatches: string[];
}

/** Server → wizard handoff. The server component reads these once and the
 *  client wizard drives itself from there (resuming at `step`). */
export interface WizardInitialState {
  step: OnboardingStepKey;
  storeName: string;
  category: string | null;
  slug: string;
  completed: OnboardingCompleted;
}

export type SlugAvailability =
  | { available: true }
  | { available: false; reason: 'invalid' | 'reserved' | 'taken'; suggestions: string[] };

export type WizardResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
