import { ShoppingCart } from 'lucide-react';
import { ModuleStub } from '../../../components/module-stub';

export default function CommercePage() {
  return (
    <ModuleStub
      icon={<ShoppingCart className="h-5 w-5" />}
      title="Commerce"
      tagline="Products, orders, and checkout for your storefront."
      description="The Commerce module turns on product catalogs, inventory, pricing rules, and checkout. Activate it from Billing to get started."
      features={[
        { title: 'Products', description: 'Variants, options, media, SEO, and bulk imports.' },
        { title: 'Orders', description: 'Fulfilment, refunds, and customer-visible status.' },
        { title: 'Checkout', description: 'Stripe-powered checkout with abandoned cart recovery.' },
        { title: 'Inventory', description: 'Stock levels, low-stock alerts, multi-location.' },
        { title: 'Discounts', description: 'Codes, automatic discounts, and B2B price lists.' },
        { title: 'Shipping', description: 'Rate tables, real-time carrier rates, label printing.' },
      ]}
    />
  );
}
