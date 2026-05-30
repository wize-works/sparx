import { Users } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { ModuleProvider } from '@sparx/ui';

import { ModuleStub } from '../../../components/module-stub';

// CRM module gate lives here, not on each page.tsx, so every route under
// /crm/* — landing, sub-tabs, detail routes, new-forms — gates from one
// place. The previous arrangement only gated /crm and /crm/duplicates and
// let every other CRM page render even when the module was inactive.
//
// Layouts in Next.js App Router are preserved across navigation within the
// same segment, which is what we want here: visiting /crm then /crm/pipelines
// reuses the same gate result. A module flip via /settings/modules calls
// revalidatePath('/crm', 'layout') so the next request re-checks.

const CRM_STUB_FEATURES = [
  { title: 'Customer profiles', description: 'Order history, tags, notes, and engagement.' },
  { title: 'Pipeline', description: 'Kanban deal flow for B2B and high-touch sales.' },
  { title: 'Segments', description: 'Live audiences updated incrementally by event.' },
  {
    title: 'Automation',
    description: 'Trigger emails, tasks, and webhooks on customer events.',
  },
  { title: 'Activity log', description: 'Append-only timeline of every touchpoint.' },
  { title: 'MCP integration', description: 'AI-readable customer intelligence surface.' },
];

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'crm');
  return (
    <ModuleProvider module="crm">
      {enabled ? (
        children
      ) : (
        <ModuleStub
          icon={<Users className="h-5 w-5" />}
          title="CRM"
          tagline="Customers, segments, and lifecycle automation."
          description="The CRM module unifies customer profiles across storefront, B2B, and email so you can segment, score, and re-engage them. Activate it to start tracking customers."
          features={CRM_STUB_FEATURES}
        />
      )}
    </ModuleProvider>
  );
}
