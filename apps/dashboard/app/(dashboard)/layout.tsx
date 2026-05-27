import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@sparx/auth/server';
import { DashboardShell } from './_components/dashboard-shell';

// Server-side session gate. If there's no session, bounce to /sign-in before
// the client ever sees the dashboard chrome. Everything that needs the user
// (UserMenu, etc.) receives it as a prop — no client-side useSession ping on
// first paint.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/sign-in');
  }

  return <DashboardShell user={session.user}>{children}</DashboardShell>;
}
