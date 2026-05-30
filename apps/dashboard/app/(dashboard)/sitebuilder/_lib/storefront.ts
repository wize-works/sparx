import 'server-only';

// Origin of the tenant's live storefront, used as the src of preview iframes in
// the customizer and the page builders.
//
// Tenant storefronts run at <slug>.sparx.zone in prod (the same convention the
// CMS preview link uses). `SPARX_STOREFRONT_URL` is a LOCAL-DEV override only —
// set it to http://localhost:3200 when running the storefront on a laptop,
// where *.sparx.zone doesn't resolve. It is intentionally unset in prod so we
// never fall back to a localhost URL, which trips the browser's "access other
// apps on this device" prompt and refuses to connect.
const ZONE_DOMAIN = process.env.NEXT_PUBLIC_SPARX_ZONE_DOMAIN ?? 'sparx.zone';

export function storefrontOrigin(slug: string): string {
  const devOverride = process.env.SPARX_STOREFRONT_URL;
  if (devOverride) return devOverride;
  return `https://${slug}.${ZONE_DOMAIN}`;
}
