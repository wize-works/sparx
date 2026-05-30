'use client';

// Address book — list, add, edit, delete. The default address is highlighted
// and used to prefill checkout.

import { useEffect, useState } from 'react';

import { useCustomer } from '@/components/customer-provider';
import {
  createAddress,
  deleteAddress,
  getAddresses,
  updateAddress,
  AccountError,
  type Address,
  type AddressInput,
} from '@/lib/customer-client';

const EMPTY: Partial<AddressInput> = {
  type: 'shipping',
  line1: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'US',
  isDefault: false,
};

function formatAddress(a: Address): string {
  return [
    a.recipientName,
    a.line1,
    a.line2,
    [a.city, a.region, a.postalCode].filter(Boolean).join(', '),
    a.country,
  ]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' · ');
}

export default function AddressesPage() {
  const { tenantSlug } = useCustomer();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    getAddresses(tenantSlug)
      .then(setAddresses)
      .catch(() => setError('Could not load addresses.'));
  }
  useEffect(load, [tenantSlug]);

  async function remove(id: string) {
    await deleteAddress(tenantSlug, id);
    load();
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <h1 className="sf-h2">Addresses</h1>
        {editing === null ? (
          <button
            type="button"
            className="sf-btn sf-btn--secondary"
            onClick={() => setEditing('new')}
          >
            Add address
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="sf-alert sf-alert--error" role="alert">
          {error}
        </div>
      ) : null}

      {editing !== null ? (
        <AddressForm
          tenantSlug={tenantSlug}
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : addresses === null ? (
        <div className="sf-skeleton" style={{ height: 140 }} />
      ) : addresses.length === 0 ? (
        <p className="sf-muted">No saved addresses yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {addresses.map((a) => (
            <div
              key={a.id}
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
                {a.label ? <strong>{a.label} </strong> : null}
                {a.isDefault ? <span className="sf-badge">Default</span> : null}
                <div className="sf-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {formatAddress(a)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="sf-btn sf-btn--ghost"
                  onClick={() => setEditing(a)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="sf-btn sf-btn--ghost"
                  onClick={() => void remove(a.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddressForm({
  tenantSlug,
  initial,
  onCancel,
  onSaved,
}: {
  tenantSlug: string;
  initial: Address | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<AddressInput>>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AddressInput>(key: K, value: AddressInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (initial) await updateAddress(tenantSlug, initial.id, form);
      else await createAddress(tenantSlug, form);
      onSaved();
    } catch (err) {
      setError(err instanceof AccountError ? err.message : 'Could not save address.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="sf-form">
      <label className="sf-field">
        <span>Label (optional)</span>
        <input
          className="sf-input"
          value={form.label ?? ''}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Home, Work…"
        />
      </label>
      <label className="sf-field">
        <span>Recipient name</span>
        <input
          className="sf-input"
          autoComplete="name"
          value={form.recipientName ?? ''}
          onChange={(e) => set('recipientName', e.target.value)}
        />
      </label>
      <label className="sf-field">
        <span>Address line 1</span>
        <input
          className="sf-input"
          required
          autoComplete="address-line1"
          value={form.line1 ?? ''}
          onChange={(e) => set('line1', e.target.value)}
        />
      </label>
      <label className="sf-field">
        <span>Address line 2 (optional)</span>
        <input
          className="sf-input"
          autoComplete="address-line2"
          value={form.line2 ?? ''}
          onChange={(e) => set('line2', e.target.value)}
        />
      </label>
      <div className="sf-addr">
        <label className="sf-field">
          <span>City</span>
          <input
            className="sf-input"
            required
            autoComplete="address-level2"
            value={form.city ?? ''}
            onChange={(e) => set('city', e.target.value)}
          />
        </label>
        <label className="sf-field">
          <span>State / Region</span>
          <input
            className="sf-input"
            autoComplete="address-level1"
            value={form.region ?? ''}
            onChange={(e) => set('region', e.target.value)}
          />
        </label>
        <label className="sf-field">
          <span>Postal code</span>
          <input
            className="sf-input"
            autoComplete="postal-code"
            value={form.postalCode ?? ''}
            onChange={(e) => set('postalCode', e.target.value)}
          />
        </label>
        <label className="sf-field">
          <span>Country</span>
          <input
            className="sf-input"
            required
            maxLength={2}
            autoComplete="country"
            value={form.country ?? ''}
            onChange={(e) => set('country', e.target.value.toUpperCase())}
            placeholder="US"
          />
        </label>
      </div>
      <label className="sf-check">
        <input
          type="checkbox"
          checked={form.isDefault ?? false}
          onChange={(e) => set('isDefault', e.target.checked)}
        />
        Set as default address
      </label>
      {error ? (
        <div className="sf-alert sf-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" className="sf-btn sf-btn--ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="sf-btn sf-btn--primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save address' : 'Add address'}
        </button>
      </div>
    </form>
  );
}
