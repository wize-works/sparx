import { expect, test } from '@playwright/test';

// /email — verifies the real send pipeline reaches the active provider.
// In dev the console provider returns a `con_*` id; we assert on that prefix
// + the accepted-status badge, so the test does not depend on Postal being
// stood up.

test.describe('/email — test send', () => {
  test('Send a welcome test email and show the delivery summary', async ({ page }) => {
    await page.goto('/email');

    await expect(page.getByRole('heading', { name: 'Email', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Send a test email', level: 3 })).toBeVisible();

    await page.getByLabel('Recipient').fill('e2e-recipient@sparx.test');
    await page.getByRole('button', { name: 'Send test' }).click();

    await expect(page.getByText('Accepted')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('e2e-recipient@sparx.test')).toBeVisible();
    // Console-provider ids are "con_<base36>_<random>"; the page renders the
    // raw id inside a <code> element.
    await expect(page.getByText(/^con_/)).toBeVisible();
  });

  test('Switching to the password-reset template still delivers', async ({ page }) => {
    await page.goto('/email');

    await page.getByLabel('Recipient').fill('reset-test@sparx.test');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Password reset' }).click();
    await page.getByRole('button', { name: 'Send test' }).click();

    await expect(page.getByText('Accepted')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('reset-test@sparx.test')).toBeVisible();
    await expect(page.getByText('password-reset')).toBeVisible();
  });
});
