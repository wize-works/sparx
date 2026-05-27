'use client';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { Auth } from './server';

// Browser-side Better Auth client. The Next.js dev server proxies
// /api/auth/* to the server-side `auth` handler — so as long as the calling
// app mounts the handler at that path (apps/dashboard does), the client just
// works with no baseURL config.
//
// `inferAdditionalFields<Auth>` lifts the server-side `tenantId` / `role`
// shape onto the client so `useSession()` returns the Sparx extensions
// fully typed.

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
