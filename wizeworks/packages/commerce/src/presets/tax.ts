// Tax module presets (kind 'tax') — installable tax-zone + fallback-rate packs.
//
// ── EVERY PACK INSTALLS SWITCHED OFF, and that is not a detail ──────────────
//
// These used to install `isActive: true` with `nexusType: 'physical'`, so
// choosing the "clothing store" starter told a Denver studio it had a shop,
// office or staff in California, Texas and New York, and set it collecting
// there. Nobody asked her, and collecting sales tax in a state you are not
// registered in is not a cosmetic mistake. It went unnoticed because nothing
// called `taxService.calculate` at all, so no money moved either way — the
// moment tax started being charged (issue 428) it would have.
//
// A starter may set up the SHAPE of tax. It may not decide that a business is
// registered somewhere and start taking money from its customers on that basis.
// That is no longer left to each pack to remember: `CreateTaxZoneInput.isActive`
// now defaults to FALSE, `taxService.createZone` refuses to activate a zone for
// a caller that is not a signed-in person, and a database CHECK refuses an
// active zone with no record of who switched it on. The explicit `isActive:
// false` below is kept anyway, because a tax pack should say out loud what it
// does with someone's money.
//
// These are merchant fallback rates used only when no TaxProvider (Stripe Tax /
// TaxJar / Avalara) is connected; real calculation always prefers the provider.
//
// Zones are region-specific (US-CA, CA-ON, …) so they never collide with the
// inactive country-level fallback zone `taxService.bootstrapDefaults` seeds on
// activation. Each install is guarded against a re-install by `commercePreset`.

import type { CreateTaxRateInput, CreateTaxZoneInput } from '@wizeworks/commerce-schemas';
import type { TenantContext } from '@wizeworks/db';

import { taxService } from '../services';

import { commercePreset } from './_kit';

interface ZonePack {
  zone: CreateTaxZoneInput;
  rate: Omit<CreateTaxRateInput, 'zoneId'>;
}

async function installZonePacks(sx: TenantContext, packs: ZonePack[]): Promise<{ id: string }> {
  let firstId = '';
  for (const pack of packs) {
    const zone = await taxService.createZone(sx, pack.zone);
    await taxService.createRate(sx, { zoneId: zone.id, ...pack.rate });
    if (!firstId) firstId = zone.id;
  }
  return { id: firstId };
}

export const taxPresets = [
  commercePreset({
    slug: 'tax-us-sales',
    kind: 'tax',
    name: 'US sales tax',
    description:
      'California, Texas and New York set up with their state rates, SWITCHED OFF. Turn on the states you are actually registered in, and add your own — nothing is charged anywhere until you do.',
    iconKey: 'receipt',
    tags: ['tax', 'us', 'sales-tax'],
    summary: [
      { label: 'CA · TX · NY', tone: 'neutral' },
      { label: '3 state rates', tone: 'module' },
    ],
    marker: (tx, tenantId) =>
      tx.taxZone
        .findFirst({ where: { tenantId, country: 'US', region: 'US-CA' }, select: { id: true } })
        .then(Boolean),
    build: (sx) =>
      installZonePacks(sx, [
        {
          zone: { country: 'US', region: 'US-CA', nexusType: 'physical', isActive: false },
          rate: { name: 'California sales tax', rateBasisPoints: 725, appliesToShipping: false },
        },
        {
          zone: { country: 'US', region: 'US-TX', nexusType: 'physical', isActive: false },
          rate: { name: 'Texas sales tax', rateBasisPoints: 625, appliesToShipping: true },
        },
        {
          zone: { country: 'US', region: 'US-NY', nexusType: 'physical', isActive: false },
          rate: { name: 'New York sales tax', rateBasisPoints: 800, appliesToShipping: false },
        },
      ]),
  }),
  commercePreset({
    slug: 'tax-eu-vat-de',
    kind: 'tax',
    name: 'EU VAT — Germany',
    description:
      'A German VAT place with the 19% standard rate on goods and shipping, SWITCHED OFF. Turn it on once you are registered for VAT in the EU — nothing is charged until you do.',
    iconKey: 'globe',
    tags: ['tax', 'eu', 'vat', 'germany'],
    summary: [
      { label: 'Germany · economic nexus', tone: 'neutral' },
      { label: '19% standard VAT', tone: 'module' },
    ],
    marker: (tx, tenantId) =>
      tx.taxZone
        .findFirst({ where: { tenantId, country: 'DE', region: null }, select: { id: true } })
        .then(Boolean),
    build: (sx) =>
      installZonePacks(sx, [
        {
          zone: { country: 'DE', nexusType: 'economic', isActive: false },
          rate: { name: 'German VAT (standard)', rateBasisPoints: 1900, appliesToShipping: true },
        },
      ]),
  }),
  commercePreset({
    slug: 'tax-ca-gst-hst',
    kind: 'tax',
    name: 'Canada GST/HST',
    description:
      'Ontario (13% HST) and British Columbia (5% GST) set up with their rates, SWITCHED OFF. Turn on the provinces you are registered in — nothing is charged until you do.',
    iconKey: 'map-pin',
    tags: ['tax', 'canada', 'gst', 'hst'],
    summary: [
      { label: 'Ontario · British Columbia', tone: 'neutral' },
      { label: 'HST 13% · GST 5%', tone: 'module' },
    ],
    marker: (tx, tenantId) =>
      tx.taxZone
        .findFirst({ where: { tenantId, country: 'CA', region: 'CA-ON' }, select: { id: true } })
        .then(Boolean),
    build: (sx) =>
      installZonePacks(sx, [
        {
          zone: { country: 'CA', region: 'CA-ON', nexusType: 'physical', isActive: false },
          rate: { name: 'Ontario HST', rateBasisPoints: 1300, appliesToShipping: true },
        },
        {
          zone: { country: 'CA', region: 'CA-BC', nexusType: 'physical', isActive: false },
          rate: { name: 'British Columbia GST', rateBasisPoints: 500, appliesToShipping: true },
        },
      ]),
  }),
];
