import { Truck } from 'lucide-react';
import { ModuleStub } from '../../../components/module-stub';

export default function DropshipPage() {
  return (
    <ModuleStub
      icon={<Truck className="h-5 w-5" />}
      title="Dropship"
      tagline="Supplier catalogs and order routing."
      description="The Dropship module syncs supplier catalogs, routes orders automatically, and reconciles invoices — keeping your inventory and fulfilment honest."
      features={[
        { title: 'Supplier catalogs', description: 'CSV / API / EDI feeds with nightly sync.' },
        {
          title: 'Order routing',
          description: 'Auto-split orders by supplier, location, or rule.',
        },
        { title: 'Inventory sync', description: 'Live stock pulls so you do not oversell.' },
        { title: 'Margin rules', description: 'Per-supplier markup, MAP enforcement, exclusions.' },
        { title: 'Tracking', description: 'Push tracking back to the customer automatically.' },
        {
          title: 'Reconciliation',
          description: 'Match supplier invoices to orders with variance flags.',
        },
      ]}
    />
  );
}
