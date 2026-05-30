'use client';

// Reusable address form. Controlled — emits the full Address on every change.

import type { Address } from '@/lib/checkout-client';

export const EMPTY_ADDRESS: Address = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'US',
  phone: '',
};

// A small, common subset; extend as international support grows.
const COUNTRIES: { code: string; name: string }[] = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
];

export function AddressForm({
  value,
  onChange,
}: {
  value: Address;
  onChange: (next: Address) => void;
}) {
  function set<K extends keyof Address>(key: K, v: Address[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="sf-addr">
      <label className="sf-field sf-field--full">
        <span>Full name</span>
        <input
          className="sf-input"
          required
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          autoComplete="name"
        />
      </label>
      <label className="sf-field sf-field--full">
        <span>Address</span>
        <input
          className="sf-input"
          required
          value={value.line1}
          onChange={(e) => set('line1', e.target.value)}
          autoComplete="address-line1"
        />
      </label>
      <label className="sf-field sf-field--full">
        <span>Apartment, suite, etc. (optional)</span>
        <input
          className="sf-input"
          value={value.line2 ?? ''}
          onChange={(e) => set('line2', e.target.value)}
          autoComplete="address-line2"
        />
      </label>
      <label className="sf-field">
        <span>City</span>
        <input
          className="sf-input"
          required
          value={value.city}
          onChange={(e) => set('city', e.target.value)}
          autoComplete="address-level2"
        />
      </label>
      <label className="sf-field">
        <span>State / Region</span>
        <input
          className="sf-input"
          value={value.region ?? ''}
          onChange={(e) => set('region', e.target.value)}
          autoComplete="address-level1"
        />
      </label>
      <label className="sf-field">
        <span>Postal code</span>
        <input
          className="sf-input"
          required
          value={value.postalCode}
          onChange={(e) => set('postalCode', e.target.value)}
          autoComplete="postal-code"
        />
      </label>
      <label className="sf-field">
        <span>Country</span>
        <select
          className="sf-input"
          value={value.country}
          onChange={(e) => set('country', e.target.value)}
          autoComplete="country"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="sf-field sf-field--full">
        <span>Phone (optional)</span>
        <input
          className="sf-input"
          type="tel"
          value={value.phone ?? ''}
          onChange={(e) => set('phone', e.target.value)}
          autoComplete="tel"
        />
      </label>
    </div>
  );
}
