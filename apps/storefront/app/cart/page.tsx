// Cart page. The cart is client state (always fresh, never cached), so this
// server component just frames the client <CartView>.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { CartView } from '@/components/cart-view';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cart',
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  return (
    <div className="sf-container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Cart' }]} />
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 className="sf-h1">Your cart</h1>
      </header>
      <CartView />
    </div>
  );
}
