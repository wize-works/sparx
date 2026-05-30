'use client';

// Single order detail — line items, totals, shipping address, status.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useCustomer } from '@/components/customer-provider';
import { getOrder, AccountError, type OrderDetail } from '@/lib/customer-client';
import { formatMoney } from '@/lib/format';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function addressLine(addr: Record<string, unknown> | null): string | null {
  if (!addr) return null;
  const parts = [
    addr.recipientName,
    addr.line1,
    addr.line2,
    [addr.city, addr.region, addr.postalCode].filter(Boolean).join(', '),
    addr.country,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.length ? parts.join(' · ') : null;
}

export default function OrderDetailPage() {
  const { tenantSlug } = useCustomer();
  const params = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOrder(tenantSlug, params.orderId)
      .then((o) => active && setOrder(o))
      .catch((err) =>
        active
          ? setError(err instanceof AccountError && err.status === 404 ? 'notfound' : 'error')
          : null
      );
    return () => {
      active = false;
    };
  }, [tenantSlug, params.orderId]);

  if (error === 'notfound') {
    return (
      <div>
        <p className="sf-muted" style={{ marginBottom: '1rem' }}>
          We couldn’t find that order.
        </p>
        <Link href="/account/orders" className="sf-btn sf-btn--secondary">
          ← Back to orders
        </Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="sf-alert sf-alert--error" role="alert">
        Could not load this order.
      </div>
    );
  }
  if (!order) return <div className="sf-skeleton" style={{ height: 320 }} />;

  const ship = addressLine(order.shippingAddress);

  return (
    <div>
      <Link href="/account/orders" className="sf-muted" style={{ fontSize: '0.85rem' }}>
        ← Orders
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '1rem',
          margin: '0.5rem 0 1.5rem',
        }}
      >
        <h1 className="sf-h2">Order #{order.orderNumber}</h1>
        <span className="sf-badge" data-status={order.status}>
          {order.status}
        </span>
      </div>
      <p className="sf-muted" style={{ marginBottom: '1.5rem' }}>
        Placed {formatDate(order.placedAt)} · {order.paymentStatus}
      </p>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}
      >
        {order.items.map((it) => (
          <div
            key={it.id}
            style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}
          >
            <span>
              {it.name}
              <span className="sf-muted"> × {it.quantity}</span>
            </span>
            <strong>{formatMoney(it.lineTotalCents, order.currency)}</strong>
          </div>
        ))}
      </div>

      <div className="sf-summary" style={{ maxWidth: 360, marginLeft: 'auto' }}>
        <div className="sf-summary__row">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotalCents, order.currency)}</span>
        </div>
        {order.discountTotalCents > 0 ? (
          <div className="sf-summary__row">
            <span>Discount</span>
            <span>−{formatMoney(order.discountTotalCents, order.currency)}</span>
          </div>
        ) : null}
        <div className="sf-summary__row">
          <span>Shipping</span>
          <span>{formatMoney(order.shippingTotalCents, order.currency)}</span>
        </div>
        {order.taxTotalCents > 0 ? (
          <div className="sf-summary__row">
            <span>Tax</span>
            <span>{formatMoney(order.taxTotalCents, order.currency)}</span>
          </div>
        ) : null}
        <div className="sf-summary__total">
          <span>Total</span>
          <span>{formatMoney(order.totalCents, order.currency)}</span>
        </div>
      </div>

      {ship ? (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 className="sf-h3" style={{ marginBottom: '0.5rem' }}>
            Shipping to
          </h2>
          <p className="sf-muted">{ship}</p>
        </div>
      ) : null}
    </div>
  );
}
