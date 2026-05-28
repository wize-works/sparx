import { expect, test } from '@playwright/test';

// Full CMS pages CRUD round-trip against the real DB:
//   1. List view (may start populated from previous runs — that is fine)
//   2. Create a new page with a unique slug
//   3. Verify it lands on /cms/<id> edit form with the data we entered
//   4. Edit body + SEO fields
//   5. Publish, then revert to draft
//   6. Delete the page
//   7. Confirm the page is gone from the list

test.describe('CMS pages — create, edit, publish, delete', () => {
  test('full round-trip', async ({ page }) => {
    const stamp = Date.now();
    const title = `E2E Page ${stamp}`;
    const slug = `e2e-page-${stamp}`;

    // 1. List view loads (could be empty or populated)
    await page.goto('/cms');
    await expect(page.getByRole('heading', { name: 'CMS', level: 1 })).toBeVisible();

    // 2. Create
    await page.getByRole('link', { name: 'New page' }).click();
    await expect(page).toHaveURL(/\/cms\/new$/);

    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Slug (optional)').fill(slug);
    await page.getByLabel('Content (optional)').fill('Hello from the CRUD test.');
    await page.getByRole('button', { name: 'Create page' }).click();

    // 3. Lands on edit form
    await expect(page).toHaveURL(/\/cms\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'Edit page', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
    await expect(page.getByLabel('Slug')).toHaveValue(slug);
    await expect(page.getByLabel('Body')).toHaveValue('Hello from the CRUD test.');

    const editUrl = page.url();

    // 4. Edit body + SEO and save
    await page.getByLabel('Body').fill('Edited body.');
    await page.getByLabel('SEO title (optional)').fill('SEO E2E');
    await page.getByLabel('Meta description (optional)').fill('Test meta description.');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText('Saved.')).toBeVisible();

    // Reload — values come back from DB
    await page.reload();
    await expect(page.getByLabel('Body')).toHaveValue('Edited body.');
    await expect(page.getByLabel('SEO title (optional)')).toHaveValue('SEO E2E');

    // 5. Publish, then unpublish
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();

    await page.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByText('Reverted to draft.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();

    // 6. Delete — auto-accept the confirm() dialog
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete' }).click();

    // 7. Back to list, page is gone
    await expect(page).toHaveURL(/\/cms$/);
    await expect(page.getByText(title)).not.toBeVisible();

    // Sanity: visiting the deleted edit URL should 404
    const resp = await page.goto(editUrl);
    expect(resp?.status()).toBe(404);
  });

  test('rejects duplicate slug', async ({ page }) => {
    const stamp = Date.now();
    const slug = `dup-${stamp}`;

    // First create
    await page.goto('/cms/new');
    await page.getByLabel('Title', { exact: true }).fill(`First ${stamp}`);
    await page.getByLabel('Slug (optional)').fill(slug);
    await page.getByRole('button', { name: 'Create page' }).click();
    await expect(page).toHaveURL(/\/cms\/[0-9a-f-]+$/);
    const firstUrl = page.url();

    // Second create with same slug
    await page.goto('/cms/new');
    await page.getByLabel('Title', { exact: true }).fill(`Second ${stamp}`);
    await page.getByLabel('Slug (optional)').fill(slug);
    await page.getByRole('button', { name: 'Create page' }).click();

    await expect(page.getByText(/already exists/)).toBeVisible();

    // Clean up the survivor
    page.once('dialog', (d) => d.accept());
    await page.goto(firstUrl);
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/cms$/);
  });
});
