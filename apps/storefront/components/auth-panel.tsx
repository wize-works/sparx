'use client';

// Storefront auth panel — sign in / create account, tabbed. Drives the
// CustomerProvider's login/register and, on success, redirects to the
// `redirect` query param (e.g. back to checkout) or the account dashboard.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { useCustomer } from '@/components/customer-provider';
import { AccountError } from '@/lib/customer-client';

type Mode = 'signin' | 'register';

export function AuthPanel({ initial = 'signin' }: { initial?: Mode }) {
  const { login, register } = useCustomer();
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get('redirect') ?? '/account';

  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
        });
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof AccountError ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="sf-container--prose" style={{ paddingBlock: '2.5rem' }}>
      <div
        className="sf-tabs"
        role="tablist"
        aria-label="Account"
        style={{ marginBottom: '1.5rem' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signin'}
          className={['sf-tab', mode === 'signin' && 'is-active'].filter(Boolean).join(' ')}
          onClick={() => switchMode('signin')}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={['sf-tab', mode === 'register' && 'is-active'].filter(Boolean).join(' ')}
          onClick={() => switchMode('register')}
        >
          Create account
        </button>
      </div>

      <h1 className="sf-h2" style={{ marginBottom: '0.5rem' }}>
        {mode === 'signin' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="sf-muted" style={{ marginBottom: '1.5rem' }}>
        {mode === 'signin'
          ? 'Sign in to track orders and check out faster.'
          : 'Save your details for a faster checkout next time.'}
      </p>

      <form onSubmit={submit} className="sf-form">
        {mode === 'register' ? (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <label className="sf-field" style={{ flex: 1 }}>
              <span>First name</span>
              <input
                className="sf-input"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label className="sf-field" style={{ flex: 1 }}>
              <span>Last name</span>
              <input
                className="sf-input"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <label className="sf-field">
          <span>Email</span>
          <input
            className="sf-input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="sf-field">
          <span>Password</span>
          <input
            className="sf-input"
            type="password"
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' ? (
            <span className="sf-muted" style={{ fontSize: '0.8rem' }}>
              At least 8 characters.
            </span>
          ) : (
            <Link
              href="/account/forgot"
              className="sf-muted"
              style={{ fontSize: '0.8rem', alignSelf: 'flex-start' }}
            >
              Forgot your password?
            </Link>
          )}
        </label>

        {error ? (
          <div className="sf-alert sf-alert--error" role="alert">
            {error}
          </div>
        ) : null}

        <button type="submit" className="sf-btn sf-btn--primary sf-btn--lg" disabled={busy}>
          {busy
            ? mode === 'signin'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
    </div>
  );
}
