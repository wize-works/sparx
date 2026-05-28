import { expect, test } from '@playwright/test';

// Auth flow — runs without the dashboard's storageState cookie so we can
// exercise sign-in/sign-up/forgot-password as a fresh visitor. The chromium
// project's storage state is created by auth.setup.ts and reused everywhere
// else; here we want the opposite.

test.describe('Unauthenticated routing', () => {
  test('hitting /(dashboard) routes redirects to /sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('Sign-in page', () => {
  test('renders the form with link to sign-up and forgot-password', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });

  test('shows an error for unknown credentials', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('nobody@nowhere.test');
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Next.js renders a global role="alert" announcer at the page root; match
    // the in-form error text so we don't collide with it.
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });
});

test.describe('Sign-up page', () => {
  test('renders the form with link to sign-in', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create your Sparx account' })).toBeVisible();
    await expect(page.getByLabel('Your name')).toBeVisible();
    await expect(page.getByLabel('Store name')).toBeVisible();
    await expect(page.getByLabel('Work email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });
});

test.describe('Forgot-password page', () => {
  test('shows a generic confirmation after submission', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('someone@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    // We always show the same confirmation regardless of whether the account
    // exists — avoids leaking which emails are registered.
    await expect(page.getByText(/within a minute/)).toBeVisible();
  });
});
