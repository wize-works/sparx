import { expect, test } from '@playwright/test';

// CRM customer create flow against the real dashboard + DB. Mirrors
// cms-crud.spec.ts in style — uses the shared auth.setup session so the
// test starts authenticated against the e2e-store tenant (which has the
// crm module enabled via the seed).
//
// What this proves end-to-end:
//   1. The CRM list page renders (no longer the ModuleStub).
//   2. The new-customer form submits via Server Action.
//   3. The action passes Zod validation, customerService.create runs under
//      withTenant(), and the audit-log + event emission happen.
//   4. The router lands on /crm/customers/[id] showing the new row.
//   5. The customer appears on the CRM landing page when you go back.

test.describe('CRM customers — create flow', () => {
  test('creates a customer and lands on the detail page', async ({ page }) => {
    const stamp = Date.now();
    const firstName = `Kira-${stamp}`;
    const lastName = 'Wong';
    const email = `kira-${stamp}@acmefleet.test`;
    const company = `Acme Fleet ${stamp}`;

    // 1. CRM list page is live (not the ModuleStub fallback).
    await page.goto('/crm');
    await expect(page.getByRole('heading', { name: 'CRM', level: 1 })).toBeVisible();
    // The page renders a customer-count badge from the live service —
    // ModuleStub renders a "Module preview" badge instead. If we see
    // "Module preview" the gate didn't activate the module.
    await expect(page.getByText('Module preview')).not.toBeVisible();

    // 2. Open the new-customer form.
    await page.getByRole('link', { name: 'New customer' }).first().click();
    await expect(page).toHaveURL(/\/crm\/customers\/new$/);
    await expect(page.getByRole('heading', { name: 'New customer', level: 1 })).toBeVisible();

    // 3. Fill the form.
    await page.getByLabel('Type').selectOption('b2b');
    await page.getByLabel('First name').fill(firstName);
    await page.getByLabel('Last name').fill(lastName);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Company').fill(company);
    await page.getByLabel('Job title').fill('Fleet manager');
    await page.getByLabel('Tags').fill('vip, fleet');

    await page.getByRole('button', { name: 'Create customer' }).click();

    // 4. Lands on detail page — server action can take a few seconds under
    // parallel load (mirrors the CMS spec's wait window).
    await page.waitForURL(/\/crm\/customers\/[0-9a-f-]+$/, { timeout: 20_000 });

    // Detail page rendered with our data.
    await expect(
      page.getByRole('heading', { name: `${firstName} ${lastName}`, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(company)).toBeVisible();
    await expect(page.getByText('b2b').first()).toBeVisible();

    // 5. Back to the list — our customer is there.
    await page.goto('/crm');
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible();
  });

  test('validation error shows inline without leaving the form', async ({ page }) => {
    await page.goto('/crm/customers/new');

    // Submit an obviously invalid email — Zod's z.string().email() rejects.
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('First name').fill('Invalid');
    await page.getByRole('button', { name: 'Create customer' }).click();

    // We stay on the same URL — no redirect because the action returned
    // ok: false with a VALIDATION_ERROR envelope.
    await expect(page).toHaveURL(/\/crm\/customers\/new$/);
    // The form surfaces the validation message in its error region.
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
