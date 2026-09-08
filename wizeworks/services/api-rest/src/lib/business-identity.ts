// Who is issuing this document — the business's own name and contact block.
//
// Invoices, receipts and purchase orders are issued by the BUSINESS, not by one
// of its sites: WizeWorks issues the invoice, even when the customer bought
// through the site called "sparx". So the masthead name and the seller block
// come from TenantBusiness (07-tenant-business.prisma), never from Property.
//
// This exists because invoice-render.ts and purchase-order-render.ts had each
// grown their own copy of "resolve the issuing tenant's name", and both left
// `addressLines` unset — the field the renderers have always read for the seller
// block, which no code path had ever populated. Both now resolve here, so the
// two documents cannot disagree about who sent them.

import { withTenant } from '@wizeworks/db';

export interface BusinessIdentity {
  /** Masthead name. Omitted (not empty) when the business has no name at all,
   *  so callers can spread it over a default without clobbering. */
  businessName?: string;
  /** The seller block under the masthead: address, then contact, then tax id.
   *  Omitted when the business has filled nothing in — an absent block prints
   *  nothing, where an array of empty strings would print blank lines. */
  addressLines?: string[];
}

interface BusinessRow {
  businessName: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  taxRegistered: boolean;
}

/** "Denver, CO 80202" — locality, region and postcode read as one line on every
 *  document, and each part is optional, so this joins only what exists rather
 *  than leaving stray commas behind. */
function localityLine(b: BusinessRow): string | null {
  const cityRegion = [b.city, b.region].filter(Boolean).join(', ');
  const line = [cityRegion, b.postalCode].filter(Boolean).join(' ').trim();
  return line || null;
}

function buildAddressLines(b: BusinessRow): string[] {
  const lines = [
    b.addressLine1,
    b.addressLine2,
    localityLine(b),
    // ISO-2 as stored. Printing "US" rather than "United States" is a known
    // roughness — mapping codes to display names is a localisation concern, and
    // guessing a language here would be worse than showing the code the
    // business itself entered.
    b.country,
    b.phone,
    // Only when actually registered. Printing a tax id a business does not hold
    // — or holds but is not registered under — is a compliance problem, not a
    // cosmetic one, so the flag gates the line rather than the id's presence.
    b.taxRegistered && b.taxId ? `Tax ID: ${b.taxId}` : null,
  ];
  return lines.filter((line): line is string => Boolean(line?.trim()));
}

/**
 * The issuer FROZEN on a document, when it has one.
 *
 * `billing_documents.issued_by` is written the moment a document is finalized,
 * precisely so that renaming a site — or editing the legal entity's address —
 * cannot rewrite the letterhead on invoices already in customers' hands. That
 * column was written and read by nothing: both renderers went to the live
 * business, so the exact rewrite it exists to prevent still happened, and a
 * customer's copy and the tenant's copy could disagree about who billed them.
 *
 * The frozen record carries BOTH names. `legalName` wins here for the same
 * reason the live path prefers the business over the site: an invoice is issued
 * by the BUSINESS, not by whichever shop the customer happened to buy through.
 *
 * The tax id needs no `taxRegistered` check — that gate was applied at freeze
 * time, so a value present here is one the business genuinely held that day.
 *
 * Returns null for a document finalized before the column existed, or never
 * finalized at all, which is the caller's signal to fall back to live.
 */
export function frozenIssuerIdentity(issuedBy: unknown): BusinessIdentity | null {
  if (!issuedBy || typeof issuedBy !== 'object' || Array.isArray(issuedBy)) return null;
  const issuer = issuedBy as Record<string, unknown>;
  const str = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  const address =
    issuer.address && typeof issuer.address === 'object' && !Array.isArray(issuer.address)
      ? (issuer.address as Record<string, unknown>)
      : {};

  // Same row shape, so the frozen block and the live one go through one
  // formatter and cannot drift into printing different addresses differently.
  const lines = buildAddressLines({
    businessName: str(issuer.legalName),
    phone: str(issuer.phone),
    addressLine1: str(address.line1),
    addressLine2: str(address.line2),
    city: str(address.city),
    region: str(address.region),
    postalCode: str(address.postalCode),
    country: str(address.country),
    taxId: str(issuer.taxId),
    taxRegistered: str(issuer.taxId) !== null,
  });

  const businessName = str(issuer.legalName) ?? str(issuer.siteName);
  if (!businessName && lines.length === 0) return null;
  return {
    ...(businessName ? { businessName } : {}),
    ...(lines.length > 0 ? { addressLines: lines } : {}),
  };
}

/**
 * Resolve the issuing business's document identity.
 *
 * Falls back to the tenant's legal name when no business name is set, so a
 * document always has a masthead: a business that never opened Business details
 * still gets "WizeWorks LLC" rather than a blank header.
 */
export async function resolveBusinessIdentity(ctx: {
  tenantId: string;
}): Promise<BusinessIdentity> {
  const [business, tenant] = await Promise.all([
    // tenant_businesses is FORCE RLS — read through withTenant, not the bare client.
    withTenant({ tenantId: ctx.tenantId }, (tx) =>
      tx.tenantBusiness.findUnique({
        where: { tenantId: ctx.tenantId },
        select: {
          businessName: true,
          phone: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          country: true,
          taxId: true,
          taxRegistered: true,
        },
      })
    ),
    withTenant({ tenantId: ctx.tenantId }, (tx) =>
      tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } })
    ),
  ]);

  // `||` is intended over `??`: an empty-after-trim name must fall through to
  // the next source, which `??` would not do.
  const businessName =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    business?.businessName?.trim() || tenant?.name?.trim() || undefined;

  const addressLines = business ? buildAddressLines(business) : [];

  return {
    ...(businessName ? { businessName } : {}),
    ...(addressLines.length > 0 ? { addressLines } : {}),
  };
}
