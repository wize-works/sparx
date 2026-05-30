import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
import { DashboardShell } from './_components/dashboard-shell';
import { listFavorites, listRecents } from './_shell/service';

// Server-side session gate. requireSession() redirects to /sign-in when there
// is no session, so by the time we hit the shell we have a known user +
// tenantId. The shell needs:
//   - the user
//   - the tenant's display name (breadcrumb root + tenant switcher)
//   - the user's pinned favorites (sidebar + star toggle)
//   - the user's recents (sidebar)
//
// All three DB reads are parallelized via Promise.all — they don't depend
// on each other.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();

  const ctx = { userId: user.id, tenantId: user.tenantId };

  const [tenant, favorites, recents] = await Promise.all([
    withTenant({ tenantId: user.tenantId }, (tx) =>
      tx.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true },
      })
    ),
    listFavorites(ctx),
    listRecents(ctx),
  ]);

  return (
    <DashboardShell
      user={user}
      tenantName={tenant?.name ?? 'Workspace'}
      favorites={favorites}
      recents={recents}
    >
      {children}
    </DashboardShell>
  );
}
