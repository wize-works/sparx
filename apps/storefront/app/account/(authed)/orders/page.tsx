'use client';

// Order history. Lists the signed-in customer's orders (most recent first)
// with status + total, linking to per-order detail.

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useCustomer } from '@/components/customer-provider';
import { getOrders, type OrderSummary } from '@/lib/customer-client';
import { formatMoney } from '@/lib/format';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function OrdersPage() {
  const { tenantSlug } = useCustomer();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOrders(tenantSlug)
      .then((res) => active && setOrders(res.orders))
      .catch(() => active && setError('Could not load your orders.'));
    return () => {
      active = false;
    };
  }, [tenantSlug]);

  return (
    <div>
      <h1 className="sf-h2" style={{ marginBottom: '1.25rem' }}>
        Orders
      </h1>

      {error ? (
        <div className="sf-alert sf-alert--error" role="alert">
          {error}
        </div>
      ) : orders === null ? (
        <div className="sf-skeleton" style={{ height: 160 }} />
      ) : orders.length === 0 ? (
        <div className="sf-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="sf-muted" style={{ marginBottom: '1rem' }}>
            You haven’t placed any orders yet.
          </p>
          <Link href="/products" className="sf-btn sf-btn--primary">
            Start shopping
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/account/orders/${o.id}`}
              className="sf-card"
              style={{
                padding: '1rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div>
                <strong>#{o.orderNumber}</strong>
                <div className="sf-muted" style={{ fontSize: '0.85rem' }}>
                  {formatDate(o.placedAt)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className="sf-badge" data-status={o.status}>
                  {o.status}
                </span>
                <strong>{formatMoney(o.totalCents, o.currency)}</strong>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
