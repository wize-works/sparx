// Unauthenticated liveness/readiness probe. The k8s probes hit this
// directly so we don't need a real tenant Host header — they'd otherwise
// trip the tenant-not-found 404 from the storefront catch-all.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return Response.json({ ok: true });
}
