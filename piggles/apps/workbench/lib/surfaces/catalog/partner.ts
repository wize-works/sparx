// Partners — for agencies and consultants who bring clients onto sparx.
//
// Only ever visible to a tenant that has joined the partner programme; the rail
// gates the whole module the same way it gates every other one.

import {
  faAward,
  faBookOpen,
  faBuilding,
  faCoins,
  faGraduationCap,
  faShareNodes,
  faUser,
} from '@fortawesome/pro-solid-svg-icons';
import type { SurfaceDefinition } from '../registry';
import { ReferralsListSurface } from '../../../surfaces/partner/referrals-list';
import { ClientsListSurface } from '../../../surfaces/partner/clients-list';
import { CommissionsSurface } from '../../../surfaces/partner/commissions';
import { TierSurface } from '../../../surfaces/partner/tier';
import { BootcampsListSurface } from '../../../surfaces/partner/bootcamps-list';
import { BootcampDetailSurface } from '../../../surfaces/partner/bootcamp-detail';
import { ResourcesSurface } from '../../../surfaces/partner/resources';
import { ProfileSurface } from '../../../surfaces/partner/profile';

export const PARTNER_SURFACES: SurfaceDefinition[] = [
  {
    key: 'partner.referrals.list',
    title: 'Referrals',
    module: 'partner',
    icon: faShareNodes,
    component: ReferralsListSurface,
    // One shared ledger + link — a second copy is the same list.
    singleton: true,
    order: 1,
    keywords: ['leads', 'introductions', 'sign ups', 'referral link'],
  },

  /* ── Your clients ──────────────────────────────────────────────────────── */
  {
    key: 'partner.clients.list',
    title: 'Clients',
    module: 'partner',
    icon: faBuilding,
    component: ClientsListSurface,
    singleton: true,
    section: 'Your clients',
    order: 10,
    keywords: ['accounts', 'managed', 'customers'],
  },
  {
    key: 'partner.commissions.list',
    title: 'Commissions',
    module: 'partner',
    icon: faCoins,
    component: CommissionsSurface,
    singleton: true,
    section: 'Your clients',
    order: 11,
    keywords: ['earnings', 'revenue share', 'payouts', 'get paid'],
  },

  /* ── The programme ─────────────────────────────────────────────────────── */
  {
    key: 'partner.tier',
    title: 'Your tier',
    module: 'partner',
    icon: faAward,
    component: TierSurface,
    singleton: true,
    section: 'The program',
    order: 20,
    keywords: ['level', 'status', 'benefits', 'upgrade'],
  },
  {
    key: 'partner.bootcamps',
    title: 'Bootcamps',
    module: 'partner',
    icon: faGraduationCap,
    component: BootcampsListSurface,
    section: 'The program',
    order: 21,
    // The `+` in the nav opens the create/manage pane in its `new` state.
    createSurface: 'partner.bootcamp.detail',
    createLabel: 'New bootcamp',
    keywords: ['training', 'courses', 'certification', 'learn'],
  },
  {
    // Unlisted: reached from the Bootcamps list or the nav `+`. Create and manage
    // are ONE surface in two states ({id:'new'} → {id}), never a create modal.
    key: 'partner.bootcamp.detail',
    title: 'Bootcamp',
    module: 'partner',
    icon: faGraduationCap,
    component: BootcampDetailSurface,
    listed: false,
    keywords: ['bootcamp', 'cohort', 'training', 'publish'],
  },
  {
    key: 'partner.resources',
    title: 'Resources',
    module: 'partner',
    icon: faBookOpen,
    component: ResourcesSurface,
    singleton: true,
    section: 'The program',
    order: 22,
    keywords: ['materials', 'guides', 'assets', 'sales', 'pitch'],
  },
  {
    key: 'partner.profile',
    title: 'Your listing',
    module: 'partner',
    icon: faUser,
    component: ProfileSurface,
    singleton: true,
    section: 'The program',
    order: 23,
    keywords: ['profile', 'directory', 'public'],
  },
];
