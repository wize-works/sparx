import { expect, test } from '@playwright/test';

// The /cms route wraps its subtree in <ModuleProvider module="cms">.
// We verify that:
//   1. The page renders
//   2. The ModuleProvider sets --module-active to the CMS teal (#14B8A6)
//   3. A `variant="module"` Button inside the subtree adopts that color
// This catches regressions in the entire CSS-variable-context system.

const CMS_TEAL_RGB = 'rgb(20, 184, 166)'; // #14B8A6

test.describe('/cms — module color shift', () => {
  test('ModuleProvider exposes --module-active = CMS teal', async ({ page }) => {
    await page.goto('/cms');

    // Wait for the heading to confirm the page rendered
    await expect(page.getByRole('heading', { name: 'CMS', level: 1 })).toBeVisible();

    // The ModuleProvider renders a <div data-module="cms"> wrapper with
    // --module-active applied inline as a CSS variable.
    const wrapper = page.locator('[data-module="cms"]').first();
    await expect(wrapper).toBeAttached();

    const moduleActive = await wrapper.evaluate(
      (el) => getComputedStyle(el).getPropertyValue('--module-active').trim()
    );
    // Resolved value can be the hex from the inline style; normalize by reading
    // it through a child element's computed background. Cleaner: assert the
    // raw inline custom property contains the CMS hex.
    expect(moduleActive.toLowerCase()).toContain('#14b8a6');
  });

  test('Buttons with variant="module" render in CMS teal', async ({ page }) => {
    await page.goto('/cms');

    // Each card has "View" (variant="module" — solid teal background)
    const viewBtn = page.getByRole('button', { name: 'View' }).first();
    await expect(viewBtn).toBeVisible();

    const bg = await viewBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(CMS_TEAL_RGB);
  });

  test('Drafts-only Switch filters the list', async ({ page }) => {
    await page.goto('/cms');

    // CardTitle renders as h3 — using role+level avoids collision with the
    // dashboard Sidebar's "Home" nav link.
    await expect(page.getByRole('heading', { level: 3, name: 'Home' })).toBeVisible();

    // Toggle "Drafts only"
    await page.getByRole('switch').click();

    // Only Pricing (draft) should remain in the page-card grid
    await expect(page.getByRole('heading', { level: 3, name: 'Pricing' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Home' })).not.toBeVisible();
  });
});
