import { requireSession } from '@sparx/auth';
import { DashboardShell } from './_components/dashboard-shell';

// Server-side session gate. requireSession() redirects to /sign-in when there
// is no session, so by the time we hit the shell we have a known user +
// tenantId. The shell only needs the user; tenantId travels via context-aware
// helpers (withTenant) inside server actions.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
