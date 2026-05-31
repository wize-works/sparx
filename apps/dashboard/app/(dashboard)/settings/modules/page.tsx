// Modules — per-tenant activation toggles.
//
// Owner-only mutations; viewers see the state read-only. Each row is one
// slug from ModuleSlug with a description + toggle. The activation hook
// also runs any in-process bootstrap the module needs (CRM seeds the
// default pipeline + built-in segments idempotently).

import { Layers } from 'lucide-react';
import { requireSession } from '@sparx/auth';
import { Card, CardContent, CardHeader, CardTitle, Container, PageHeader, Stack } from '@sparx/ui';

import { listModuleStateForCurrentTenant } from './actions';
import { ModuleToggleRow } from './_components/module-toggle-row';

export const dynamic = 'force-dynamic';

interface ModuleMeta {
  slug: 'storefront' | 'commerce' | 'cms' | 'crm' | 'email' | 'b2b' | 'dropship' | 'ai';
  label: string;
  description: string;
}

const MODULES: ModuleMeta[] = [
  {
    slug: 'storefront',
    label: 'Storefront',
    description: 'Public-facing store, themes, checkout shell.',
  },
  { slug: 'commerce', label: 'Commerce', description: 'Products, variants, inventory, pricing.' },
  { slug: 'cms', label: 'CMS', description: 'Pages, blog posts, media library, navigation.' },
  {
    slug: 'crm',
    label: 'CRM',
    description: 'Customers, deals, segments, tasks, B2B accounts, reports.',
  },
  {
    slug: 'email',
    label: 'Email',
    description: 'Broadcasts, automations, transactional templates.',
  },
  {
    slug: 'b2b',
    label: 'B2B & Wholesale',
    description: 'Tiered pricing, quotes, credit terms, fleet pricing.',
  },
  {
    slug: 'dropship',
    label: 'Dropship',
    description: 'Supplier catalog sync, order routing, inventory feeds.',
  },
  { slug: 'ai', label: 'AI', description: 'Sparx AI assistant features inside the dashboard.' },
];

export default async function ModulesSettingsPage() {
  const session = await requireSession();
  const states = await listModuleStateForCurrentTenant();
  const stateBySlug = new Map(states.map((s) => [s.slug, s.enabled]));
  const canEdit = session.user.role === 'owner' || session.user.role === 'admin';

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Layers className="h-5 w-5" />}
          title="Modules"
          description={
            <>
              Activate or deactivate modules for this tenant. Disabled modules return 404 from their
              API surface, run no consumers, and store no rows.
              {!canEdit && ' Only owners and admins can change activation state.'}
            </>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Module activation</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap={2}>
              {MODULES.map((m) => (
                <ModuleToggleRow
                  key={m.slug}
                  slug={m.slug}
                  label={m.label}
                  description={m.description}
                  initialEnabled={stateBySlug.get(m.slug) ?? false}
                  disabled={!canEdit}
                />
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
