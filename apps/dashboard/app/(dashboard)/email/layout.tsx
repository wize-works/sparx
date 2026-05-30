import { Send } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { ModuleProvider } from '@sparx/ui';

import { ModuleStub } from '../../../components/module-stub';

// Email module gate lives here, not on each page.tsx, so every route under
// /email/* — overview, broadcasts, automations, templates, suppressions,
// domains, settings, detail routes, new-forms — gates from one place. A module
// flip via /settings/modules calls revalidatePath('/email', 'layout') so the
// next request re-checks.

const EMAIL_STUB_FEATURES = [
  { title: 'Broadcasts', description: 'Segment-targeted campaigns with scheduling and preview.' },
  {
    title: 'Automations',
    description: 'Order, cart-abandon, win-back, and B2B flows triggered by events.',
  },
  { title: 'Templates', description: 'Branded transactional + marketing templates with preview.' },
  {
    title: 'Sending domains',
    description: 'Send from your own domain with automatic DKIM/SPF/DMARC.',
  },
  { title: 'Deliverability', description: 'Suppression list, bounce/complaint handling.' },
  { title: 'Analytics', description: 'Opens, clicks, bounces, and revenue attribution.' },
];

export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'email');
  return (
    <ModuleProvider module="email">
      {enabled ? (
        children
      ) : (
        <ModuleStub
          icon={<Send className="h-5 w-5" />}
          title="Email"
          tagline="Transactional, automated, and broadcast email from your own domain."
          description="The Email module sends order, shipping, and marketing email through Mailgun on your verified domain, with automations wired to commerce and CRM events. Activate it to start sending."
          features={EMAIL_STUB_FEATURES}
        />
      )}
    </ModuleProvider>
  );
}
