// Dashboard shell manifest for the Email module.
//
// Imported by the dashboard via `@sparx/email-platform/manifest` (mirrors
// `@sparx/crm/manifest`). Keep this file dependency-light: types from
// @sparx/ui/shell, icons from lucide-react, nothing else.

import type { ModuleManifest } from '@sparx/ui/shell';
import { Gauge, Globe, LayoutTemplate, Send, Settings, ShieldOff, Workflow } from 'lucide-react';

export const emailManifest: ModuleManifest = {
  id: 'email',
  label: 'Email',
  icon: Send,
  routePrefix: '/email',
  sections: [
    { id: 'overview', label: 'Overview', icon: Gauge, href: '/email' },
    { id: 'broadcasts', label: 'Broadcasts', icon: Send, href: '/email/broadcasts' },
    { id: 'automations', label: 'Automations', icon: Workflow, href: '/email/automations' },
    { id: 'templates', label: 'Templates', icon: LayoutTemplate, href: '/email/templates' },
    { id: 'suppressions', label: 'Suppressions', icon: ShieldOff, href: '/email/suppressions' },
    { id: 'domains', label: 'Sending domains', icon: Globe, href: '/email/domains' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/email/settings' },
  ],
  actions: [
    {
      id: 'email.broadcast.create',
      label: 'New broadcast',
      icon: Send,
      href: '/email/broadcasts/new',
    },
    {
      id: 'email.template.create',
      label: 'New template',
      icon: LayoutTemplate,
      href: '/email/templates/new',
    },
  ],
  entityTypes: [
    { id: 'broadcast', label: 'Broadcast', routePrefix: '/email/broadcasts', hasDetailView: true },
    {
      id: 'email-template',
      label: 'Template',
      routePrefix: '/email/templates',
      hasDetailView: true,
    },
    {
      id: 'automation',
      label: 'Automation',
      routePrefix: '/email/automations',
      hasDetailView: true,
    },
    { id: 'sending-domain', label: 'Sending domain', routePrefix: '/email/domains' },
  ],
};
