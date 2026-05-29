// Provider registry. Concrete provider packages register their bundle at
// boot; the providerService.listAvailable() call reads from this registry
// to render the marketplace catalog.

import type { ProviderKind } from '@sparx/commerce-schemas';

import type { DropshipProvider } from './dropship-provider';
import type { ProviderMetadataDescriptor } from './metadata';
import type { PaymentProvider } from './payment-provider';
import type { ShippingProvider } from './shipping-provider';
import type { SubscriptionBilling } from './subscription-billing';
import type { TaxProvider } from './tax-provider';

/**
 * A provider bundle — a single npm package may implement several kinds
 * (e.g. provider-stripe implements PaymentProvider + SubscriptionBilling
 * + TaxProvider). The fields below are the per-kind entry points; null
 * means "this bundle does not implement that kind."
 */
export interface ProviderBundle {
  metadata: ProviderMetadataDescriptor;
  payment?: PaymentProvider;
  tax?: TaxProvider;
  shipping?: ShippingProvider;
  subscriptionBilling?: SubscriptionBilling;
  dropship?: DropshipProvider;
}

class Registry {
  private readonly bySlug = new Map<string, ProviderBundle>();

  register(bundle: ProviderBundle): void {
    if (this.bySlug.has(bundle.metadata.slug)) {
      throw new Error(`Provider already registered: ${bundle.metadata.slug}`);
    }
    this.bySlug.set(bundle.metadata.slug, bundle);
  }

  /** Used by tests to swap in a stub provider. */
  unregister(slug: string): void {
    this.bySlug.delete(slug);
  }

  get(slug: string): ProviderBundle | undefined {
    return this.bySlug.get(slug);
  }

  list(filter: { kind?: ProviderKind } = {}): ProviderBundle[] {
    const all = [...this.bySlug.values()];
    if (!filter.kind) return all;
    return all.filter((b) => b.metadata.kinds.includes(filter.kind!));
  }

  reset(): void {
    this.bySlug.clear();
  }
}

const singleton = new Registry();

export function registerProvider(bundle: ProviderBundle): void {
  singleton.register(bundle);
}

export function unregisterProvider(slug: string): void {
  singleton.unregister(slug);
}

export function getProvider(slug: string): ProviderBundle | undefined {
  return singleton.get(slug);
}

export function listProviders(filter: { kind?: ProviderKind } = {}): ProviderBundle[] {
  return singleton.list(filter);
}

/** Test-only: wipe the registry between cases. */
export function _resetRegistryForTest(): void {
  singleton.reset();
}
