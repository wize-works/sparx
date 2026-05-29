import { expect, test, type Locator, type Page } from '@playwright/test';

// Autosave smoke test against a live page entry.
//
// Verifies the debounced save loop fires after a keystroke, the
// "Saved 12:34" pill appears, and a reload shows the persisted body
// without anyone clicking the explicit Save button.

function bodyEditor(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Page body editor' });
}

test.describe('CMS autosave', () => {
  test('debounced save persists keystrokes without explicit Save', async ({ page }) => {
    const stamp = Date.now();
    const title = `Autosave ${stamp}`;
    const slug = `autosave-${stamp}`;

    await page.goto('/cms/new');
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Slug (optional)').fill(slug);
    await page.getByRole('button', { name: 'Create page' }).click();
    await page.waitForURL(/\/cms\/[0-9a-f-]+$/, { timeout: 20_000 });
    const editUrl = page.url();

    // Type into the editor and wait for the autosave pill to flip to "Saved".
    const editor = bodyEditor(page);
    await editor.click();
    await page.keyboard.type('Autosaved keystrokes.');

    // The pill shows "Saving…" then "Saved {time}". We just look for the
    // 'Saved ' prefix to land within a generous window.
    await expect(page.getByText(/Saved \d/)).toBeVisible({ timeout: 10_000 });

    // Reload and confirm the body persisted — never clicked Save changes.
    await page.reload();
    await expect(bodyEditor(page)).toContainText('Autosaved keystrokes.');

    // Clean up.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/cms$/);
    const resp = await page.goto(editUrl);
    expect(resp?.status()).toBe(404);
  });
});
