// Client-side newsletter signup. A thin fetch wrapper over the public
// email-capture endpoint, via the same-origin /api/sparx proxy. Runs in the
// browser (the "Email signup" Builder block, docs/51 §7).

const API_BASE = '/api/sparx';

/** Opt an email into marketing. Resolves on success; throws with the API's
 *  message on failure (e.g. CRM not active → MODULE_DISABLED). The endpoint is
 *  idempotent, so a repeat submit is a no-op success. */
export async function subscribeEmail(
  tenantSlug: string,
  email: string,
  propertySlug?: string,
  /** The block that captured this, so the server can enter it into whichever
   *  campaign points at that block (docs/152 C1). */
  formNodeId?: string
): Promise<void> {
  const qs = new URLSearchParams({ tenant: tenantSlug });
  if (propertySlug) qs.set('property', propertySlug);
  const res = await fetch(`${API_BASE}/v1/public/signup?${qs.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(formNodeId ? { email, formNodeId } : { email }),
  });
  const body = (await res.json().catch(() => null)) as
    { success: true } | { success: false; error: { message: string; code: string } } | null;
  if (!res.ok || !body || body.success === false) {
    const message =
      body?.success === false ? body.error.message : `Couldn’t subscribe (${res.status}).`;
    throw new Error(message);
  }
}
