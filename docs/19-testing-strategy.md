# WizeWorks Platform — Testing Strategy

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Philosophy

Testing is a first-class concern, not an afterthought. The goal is confidence in deployments, not 100% coverage for its own sake. Tests are written at the level that gives the most signal for the least maintenance cost:

- **Unit tests** for pure functions, business logic, and utility code
- **Integration tests** for API routes and service interactions (with real DB)
- **E2E tests** for critical user journeys (with real browser)
- **Load tests** for performance validation at scale

The testing pyramid: many unit tests, fewer integration tests, fewer E2E tests, occasional load tests.

---

## 2. Unit Tests (Vitest)

### What Gets Unit Tested

- Business logic functions (pricing calculations, discount application, inventory math)
- Validation schemas (Zod schemas generate a lot of edge cases)
- Utility functions (formatCurrency, slugify, date helpers)
- React component rendering (snapshot + behavior)
- Custom hooks
- Adapter/connector logic (dropship adapters with mocked API responses)

### Setup

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node', // 'jsdom' for component tests
    coverage: {
      provider: 'v8',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Example: Pricing Calculation Test

```typescript
describe('calculateB2BPrice', () => {
  it('applies tier discount to list price', () => {
    const result = calculateB2BPrice({
      listPrice: 100,
      tier: { discountPercent: 20, discountType: 'percentage' },
    });
    expect(result).toBe(80);
  });

  it('stacks account discount on top of tier discount', () => {
    const result = calculateB2BPrice({
      listPrice: 100,
      tier: { discountPercent: 20 },
      accountDiscount: 5,
    });
    expect(result).toBe(76); // 100 * 0.80 * 0.95
  });

  it('never returns price below cost', () => {
    const result = calculateB2BPrice({
      listPrice: 10,
      cost: 8,
      tier: { discountPercent: 50 },
    });
    expect(result).toBeGreaterThanOrEqual(8);
  });
});
```

### Coverage Targets

| Package          | Branch | Function | Line |
| ---------------- | ------ | -------- | ---- |
| `api` services   | 85%    | 85%      | 85%  |
| `ui` components  | 75%    | 80%      | 75%  |
| `storefront-sdk` | 90%    | 90%      | 90%  |
| Business logic   | 90%    | 90%      | 90%  |

---

## 3. Integration Tests (Vitest + Testcontainers)

Integration tests run against real services (PostgreSQL, Redis) spun up via Docker:

```typescript
// test/integration/setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:16').start();
  redisContainer = await new RedisContainer('redis:7').start();

  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getFirstMappedPort()}`;

  await runMigrations();
  await seedTestData();
}, 60_000);

