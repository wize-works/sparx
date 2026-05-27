import { expect, test } from '@playwright/test';

// Modal flow on /showcase: trigger opens a Radix Dialog; Close button and
// Escape both dismiss it. The showcase is long — scrollIntoView before
// clicking, otherwise the auto-scroll occasionally lands on an offscreen
// position and the click is missed under Chromium.

test.describe('Modal interaction', () => {
  test('opens on trigger, closes on the X', async ({ page }) => {
    await page.goto('/showcase');

    await expect(page.getByRole('dialog')).toHaveCount(0);

    const trigger = page.getByRole('button', { name: 'Modal', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Delete tenant?')).toBeVisible();
    await expect(dialog.getByText(/retained 30 days/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Escape dismisses an open modal', async ({ page }) => {
    await page.goto('/showcase');
    const trigger = page.getByRole('button', { name: 'Modal', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
