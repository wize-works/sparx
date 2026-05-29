// Marketplace-side metadata. Mirrors commerce-schemas/providers.ts
// ProviderMetadata but is the package-author-facing shape (literal-typed
// JSON Schema instead of a Zod object) so a provider package can declare
// its install card without depending on Zod at the package surface.

import type { ProviderKind } from '@sparx/commerce-schemas';

export interface ProviderMetadataDescriptor {
  slug: string;
  displayName: string;
  description: string;
  vendor: string;
  logoMediaUrl?: string;
  kinds: ProviderKind[];
  supportedCurrencies: string[];
  supportedCountries: string[];
  sandboxAvailable: boolean;
  whitelabelOf?: string;
  /** JSON Schema (stringified) describing the merchant configuration form. */
  configSchemaJson: string;
  webhookPathTemplate: string;
  requiredScopes: string[];
}
