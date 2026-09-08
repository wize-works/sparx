// Where a signing link is built and sent (docs/144 §12).
//
// This lives in api-rest rather than in @wizeworks/crm for the same reason
// `email-data.ts` does: the composition root is the only place that knows the
// storefront's public URL and already owns the outbound email path, and giving
// @wizeworks/crm a transport dependency to send one email would be paying for it in
// every unit test in the package.
//
// THE LINK IS BUILT ONCE AND NEVER STORED. It exists in this function's
// arguments, in the rendered email, and in the response to the person who asked
// for it. Nothing that survives the request can reconstruct it — the row holds
// only a SHA-256.

import type { FastifyRequest } from 'fastify';
import type { BillingDocumentSignature } from '@wizeworks/db';
import { prisma, withTenant } from '@wizeworks/db';
import { requireAuth } from '@wizeworks/api-core/auth';

import { publish } from '@wizeworks/api-core/pubsub';

/** Same substitution `email-data.ts` uses, so a signing link and the links
 *  inside the email that carries it point at the same place. */
const SITE_BASE = process.env.SPARX_SITE_BASE ?? '';

function signingUrl(slug: string, token: string): string {
  const path = `/sign/${encodeURIComponent(token)}`;
  if (!SITE_BASE) return path;
  return `${SITE_BASE.replace('{slug}', slug)}${path}`;
}

export interface SendSignatureArgs {
  documentId: string;
  signature: BillingDocumentSignature;
  token: string;
  notify: boolean;
}

/**
 * Build the customer-facing signing link and, if asked, email it.
 *
 * Returns the link either way. `notify: false` is a real and useful mode — a rep
 * on the phone wants to paste it into the chat they are already in, and forcing
 * an email would send the customer a second copy of something they are looking
 * at.
 */
export async function sendSignatureRequest(
  request: FastifyRequest,
  args: SendSignatureArgs
): Promise<string> {
  const auth = requireAuth(request);
  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tenantId },
    select: { slug: true, name: true },
  });
  const url = signingUrl(tenant?.slug ?? '', args.token);
  if (!args.notify) return url;

  const document = await withTenant({ tenantId: auth.tenantId }, (tx) =>
    tx.billingDocument.findUnique({
      where: { id: args.documentId },
      select: {
        number: true,
        total: true,
        currency: true,
        propertyId: true,
        stage: { select: { customerLabel: true } },
        // WHO IS ASKING. The mail named no business at all -- "your estimate is
        // ready", under our wordmark, to somebody who has never heard of us,
        // with a link asking them to sign. The trading name, not the legal
        // entity: this is the shop the signer thinks they are dealing with.
        property: { select: { name: true } },
      },
    })
  );

  // The bus, not a direct send — the platform email rule (root CLAUDE.md). One
  // path means one place where suppression, bounce handling and per-site
  // branding are correct. A signing link is not an OTP; nothing about it needs
  // to be synchronous.
  await publish(request.log, 'email.send', auth.tenantId, auth.actorId, {
    to: args.signature.signerEmail,
    template: 'document-signature-request',
    propertyId: document?.propertyId ?? null,
    props: {
      signerName: args.signature.signerName,
      // The label is the tenant's own word for this stage — "Estimate", "Quote",
      // "Work Order". A hardcoded "quote" would be wrong on most of them.
      fromName: document?.property?.name ?? tenant?.name ?? null,
      documentLabel: document?.stage.customerLabel ?? 'document',
      documentNumber: document?.number ?? '',
      documentTotal: document ? Number(document.total) : 0,
      currency: document?.currency ?? 'USD',
      expiresAt: args.signature.expiresAt.toISOString(),
      signingUrl: url,
    },
  });

  return url;
}
