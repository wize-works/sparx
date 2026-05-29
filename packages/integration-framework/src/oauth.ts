// OAuth helper shared by provider packages whose install flow uses
// OAuth (Stripe Connect, future PayPal Connect). Keeps the dance shape
// uniform — providers only contribute the URL builder + token exchange.

export interface OAuthFlowDescriptor {
  /** Start URL the dashboard redirects to. Built per-tenant + per-install
   *  so the provider can correlate the callback to the right installation. */
  buildAuthorizeUrl(input: {
    installationId: string;
    state: string; // signed JWT carrying tenantId + installationId
    redirectUri: string;
    scopes: string[];
  }): string;

  /** Exchange the authorization code for tokens. The platform stores the
   *  refresh token (encrypted) and rotates the access token automatically. */
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds: number;
    scope: string;
    providerAccountId?: string;
  }>;

  /** Refresh the access token using the stored refresh token. */
  refreshToken(input: { refreshToken: string; clientId: string; clientSecret: string }): Promise<{
    accessToken: string;
    expiresInSeconds: number;
    /** Some providers rotate the refresh token on refresh. */
    refreshToken?: string;
  }>;
}

/** Verify that the OAuth callback `state` value matches the one the
 *  platform signed when redirecting to the provider. The verifier is
 *  injected so this package doesn't take a JWT dependency; callers in
 *  api-rest pass `@sparx/auth`'s signer. */
export function assertStateMatches(input: {
  state: string;
  verify: (state: string) => { tenantId: string; installationId: string } | null;
}): { tenantId: string; installationId: string } {
  const decoded = input.verify(input.state);
  if (!decoded) {
    throw new Error('OAuth state verification failed');
  }
  return decoded;
}
