// `@detail` parallel slot — index route ("/").
//
// A plain page (not an optional catch-all) so it doesn't collide with the
// dashboard index page's specificity. The catch-all sibling handles every
// nested route. Both delegate to the shared DetailSlot. See detail-slot.tsx.
export { default } from '../_shell/detail-slot';

export const dynamic = 'force-dynamic';
