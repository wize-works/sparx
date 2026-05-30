'use client';

// Client-side customer session state. Hydrates from /account/me on mount and
// exposes login / register / logout. The session itself lives in an httpOnly
// cookie (set by api-rest, relayed by the /api/sparx proxy) — this context only
// mirrors the resolved profile + status for the UI to react to.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as accountApi from '@/lib/customer-client';
import type { Customer } from '@/lib/customer-client';

export type CustomerStatus = 'loading' | 'authenticated' | 'anonymous';

export interface CustomerContextValue {
  customer: Customer | null;
  status: CustomerStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function useCustomer(): CustomerContextValue {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomer must be used within <CustomerProvider>');
  return ctx;
}

export function CustomerProvider({
  tenantSlug,
  children,
}: {
  tenantSlug: string;
  children: React.ReactNode;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [status, setStatus] = useState<CustomerStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      const me = await accountApi.getMe(tenantSlug);
      setCustomer(me);
      setStatus(me ? 'authenticated' : 'anonymous');
    } catch {
      setCustomer(null);
      setStatus('anonymous');
    }
  }, [tenantSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const me = await accountApi.login(tenantSlug, { email, password });
      setCustomer(me);
      setStatus('authenticated');
    },
    [tenantSlug]
  );

  const register = useCallback(
    async (input: { email: string; password: string; firstName?: string; lastName?: string }) => {
      const me = await accountApi.register(tenantSlug, input);
      setCustomer(me);
      setStatus('authenticated');
    },
    [tenantSlug]
  );

  const logout = useCallback(async () => {
    await accountApi.logout(tenantSlug);
    setCustomer(null);
    setStatus('anonymous');
  }, [tenantSlug]);

  const value = useMemo<CustomerContextValue>(
    () => ({ customer, status, login, register, logout, refresh }),
    [customer, status, login, register, logout, refresh]
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}
