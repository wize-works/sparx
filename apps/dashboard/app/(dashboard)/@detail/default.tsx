// Fallback for the `@detail` parallel slot. The optional catch-all page
// already matches every route under (dashboard), so this is only hit on
// hard navigations to states the slot can't otherwise resolve — render
// nothing.
export default function DetailDefault() {
  return null;
}
