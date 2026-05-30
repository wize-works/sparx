// Dashboard shell manifest for the Commerce module.
//
// Imported by the dashboard via `@sparx/commerce/manifest` — keep this file
// dependency-light: types from @sparx/ui/shell, icons from lucide-react,
// nothing else. See docs/24-dashboard-shell.md §3 for the contract.

import type { ModuleManifest } from '@sparx/ui/shell';
import {
  Boxes,
  FolderTree,
  Gift,
  LayoutGrid,
  Package,
  PackagePlus,
  Percent,
  ShoppingCart,
  Tag,
  TicketPercent,
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
    { id: 'gift-cards', label: 'Gift cards', icon: Gift, href: '/commerce/gift-cards' },
    { id: 'store-credit', label: 'Store credit', icon: Wallet, href: '/commerce/store-credit' },
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
