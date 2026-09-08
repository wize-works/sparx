// Client for the dashboard's internal partner account-provisioning route
// (docs/114 §B.2). Account creation runs only where Better Auth lives — the
// dashboard — so approving an accountless partner (the operator seam has no
// account-creation power of its own) delegates the tenant + owner + set-password
// invite to POST {dashboard}/api/internal/partner-provision. Authenticated with
// the shared internal secret (SPARX_INTERNAL_JWT_SECRET, already trusted both
// ways). The dashboard owns the Better Auth writes; api-rest owns the partner row.

import { env } from '../../env.js';

const TOKEN_HEADER = 'x-sparx-internal-provision-token';
const TIMEOUT_MS = 15_000;

export type ProvisionAccountErrorCode =
  'EMAIL_TAKEN' | 'INVALID_INPUT' | 'UNAVAILABLE' | 'PROVISION_FAILED';

/** A typed failure from the dashboard provisioning call — the approve path maps
 *  these to operator-facing errors (EMAIL_TAKEN → a clear "already has an account"
 *  conflict, the rest → a generic bad-gateway). */
export class ProvisionAccountError extends Error {
  constructor(
    public code: ProvisionAccountErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ProvisionAccountError';
  }
}

export interface ProvisionedAccount {
  tenantId: string;
  userId: string;
  slug: string;
}

/** Provision a tenant + owner login for an approved-but-accountless applicant and
 *  trigger their set-password invite. Delegates to the dashboard; throws a typed
 *  ProvisionAccountError on any non-2xx (mapping the dashboard's 409 EMAIL_TAKEN). */
export async function provisionPartnerAccount(input: {
  email: string;
  name: string;
}): Promise<ProvisionedAccount> {
  const secret = env.SPARX_INTERNAL_JWT_SECRET;
  const base = env.SPARX_DASHBOARD_INTERNAL_URL.replace(/\/$/, '');
  const url = `${base}/api/internal/partner-provision`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [TOKEN_HEADER]: secret,
      },
      body: JSON.stringify({ email: input.email, name: input.name }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ProvisionAccountError(
      'UNAVAILABLE',
      `Could not reach the account-provisioning service: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) {
    const data = (await res.json()) as Partial<ProvisionedAccount>;
    if (!data.tenantId || !data.userId || !data.slug) {
      throw new ProvisionAccountError(
        'PROVISION_FAILED',
        'Provisioning returned an invalid result.'
      );
    }
    return { tenantId: data.tenantId, userId: data.userId, slug: data.slug };
  }

  let code: ProvisionAccountErrorCode = 'PROVISION_FAILED';
  let message = `Provisioning failed (HTTP ${res.status}).`;
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    if (body.code === 'EMAIL_TAKEN') code = 'EMAIL_TAKEN';
    else if (body.code === 'INVALID_INPUT') code = 'INVALID_INPUT';
    if (body.message) message = body.message;
  } catch {
    // non-JSON error body — keep the status-derived defaults
  }
  throw new ProvisionAccountError(code, message);
}
