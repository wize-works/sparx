// Dashboard shell manifest for the Commerce module.
//
// Imported by the dashboard via `@sparx/commerce/manifest` — keep this file
// dependency-light: types from @sparx/ui/shell, icons from lucide-react,
// nothing else. See docs/24-dashboard-shell.md §3 for the contract.

import type { ModuleManifest } from '@sparx/ui/shell';
import {
  Boxes,
  CreditCard,
  FolderTree,
  Gift,
  Inbox,
  LayoutGrid,
  Package,
  Package2,
  PackagePlus,
  Percent,
  Plug,
  Receipt,
  Repeat2,
  Settings2,
  ShoppingCart,
  Tag,
  TicketPercent,
  Truck,
  Wallet,
  Warehouse,
} from 'lucide-react';

export const commerceManifest: ModuleManifest = {
  id: 'commerce',
  label: 'Commerce',
  icon: ShoppingCart,
  routePrefix: '/commerce',
  sections: [
    { id: 'products', label: 'Products', icon: Package, href: '/commerce/products' },
    { id: 'categories', label: 'Categories', icon: FolderTree, href: '/commerce/categories' },
    { id: 'collections', label: 'Collections', icon: LayoutGrid, href: '/commerce/collections' },
    { id: 'pricing', label: 'Pricing', icon: Tag, href: '/commerce/pricing' },
    { id: 'discounts', label: 'Discounts', icon: Percent, href: '/commerce/discounts' },
    { id: 'inventory', label: 'Inventory', icon: Boxes, href: '/commerce/inventory' },
    { id: 'warehouses', label: 'Warehouses', icon: Warehouse, href: '/commerce/warehouses' },
    { id: 'bundles', label: 'Bundles', icon: Package2, href: '/commerce/bundles' },
    { id: 'configurator', label: 'Configurator', icon: Settings2, href: '/commerce/configurator' },
    { id: 'gift-cards', label: 'Gift cards', icon: Gift, href: '/commerce/gift-cards' },
    { id: 'store-credit', label: 'Store credit', icon: Wallet, href: '/commerce/store-credit' },
    { id: 'carts', label: 'Carts', icon: ShoppingCart, href: '/commerce/carts' },
    {
      id: 'checkout-sessions',
      label: 'Checkout sessions',
      icon: CreditCard,
      href: '/commerce/checkout-sessions',
    },
    {
      id: 'subscriptions',
      label: 'Subscriptions',
      icon: Repeat2,
      href: '/commerce/subscriptions',
    },
    { id: 'returns', label: 'Returns', icon: Inbox, href: '/commerce/returns' },
    { id: 'shipping', label: 'Shipping', icon: Truck, href: '/commerce/shipping' },
    { id: 'tax', label: 'Tax', icon: Receipt, href: '/commerce/tax' },
    { id: 'providers', label: 'Providers', icon: Plug, href: '/commerce/providers' },
  ],
  actions: [
    {
      id: 'commerce.product.create',
      label: 'Create product',
      icon: PackagePlus,
      href: '/commerce/products/new',
    },
    {
      id: 'commerce.discount.create',
      label: 'Create discount',
      icon: TicketPercent,
      href: '/commerce/discounts/new',
    },
    {
      id: 'commerce.gift-card.issue',
      label: 'Issue gift card',
      icon: Gift,
      href: '/commerce/gift-cards/new',
    },
  ],
  entityTypes: [
    { id: 'product', label: 'Product', routePrefix: '/commerce/products' },
    { id: 'category', label: 'Category', routePrefix: '/commerce/categories' },
    { id: 'collection', label: 'Collection', routePrefix: '/commerce/collections' },
    { id: 'discount', label: 'Discount', routePrefix: '/commerce/discounts' },
    { id: 'gift-card', label: 'Gift card', routePrefix: '/commerce/gift-cards' },
    { id: 'warehouse', label: 'Warehouse', routePrefix: '/commerce/warehouses' },
  ],
};
