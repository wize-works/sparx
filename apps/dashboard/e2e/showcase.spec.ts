import { expect, test } from '@playwright/test';

// /showcase exercises every @sparx/ui component end-to-end (Next 16 +
// Tailwind 4 + @sparx/ui workspace package + tokens.css import). The
// dashboard home now lives at / — see home.spec.ts.

test.describe('/showcase', () => {
  test('renders the hero, modules, and major sections', async ({ page }) => {
    await page.goto('/showcase');

    await expect(
      page.getByRole('heading', { name: '@sparx/ui Showcase', level: 1 })
    ).toBeVisible();

    // Module grid — one ModuleProvider-wrapped card per module
    for (const m of ['Commerce', 'CMS', 'CRM', 'Email']) {
      await expect(page.getByText(m, { exact: true }).first()).toBeVisible();
    }

    // Section headings (Heading level=3)
    await expect(page.getByRole('heading', { name: 'Buttons' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Form primitives' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Form composition' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pickers & editors' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overlays' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tabs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Data display' })).toBeVisible();
  });

  test('Tabs switch panels when triggers are clicked', async ({ page }) => {
    await page.goto('/showcase');

    await expect(page.getByText('Overview content.')).toBeVisible();
    await page.getByRole('tab', { name: 'Orders' }).click();
    await expect(page.getByText('Orders content.')).toBeVisible();
    await expect(page.getByText('Overview content.')).not.toBeVisible();
  });

  test('font + page background pull from token CSS variables', async ({ page }) => {
    await page.goto('/showcase');

    // tokens.css sets body { background-color: var(--color-bg-page); ... }
    // --color-bg-page is #fafafa in light mode
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(250, 250, 250)');
  });
});
