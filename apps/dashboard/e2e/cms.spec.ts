import { expect, test } from '@playwright/test';

// /cms — verify the ModuleProvider color shift still flows through the new
// DB-backed list page. CRUD round-trip is exercised in cms-crud.spec.ts.

const CMS_TEAL_RGB = 'rgb(20, 184, 166)'; // #14B8A6

test.describe('/cms — module color shift', () => {
  test('ModuleProvider exposes --module-active = CMS teal', async ({ page }) => {
    await page.goto('/cms');

    await expect(page.getByRole('heading', { name: 'CMS', level: 1 })).toBeVisible();

    const wrapper = page.locator('[data-module="cms"]').first();
    await expect(wrapper).toBeAttached();

    const moduleActive = await wrapper.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--module-active').trim()
    );
    expect(moduleActive.toLowerCase()).toContain('#14b8a6');
  });

  test('"New page" CTA renders in CMS teal', async ({ page }) => {
    await page.goto('/cms');

    const newPage = page.getByRole('link', { name: 'New page' });
    await expect(newPage).toBeVisible();

    const bg = await newPage.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(CMS_TEAL_RGB);
  });
});
