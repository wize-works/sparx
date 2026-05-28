import { expect, test } from '@playwright/test';

// Every module route should render its ModuleStub: heading, "Module preview"
// badge, and the planned-features grid. We also verify that the ModuleProvider
// applies a data-module attribute matching each route — that attribute is what
// drives CSS-var-based color theming across the subtree.
//
// /email is excluded from the stub matrix — it landed with the @sparx/email
// integration + test-send form. Its own coverage lives in email-send.spec.ts.
// It still belongs in the sidebar nav check below.

const MODULES = [
  { path: '/sitebuilder', title: 'Sitebuilder', dataModule: 'storefront' },
  { path: '/commerce', title: 'Commerce', dataModule: 'commerce' },
  { path: '/crm', title: 'CRM', dataModule: 'crm' },
  { path: '/b2b', title: 'B2B', dataModule: 'b2b' },
  { path: '/dropship', title: 'Dropship', dataModule: 'dropship' },
  { path: '/ai', title: 'AI', dataModule: 'ai' },
];

const SIDEBAR_MODULES = [...MODULES, { path: '/email', title: 'Email' }];

test.describe('Module landing pages', () => {
  for (const m of MODULES) {
    test(`${m.path} renders the ${m.title} stub inside ModuleProvider`, async ({ page }) => {
      await page.goto(m.path);

      await expect(page.getByRole('heading', { level: 1, name: m.title })).toBeVisible();
      await expect(page.getByText('Module preview')).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 3, name: 'What ships in this module' })
      ).toBeVisible();

      const wrapper = page.locator(`[data-module="${m.dataModule}"]`).first();
      await expect(wrapper).toBeAttached();
    });
  }

  test('/settings renders the settings groups (no ModuleProvider)', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Billing & modules' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'API keys' })).toBeVisible();
  });

  test('Sidebar lists every module link', async ({ page }) => {
    await page.goto('/');

    // Discover cards on the home page also wrap module titles in <Link>, so
    // the accessible name includes the description. Use exact match to target
    // only the sidebar nav item.
    for (const m of SIDEBAR_MODULES) {
      await expect(page.getByRole('link', { name: m.title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  });
});
