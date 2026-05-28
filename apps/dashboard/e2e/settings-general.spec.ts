import { expect, test } from '@playwright/test';

// Exercises the first DB-backed page round-trip:
//   1. /settings/general loads the seeded test tenant from Postgres
//   2. Saving a new store name calls the server action → withTenant() → Prisma
//   3. The tenant row is updated; reloading the page shows the new value
//
// Uses the authenticated storageState from auth.setup.ts (chromium project).

test.describe('/settings/general — DB round-trip', () => {
  test('renders the tenant row and persists edits', async ({ page }) => {
    await page.goto('/settings/general');

    await expect(page.getByRole('heading', { name: 'General settings' })).toBeVisible();

    const nameField = page.getByLabel('Store name');
    const emailField = page.getByLabel('Contact email');

    // Tenant data was created by auth.setup.ts with name="E2E Store".
    await expect(nameField).toHaveValue(/E2E Store/);
    await expect(emailField).toHaveValue('e2e-staff@sparx.test');

    // Slug + plan render as read-only.
    await expect(page.getByLabel('Store URL')).toBeDisabled();
    await expect(page.getByLabel('Plan')).toBeDisabled();

    const newName = `E2E Store ${Date.now()}`;
    await nameField.fill(newName);
    await page.getByRole('button', { name: 'Save changes' }).click();

    // The Button spinner also has role="status" while pending — wait for the
    // confirmation text directly so we don't race against the loading state.
    await expect(page.getByText('Settings saved.')).toBeVisible();

    // Reload — the new value must come back from the DB, not just stay in
    // the form's local state.
    await page.reload();
    await expect(page.getByLabel('Store name')).toHaveValue(newName);
  });

  test('rejects an invalid email', async ({ page }) => {
    await page.goto('/settings/general');

    await page.getByLabel('Contact email').fill('not-an-email');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText(/valid email/i)).toBeVisible();
  });
});

test.describe('/settings landing → /settings/general', () => {
  test('"Open" on the General card navigates to the form', async ({ page }) => {
    await page.goto('/settings');

    // Only the General card is wired up — the rest are disabled buttons (not
    // links), so the only "Open" link role on the page lands on /settings/general.
    await page.getByRole('link', { name: 'Open' }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
    await expect(page.getByRole('heading', { name: 'General settings' })).toBeVisible();
  });
});
