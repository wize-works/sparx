// The console's test seat.
//
// WHY AN APP HAS ONE. The house convention is that packages are tested and apps
// are not, and it holds wherever an app is only wiring. This one is not: the
// console decides what an operator READS — which name a screen has, what the
// search box puts under the highlight, whether a failed write explains itself —
// and every one of those is a pure function whose failure is invisible to
// typecheck, lint and the eye.
//
// WHY IT IS A SECOND COPY. The other console has the same seat and, in places,
// the same rules. They are not shared and must not be: neither brand tree may
// import from the other, so a rule that exists in both is two files kept in step
// by `check:console-parity`, and a rule tested in only one of them is a rule
// half-tested. What is genuinely piggles-only (billing lifecycle, blueprints,
// forms, redirects, webhooks) has nothing to test here.
//
// What is NOT tested here is React: no component rendering, no jsdom, no
// query-client fixtures. The surfaces are checked by driving them as the
// operator, which is the right test for a surface and the wrong one for a
// sentence.

// A PLAIN OBJECT, not `defineConfig`. The helper is imported from `vitest/config`,
// which resolves only once vitest is linked into this workspace — so a config
// using it cannot load on a checkout where `pnpm install` has not run yet, and
// the failure is an unresolved-import stack rather than "run install". A literal
// config loads either way.
export default {
  test: {
    // Co-located beside the module they cover, the way the wizeworks packages do
    // it — a rule and its test read as one file pair.
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    environment: 'node',
  },
};
