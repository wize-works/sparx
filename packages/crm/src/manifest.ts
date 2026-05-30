// Dashboard shell manifest for the CRM module.
//
// Imported by the dashboard via `@sparx/crm/manifest` — keep this file
// dependency-light: types from @sparx/ui/shell, icons from lucide-react,
// nothing else. See docs/24-dashboard-shell.md §3 for the contract.

import type { ModuleManifest } from '@sparx/ui/shell';
import {
  BarChart3,
  Briefcase,
  Building2,
  CheckSquare,
  Copy,
  FileText,
  Filter,
  Receipt,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';

export const crmManifest: ModuleManifest = {
  id: 'crm',
  label: 'CRM',
  icon: Users,
  routePrefix: '/crm',
  sections: [
    { id: 'customers', label: 'Customers', icon: Users, href: '/crm/customers' },
    { id: 'b2b', label: 'B2B accounts', icon: Building2, href: '/crm/b2b' },
    { id: 'deals', label: 'Deals', icon: Briefcase, href: '/crm/deals' },
    { id: 'pipelines', label: 'Pipelines', icon: Workflow, href: '/crm/pipelines' },
    { id: 'quotes', label: 'Quotes', icon: FileText, href: '/crm/quotes' },
    { id: 'orders', label: 'Orders', icon: Receipt, href: '/crm/orders' },
    { id: 'segments', label: 'Segments', icon: Filter, href: '/crm/segments' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, href: '/crm/tasks' },
    { id: 'reports', label: 'Reports', icon: BarChart3, href: '/crm/reports' },
    { id: 'duplicates', label: 'Duplicates', icon: Copy, href: '/crm/duplicates' },
  ],
  actions: [
    {
      id: 'crm.customer.create',
      label: 'Create customer',
      icon: UserPlus,
      href: '/crm/customers/new',
    },
    { id: 'crm.b2b.create', label: 'Create B2B account', icon: Building2, href: '/crm/b2b/new' },
    { id: 'crm.deal.create', label: 'Create deal', icon: Briefcase, href: '/crm/deals/new' },
    { id: 'crm.quote.create', label: 'Create quote', icon: FileText, href: '/crm/quotes/new' },
    { id: 'crm.order.create', label: 'Create order', icon: Receipt, href: '/crm/orders/new' },
    { id: 'crm.task.create', label: 'Create task', icon: CheckSquare, href: '/crm/tasks/new' },
  ],
  entityTypes: [
    { id: 'customer', label: 'Customer', routePrefix: '/crm/customers' },
    { id: 'b2b-account', label: 'B2B account', routePrefix: '/crm/b2b' },
    { id: 'deal', label: 'Deal', routePrefix: '/crm/deals' },
    { id: 'pipeline', label: 'Pipeline', routePrefix: '/crm/pipelines' },
    { id: 'quote', label: 'Quote', routePrefix: '/crm/quotes' },
    { id: 'order', label: 'Order', routePrefix: '/crm/orders' },
    { id: 'segment', label: 'Segment', routePrefix: '/crm/segments' },
    { id: 'task', label: 'Task', routePrefix: '/crm/tasks' },
  ],
};
