import { ShoppingCart } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { ModuleProvider } from '@sparx/ui';

import { ModuleStub } from '../../../components/module-stub';

// Commerce module gate lives here, not on each page.tsx, so every route
// under /commerce/* gates from one place. Mirrors the CRM layout. The inner
// pages all assume Commerce is enabled and call api-rest directly; a
// module-flip via /settings/modules calls revalidatePath('/commerce', 'layout')
// so the next request re-checks the flag.

const COMMERCE_STUB_FEATURES = [
  { title: 'Products', description: 'Variants, options, media, SEO, and bulk imports.' },
  { title: 'Orders', description: 'Fulfilment, refunds, and customer-visible status.' },
  { title: 'Checkout', description: 'Stripe-powered checkout with abandoned cart recovery.' },
  { title: 'Inventory', description: 'Stock levels, low-stock alerts, multi-location.' },
  { title: 'Discounts', description: 'Codes, automatic discounts, and B2B price lists.' },
  { title: 'Shipping', description: 'Rate tables, real-time carrier rates, label printing.' },
];

export default async function CommerceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  return (
    <ModuleProvider module="commerce">
      {enabled ? (
        children
      ) : (
        <ModuleStub
          icon={<ShoppingCart className="h-5 w-5" />}
          title="Commerce"
          tagline="Products, orders, and checkout for your storefront."
          description="The Commerce module turns on product catalogs, inventory, pricing rules, and checkout. Activate it from Billing to get started."
          features={COMMERCE_STUB_FEATURES}
        />
      )}
    </ModuleProvider>
  );
}
