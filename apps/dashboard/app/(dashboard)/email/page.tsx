import { Mail } from 'lucide-react';
import { ModuleStub } from '../../../components/module-stub';

export default function EmailPage() {
  return (
    <ModuleStub
      icon={<Mail className="h-5 w-5" />}
      title="Email"
      tagline="Transactional and broadcast email on sparx.mx."
      description="The Email module sends every transactional message and broadcast through self-hosted Postal with per-tenant DKIM and reputation isolation."
      features={[
        { title: 'Templates', description: 'React Email templates with live preview and merge fields.' },
        { title: 'Broadcasts', description: 'One-shot campaigns to segments with A/B subject lines.' },
        { title: 'Flows', description: 'Drip sequences triggered by storefront and CRM events.' },
        { title: 'Deliverability', description: 'DKIM, SPF, dedicated IPs, and reputation dashboards.' },
        { title: 'Suppression', description: 'Bounce/complaint handling with per-tenant lists.' },
        { title: 'Analytics', description: 'Open, click, and conversion tracking via Postal.' },
      ]}
    />
  );
}
