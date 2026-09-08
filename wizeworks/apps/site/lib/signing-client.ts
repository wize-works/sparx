// Browser-side e-sign client (docs/144 §12) — reads and signs a document from
// the customer's side, via the same-origin /api/sparx proxy so there is no CORS
// and the tenant slug rides the query string, exactly like the checkout and
// scheduling clients.
//
// The TOKEN is the only credential. It arrived in an email, it is in the URL,
// and it identifies one signature request inside one tenant. Nothing here sends
// a session, because the person signing is a customer who has never logged in
// and never should have to in order to accept a quote.

const API_BASE = '/api/sparx';

export type SigningStatus = 'pending' | 'signed' | 'declined' | 'expired' | 'revoked';

export interface SigningLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** Everything the signing page renders — deliberately the minimum a signer
 *  needs to know what they are agreeing to. */
export interface SigningView {
  signatureId: string;
  status: SigningStatus;
  signerName: string;
  signerEmail: string;
  expiresAt: string;
  signedAt: string | null;
  declineReason: string | null;
  document: {
    id: string;
    number: string | null;
    currency: string;
    total: number;
    validUntil: string | null;
    /** The business's own word for this — "Estimate", "Quote", "Work Order". */
    label: string;
    lines: SigningLine[];
  };
  business: { name: string; email: string | null };
}

export interface SignResult {
  movedToStage: string | null;
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    { success: true; data: T } | { success: false; error: { message: string } } | null;
  if (!res.ok || !body || body.success === false) {
    const message = body?.success === false ? body.error.message : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body.data;
}

export async function loadSigningView(tenantSlug: string, token: string): Promise<SigningView> {
  const qs = new URLSearchParams({ tenant: tenantSlug });
  const res = await fetch(
    `${API_BASE}/v1/public/documents/sign/${encodeURIComponent(token)}?${qs.toString()}`,
    // Never cached. A signing page that renders a stale "pending" after somebody
    // has already signed invites a second signature on a frozen document.
    { cache: 'no-store' }
  );
  return unwrap<SigningView>(res);
}

export async function signDocument(
  tenantSlug: string,
  token: string,
  signerName: string
): Promise<SignResult> {
  const qs = new URLSearchParams({ tenant: tenantSlug });
  const res = await fetch(`${API_BASE}/v1/public/documents/sign?${qs.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token,
      signerName,
      // Typed, not drawn. A drawn mark needs a canvas that works on a phone, and
      // the evidence is the token, the time and the address either way — the
      // picture is reassurance, not proof.
      mark: { kind: 'typed', value: signerName },
    }),
  });
  return unwrap<SignResult>(res);
}

export async function declineDocument(
  tenantSlug: string,
  token: string,
  reason: string
): Promise<void> {
  const qs = new URLSearchParams({ tenant: tenantSlug });
  const res = await fetch(`${API_BASE}/v1/public/documents/decline?${qs.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, reason: reason.trim() || undefined }),
  });
  await unwrap<unknown>(res);
}