afterAll(async () => {
  await pgContainer.stop();
  await redisContainer.stop();
});
```

### What Gets Integration Tested

- Every API route (request → response, with real DB)
- Authentication flows (register, login, refresh, logout)
- Multi-tenant isolation (tenant A cannot access tenant B data)
- Order creation and state machine transitions
- Inventory decrement on checkout
- Email automation trigger on order creation
- Domain verification worker
- Webhook delivery

### API Route Test Example

```typescript
describe('POST /v1/products', () => {
  it('creates a product for the authenticated tenant', async () => {
    const { token, tenantId } = await createTestTenant();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Test Product', status: 'active', variants: [{ price: 99.99 }] },
    });

    expect(response.statusCode).toBe(201);
    const { data } = response.json();
    expect(data.tenant_id).toBe(tenantId);
    expect(data.title).toBe('Test Product');
  });

  it("cannot access another tenant's products", async () => {
    const { token: tokenA } = await createTestTenant();
    const { productId: productB } = await createTestProduct(await createTestTenant());

    const response = await app.inject({
      method: 'GET',
      url: `/v1/products/${productB}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(response.statusCode).toBe(404); // Not 403 — don't confirm existence
  });
});
```

---

## 4. E2E Tests (Playwright)

E2E tests run against the full deployed application (staging environment) after every merge to main.

### Test Suites

**Critical Path Suite** (runs on every deploy, must pass for deployment to proceed):

- Merchant signup → onboarding → live store
- Add product → publish → visible on storefront
- Customer places order → checkout → order confirmation
- Order fulfillment → tracking email sent
- Merchant admin views order dashboard

**Extended Suite** (runs nightly):

- Custom domain setup flow
- B2B account creation → quote workflow → order
- Email automation triggered by abandoned cart
- Dropship supplier connection → product import
- MCP tool execution
- Billing: upgrade plan → feature unlocked

**Accessibility Suite** (runs on every PR):

- axe-playwright scan on all major pages
- Keyboard navigation through checkout
- Screen reader compatibility check

### Playwright Config

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://staging.wizeworks.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'mobile', use: devices['iPhone 14'] },
  ],
  reporter: [['html', { outputFolder: 'playwright-report' }], ['github']],
});
```

### E2E Example: Merchant Onboarding

```typescript
test('merchant can complete onboarding in under 5 minutes', async ({ page }) => {
  const start = Date.now();

  await page.goto('/register');
  await page.fill('[name=email]', `test+${Date.now()}@example.com`);
  await page.fill('[name=password]', 'SecurePass123!');
  await page.fill('[name=business_name]', 'Test Diesel Co');
  await page.click('[type=submit]');

  // Step 2: Theme
  await page.waitForURL('/onboarding/step-2');
  await page.click('[data-theme=industrial]');
  await page.click('text=Continue');

  // Step 3: Product
  await page.waitForURL('/onboarding/step-3');
  await page.fill('[name=title]', 'Bosch Injector Set');
  await page.fill('[name=price]', '299.99');
  await page.click('text=Add Product');

  // Step 4: Domain (accept suggested)
  await page.waitForURL('/onboarding/step-4');
  await page.click('text=Continue with this domain');

  // Step 5: Skip payments for test
  await page.waitForURL('/onboarding/step-5');
  await page.click('text=Skip for now');

  await page.waitForURL('/dashboard');

  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(5 * 60 * 1000); // Under 5 minutes

  // Verify store is live
  const slug = await page.locator('[data-testid=store-url]').textContent();
  await page.goto(slug!);
  await expect(page.locator('text=Bosch Injector Set')).toBeVisible();
});
```

---

## 5. Load Tests (k6)

Load tests run on demand (before major launches, after significant changes).

### Scenarios

**Storefront Load Test:**

- 1,000 concurrent users browsing storefront
- Mix: 60% product pages, 25% collection pages, 15% search
- Duration: 10 minutes
- Pass criteria: p95 < 300ms, error rate < 0.1%

**Checkout Load Test:**

- 100 concurrent users completing checkout simultaneously
- Validates inventory atomicity (no overselling)
- Pass criteria: p95 < 1s, zero inventory errors

**API Load Test:**

- 500 req/min sustained for 30 minutes
- Mix: 70% GET, 30% POST/PATCH
- Pass criteria: p95 < 200ms, p99 < 500ms

```javascript
// k6 scenario: storefront load
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 200 }, // Ramp up
    { duration: '10m', target: 1000 }, // Sustain
    { duration: '2m', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const product = http.get(`${BASE_URL}/products/test-product`);
  check(product, { 'product page 200': (r) => r.status === 200 });
  sleep(1);
}
```

---

## 6. Test Data Management

### Test Tenant Factory

```typescript
async function createTestTenant(overrides = {}) {
  const tenant = await db.tenant.create({
    data: {
      slug: `test-${nanoid(8)}`,
      name: 'Test Store',
      plan: 'pro',
      ...overrides,
    },
  });
  const token = generateTestJWT(tenant.id);
  return { tenant, token };
}
```

### Seed Data

- `db:seed:test` — Seeds minimal data for integration tests
- `db:seed:demo` — Seeds realistic demo data for staging environment
- `db:reset` — Drops and recreates test DB with fresh seed

### Test Isolation

Each integration test runs in a transaction that is rolled back after the test. Guarantees clean state without slow truncation.

```typescript
beforeEach(async () => {
  await db.$executeRaw`BEGIN`;
});
afterEach(async () => {
  await db.$executeRaw`ROLLBACK`;
});
```

---

## 7. CI Integration

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - name: Unit tests
        run: pnpm test:unit --coverage

      - name: Integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

      - name: Upload coverage
        uses: codecov/codecov-action@v4

  e2e:
    needs: [build, deploy-staging]
    steps:
      - name: E2E critical path
        run: pnpm test:e2e --project=chromium --grep=@critical
        env:
          E2E_BASE_URL: https://staging.wizeworks.com

      - name: Upload playwright report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```
