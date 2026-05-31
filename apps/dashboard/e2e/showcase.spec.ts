import { expect, test } from '@playwright/test';

// /showcase exercises every @sparx/ui component end-to-end (Next 16 +
// Tailwind 4 + @sparx/ui workspace package + tokens.css import). The
// dashboard home now lives at / — see home.spec.ts.

test.describe('/showcase', () => {
  test('renders the hero, modules, and major sections', async ({ page }) => {
    await page.goto('/showcase');

    await expect(
      page.getByRole('heading', { name: '@sparx/ui Variant System', level: 1 })
    ).toBeVisible();

    // Module grid — one ModuleProvider-wrapped card per module
    for (const m of ['Commerce', 'CMS', 'CRM', 'Email']) {
      await expect(page.getByText(m, { exact: true }).first()).toBeVisible();
    }

    // Section headings (Heading level=3)
    await expect(page.getByRole('heading', { name: 'Palette' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Buttons — color × variant' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Badges & Tags — color × variant' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Controls — color on state' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inputs — size & state' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tabs — variant × size' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Accordion' })).toBeVisible();
  });

  test('Tabs switch panels when triggers are clicked', async ({ page }) => {
    await page.goto('/showcase');

    await expect(page.getByText('Underline, large.')).toBeVisible();
    await page.getByRole('tab', { name: 'Orders' }).click();
    await expect(page.getByText('Orders.', { exact: true })).toBeVisible();
    await expect(page.getByText('Underline, large.')).not.toBeVisible();
  });

  test('Accordion expands a panel when its trigger is clicked', async ({ page }) => {
    await page.goto('/showcase');

    const trigger = page.getByRole('button', { name: 'Section B' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  test('font + page background pull from token CSS variables', async ({ page }) => {
    await page.goto('/showcase');

    // tokens.css sets body { background-color: var(--color-bg-page); ... }
    // --color-bg-page is #fafafa in light mode
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(250, 250, 250)');
  });
});
