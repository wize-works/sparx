'use client';

// Profile editing — name + phone. Email is the login identifier and is shown
// read-only (changing it would be an account-migration flow, out of scope here).

import { useEffect, useState } from 'react';

import { useCustomer } from '@/components/customer-provider';
import { updateProfile, AccountError } from '@/lib/customer-client';

export default function ProfilePage() {
  const { tenantSlug, customer, refresh } = useCustomer();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName ?? '');
      setLastName(customer.lastName ?? '');
      setPhone(customer.phone ?? '');
    }
  }, [customer]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      await updateProfile(tenantSlug, {
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
      });
      await refresh();
      setState('saved');
    } catch (err) {
      setError(err instanceof AccountError ? err.message : 'Could not save.');
      setState('idle');
    }
  }

  return (
    <div>
      <h1 className="sf-h2" style={{ marginBottom: '1.25rem' }}>
        Profile
      </h1>
      <form onSubmit={submit} className="sf-form">
        <label className="sf-field">
          <span>Email</span>
          <input className="sf-input" value={customer?.email ?? ''} disabled readOnly />
        </label>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <label className="sf-field" style={{ flex: 1 }}>
            <span>First name</span>
            <input
              className="sf-input"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setState('idle');
              }}
            />
          </label>
          <label className="sf-field" style={{ flex: 1 }}>
            <span>Last name</span>
            <input
              className="sf-input"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                setState('idle');
              }}
            />
          </label>
        </div>
        <label className="sf-field">
          <span>Phone</span>
          <input
            className="sf-input"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setState('idle');
            }}
          />
        </label>
        {error ? (
          <div className="sf-alert sf-alert--error" role="alert">
            {error}
          </div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="submit" className="sf-btn sf-btn--primary" disabled={state === 'busy'}>
            {state === 'busy' ? 'Saving…' : 'Save changes'}
          </button>
          {state === 'saved' ? (
            <span className="sf-muted" role="status">
              Saved.
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
