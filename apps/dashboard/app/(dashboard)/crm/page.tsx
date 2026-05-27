import { Users } from 'lucide-react';
import { ModuleStub } from '../../../components/module-stub';

export default function CrmPage() {
  return (
    <ModuleStub
      icon={<Users className="h-5 w-5" />}
      title="CRM"
      tagline="Customers, segments, and lifecycle automation."
      description="The CRM module unifies customer profiles across storefront, B2B, and email so you can segment, score, and re-engage them."
      features={[
        { title: 'Customer profiles', description: 'Order history, tags, custom fields, internal notes.' },
        { title: 'Segments', description: 'Live audiences built from any field or behavior.' },
        { title: 'Pipeline', description: 'Kanban deal flow for B2B and high-touch sales.' },
        { title: 'Automation', description: 'Trigger emails, tasks, and webhooks on customer events.' },
        { title: 'Notes & activity', description: 'Timeline of every touchpoint across modules.' },
        { title: 'Imports', description: 'CSV / API customer onboarding with dedupe rules.' },
      ]}
    />
  );
}
