// @wizeworks/query — the blessed client data layer (TanStack Query).
//
// ONE import source for client-interactive server state. Re-exports the full
// TanStack Query surface (hooks, types, QueryClient, dehydrate, HydrationBoundary,
// isServer, …) alongside the sparx setup so feature code imports everything from
// `@wizeworks/query` rather than reaching for `@tanstack/react-query` directly.
//
// - The client <QueryProvider> lives at the `@wizeworks/query/provider` subpath
//   (it carries 'use client'), keeping this barrel safe to import from RSCs.
// - The server-only SSR-prefetch helper lives at `@wizeworks/query/server`.
//
// Boundary rule: server-first by default (RSC reads, server-action writes).
// Reach for these hooks only for data that is client-owned and changes after
// load. See docs/95-client-data-fetching.md.
export * from '@tanstack/react-query';

// Deliberately AFTER the star, and deliberately the same name: this is
// TanStack's `useMutation` plus the one fact it keeps private — whether the code
// that called `mutate` passed its own `onError`. A global failed-write reporter
// cannot tell otherwise, and announces failures somebody has already announced.
// Shadowing the export is what makes that free for all 147 call sites.
// `shownInPlace` is the other half of the same fact: a surface that renders the
// error itself has spoken, but it spoke by rendering, which no watcher can see.
// `writeIdentity` lets one connect a failure to the retry that fixed it.
export { useMutation, callerHandledError, shownInPlace, writeIdentity } from './mutation';
export { createWriteAnnouncements } from './announcements';
export type { WriteAnnouncements } from './announcements';

export { makeQueryClient, DEFAULT_QUERY_OPTIONS } from './query-client';
export { getQueryClient } from './get-query-client';
export { queryKeys } from './keys';
