'use server';

import { signUpMerchant, SignUpError } from '@sparx/auth';
import { auth } from '@sparx/auth/server';
import { headers } from 'next/headers';

export interface SignUpFormState {
  ok: boolean;
  error?: string;
}

// Creates Tenant + User + Account in one transaction, then signs the user in
// so the dashboard layout's session check finds a fresh cookie.
export async function signUpAction(formData: FormData): Promise<SignUpFormState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '');
  const storeName = String(formData.get('storeName') ?? '');

  if (!email || !password || !name || !storeName) {
    return { ok: false, error: 'All fields are required.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  try {
    await signUpMerchant({ email, password, name, storeName });
  } catch (err) {
    if (err instanceof SignUpError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Could not create account. Please try again.' };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
      asResponse: false,
    });
  } catch {
    return { ok: false, error: 'Account created, but sign-in failed. Try signing in.' };
  }

  return { ok: true };
}
