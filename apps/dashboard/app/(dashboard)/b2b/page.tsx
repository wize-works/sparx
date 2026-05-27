import { Building2 } from 'lucide-react';
import { ModuleStub } from '../../../components/module-stub';

export default function B2bPage() {
  return (
    <ModuleStub
      icon={<Building2 className="h-5 w-5" />}
      title="B2B"
      tagline="Wholesale, fleet, and net-terms commerce."
      description="The B2B module layers company accounts, approval flows, and custom price lists onto your storefront — ready for accounts like Gillett Diesel."
      features={[
        { title: 'Company accounts', description: 'Parent companies with multiple buyers and roles.' },
        { title: 'Price lists', description: 'Per-company pricing, tiered breaks, contract overrides.' },
        { title: 'Quotes', description: 'Sales-assisted quotes that convert to orders.' },
        { title: 'Net terms', description: 'Net 30/60 invoicing backed by Stripe.' },
        { title: 'Approval flows', description: 'Spend limits, multi-step approvals, audit trail.' },
        { title: 'Fleet management', description: 'VIN/asset-tagged ordering for service operations.' },
      ]}
    />
  );
}
