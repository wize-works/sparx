import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Playwright "setup" project. Runs once before any dependent project.
// It signs the test user up (or signs them in if they exist) via the real
// dashboard UI, then saves cookies/localStorage to a storageState file the
// chromium project reuses. This keeps every test below authenticated without
// each spec carrying its own login boilerplate.

const TEST_EMAIL = 'e2e-staff@sparx.test';
const TEST_PASSWORD = 'e2e-test-password';
const TEST_NAME = 'E2E Tester';
const TEST_STORE = 'E2E Store';

export const STORAGE_STATE_PATH = path.resolve(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Strategy: try to sign up. If the email is already taken (re-runs against
  // the same dev database), peel off and sign in via the form instead. We
  // drive the UI either way so we exercise the same code paths a real user
  // would — and so the form's router.push('/') lands us on the dashboard
  // before storageState() snapshots cookies.

  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill(TEST_NAME);
  await page.getByLabel('Store name').fill(TEST_STORE);
  await page.getByLabel('Work email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // After a successful sign-up we land on /welcome; after sign-in we land on
  // /. If the email already exists, sign-up surfaces an "already taken"
  // alert and we fall back to the sign-in form. (Next.js renders a global
  // role="alert" announcer; target the specific text instead to avoid
  // strict-mode locator collisions.)
  await Promise.race([
    page.waitForURL(/\/(welcome)?$/, { timeout: 15_000 }),
    page.getByText(/already taken|already exists/).waitFor({ state: 'visible', timeout: 15_000 }),
  ]);

  const onAuthedPage = /\/(welcome)?$/.test(new URL(page.url()).pathname);
  if (!onAuthedPage) {
    // Email already exists — sign in instead.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(TEST_EMAIL);
    await page.getByLabel('Password').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('/');
  }

  // Always land on / before snapshotting so subsequent tests start there.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good morning' })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
