// Fallback for the `@detail` parallel slot. The index page + required
// catch-all already match every route under (dashboard); this is only hit on
// hard navigations to states the slot can't otherwise resolve — render nothing.
export default function DetailDefault() {
  return null;
}
