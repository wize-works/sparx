// Checkout page. The flow is fully client-driven (cart + Stripe + session
// state), so this server component just resolves the tenant and frames the
// client <CheckoutFlow>.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CheckoutFlow } from '@/components/checkout/checkout-flow';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  return (
    <div className="sf-container" style={{ paddingBlock: '2rem' }}>
      <h1 className="sf-h1" style={{ marginBottom: '1.5rem' }}>
        Checkout
      </h1>
      <CheckoutFlow tenantSlug={tenant.slug} />
    </div>
  );
}
