// `@detail` parallel slot — every nested route under (dashboard).
//
// A required catch-all (not optional) so it complements, rather than
// conflicts with, the index `page.tsx`. Together they make the detail slot
// resolve on all dashboard routes; the detail itself is keyed by the
// `?drawer=` / `?modal=` query string, not the path.
export { default } from '../../_shell/detail-slot';

export const dynamic = 'force-dynamic';
