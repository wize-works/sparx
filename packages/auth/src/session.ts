import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './server';

// Server-side helper for Next.js server components / server actions.
//
// `getSession()` returns the session or null; `requireSession()` redirects to
// /sign-in if there is no session, otherwise returns a narrowed shape that
// guarantees `tenantId` is present. Every dashboard page or server action that
// touches tenant-scoped data should pull the context from here so we never
// hand-roll the `auth.api.getSession({ headers })` boilerplate ad hoc.

export interface SparxSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    tenantId: string;
    role: string;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}

export async function getSession(): Promise<SparxSession | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;

  const user = result.user as SparxSession['user'];
  if (!user.tenantId) {
    // A user row without a tenantId means something hand-edited the DB or our
    // sign-up hook missed a path. Treat it as unauthenticated rather than
    // letting a query run with an undefined GUC.
    return null;
  }

  return {
    user,
    session: {
      id: result.session.id,
      userId: result.session.userId,
      expiresAt: result.session.expiresAt,
    },
  };
}

export async function requireSession(): Promise<SparxSession> {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }
  return session;
}
