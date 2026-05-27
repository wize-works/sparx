import { expect, test } from '@playwright/test';

// The dashboard home (/) — Sidebar shell + stats grid + active-modules cards.
// Validates the (dashboard) route-group layout wraps the page correctly and
// that pathname-driven sidebar active state works.

test.describe('Dashboard home (/)', () => {
  test('renders Sidebar + stats + Discover section', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Good morning', level: 1 })).toBeVisible();

    // Sidebar items
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CMS' })).toBeVisible();

    // Stats — at least one expected card visible
    await expect(page.getByText('Revenue (30d)')).toBeVisible();
    await expect(page.getByText('$12,408')).toBeVisible();

    // Discover (placeholder modules) — "Commerce" also lives in the sidebar
    // as a nav link, so target it via its description inside the card.
    await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
    await expect(page.getByText('Products, orders, checkout')).toBeVisible();
  });

  test('Sidebar marks the current route as active', async ({ page }) => {
    await page.goto('/');
    // SidebarItem renders the asChild Link wrapped in the styled element;
    // the active flag becomes data-active on the rendered element.
    const home = page.locator('[data-active="true"]', { hasText: 'Home' });
    await expect(home).toBeVisible();
  });

  test('clicking the CMS sidebar item navigates to /cms', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'CMS' }).click();
    await expect(page).toHaveURL(/\/cms$/);
    await expect(page.getByRole('heading', { name: 'CMS', level: 1 })).toBeVisible();
  });
});
