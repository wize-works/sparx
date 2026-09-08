'use client';

// Every web address that reaches this business.
//
// Grouped by SITE rather than shown as one flat list, because the two things a
// row has to say — "this is live" and "this is the main address" — are only true
// relative to a site. A flat list shows three rows badged "Main address" with
// nothing explaining how they differ; grouped, the card heading answers it.
//
// Deliberately NOT a table. A table wants a header row per group, so three sites
// meant three identical "Address / Status / Role" strips down the page, and the
// Role column existed to carry a badge saying "Included" beside hosts ending in
// .sparx.zone — which is precisely what a host ending in .sparx.zone already
// tells you. The address IS the content here, so each site is a card and each
// address a row inside it: host on the left, state on the right, nothing else
// competing.

import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, Heading, SearchInput, Text } from '@wizeworks/silicaui-react';
import { ExternalLink, GlobeLock, Plus, ShoppingBag } from 'lucide-react';
import { useActiveSiteId } from '../../lib/api/shell-data';
import { RefreshButton } from '../../components/refresh-button';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useSites } from '../sites/data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { DOMAIN_SHOP_URL, domainState, useDomains, type Domain } from './data';
import { RowOpenHint } from '../../components/row-open-hint';
import { PaneLoadError } from '../../components/pane-load-error';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function AddressRow({
  domain,
  onOpen,
}: {
  domain: Domain;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = domainState(domain);
  const isLive = state.tone === 'success';

  return (
    // The row's own action is a real <button>, not a div wearing role="button":
    // it has to be keyboard-reachable, and it cannot legally contain the
    // external link (an anchor inside a button is invalid and unreachable by
    // keyboard). So the link is the button's SIBLING, and the <li> is only the
    // hover surface holding the two together.
    <li className="border-base-300 hover:bg-base-200 flex items-center gap-2 border-b px-4 last:border-b-0">
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-3 text-left"
        onClick={onOpen}
      >
        {/* The address is the content of this row — everything else is a note
            about it, so nothing else gets to be the same size. */}
        <span className="min-w-0 font-mono text-base break-all">{domain.host}</span>
        {domain.isCanonical ? (
          <Badge color="module" variant="soft" size="sm">
            Main
          </Badge>
        ) : null}
        <span className="flex-1" />
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </button>

      {/* Only offered once it actually resolves — a link to a pending address
          is a dead tab. The placeholder keeps the state badges in one column
          whether or not a row has a link, so the eye runs straight down them. */}
      {isLive ? (
        <a
          href={`https://${domain.host}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${domain.host} in a new tab`}
          title={`Open ${domain.host} in a new tab`}
          className="link inline-flex shrink-0 items-center py-3"
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : (
        <span className="inline-block size-4 shrink-0" aria-hidden />
      )}
    </li>
  );
}

export function DomainsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data: domains, isPending, isError, isFetching, dataUpdatedAt, refetch } = useDomains();
  const { data: sites } = useSites();
  const { data: active } = useActiveSiteId();
  const [search, setSearch] = useState('');

  const activeId = active?.propertyId ?? sites?.find((site) => site.isPrimary)?.id ?? null;

  // A disconnected domain is kept as a row so history survives, but it is not an
  // address anyone can reach — showing it here would be listing something that
  // does not exist.
  const live = useMemo(
    () => (domains ?? []).filter((domain) => domain.status !== 'removed'),
    [domains]
  );

  const siteName = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites ?? []) map.set(site.id, site.name);
    return map;
  }, [sites]);

  // Filtered here, not through the API: /v1/domains takes no query, the list is
  // already loaded, and it is a handful of rows. Matches the site name too, so
  // "everything under Ironleaf" is one thing to type.
  const needle = search.trim().toLowerCase();
  const matches = needle
    ? live.filter(
        (domain) =>
          domain.host.toLowerCase().includes(needle) ||
          (siteName.get(domain.propertyId) ?? '').toLowerCase().includes(needle)
      )
    : live;

  // Grouped in the SITES list's order (primary first, then by name) so the two
  // surfaces agree, rather than each sorting its own way.
  const groups = useMemo(() => {
    const byProperty = new Map<string, Domain[]>();
    for (const domain of matches) {
      const list = byProperty.get(domain.propertyId) ?? [];
      list.push(domain);
      byProperty.set(domain.propertyId, list);
    }
    return (sites ?? [])
      .map((site) => ({ site, rows: byProperty.get(site.id) ?? [] }))
      .filter((group) => group.rows.length > 0);
  }, [matches, sites]);

  const open = (domain: Domain, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('platform.settings.domain', { id: domain.id }, { target: targetFor(event) });
  };

  if (isError) {
    return (
      <PaneLoadError
        icon={<GlobeLock className="size-6" aria-hidden />}
        title="Could not load your web addresses"
        description="This is a problem reaching the server. Your addresses are unaffected and still working."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    // Surfaces, not one slab: the pane is base-200 and the toolbar is a base-100
    // card lifted onto it, matching invoicing and orders. The house pattern.
    <div className={PANE_SHELL}>
      {/* Five things — search, a count, a secondary action, the primary action
          and refresh — is more than a half-width pane holds. This toolbar does
          NOT wrap: a second line shoves the list down and reflows as you type.
          Instead things give way in a deliberate order as the pane narrows:
          below @2xl "Get a domain" drops to its icon, and below @xl the count
          disappears. That order is on purpose — the secondary label goes FIRST,
          well before space gets tight, because search is used constantly and
          "Get a domain" almost never; letting the label survive was squeezing
          the search box to a stub. The search box absorbs whatever is left
          (`min-w-0 flex-1`), and the primary action and refresh never change. */}
      <PaneToolbar
        label="Web address list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search web addresses"
              placeholder="Search addresses…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="hidden shrink-0 text-sm whitespace-nowrap @xl:block">
            {needle
              ? `${String(matches.length)} of ${String(live.length)}`
              : live.length === 1
                ? '1 address'
                : `${String(live.length)} addresses`}
          </p>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Connect a domain — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('platform.settings.domain', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Connect a domain
          </Button>
        }
        controls={
          /* Buying is not part of this surface yet, so "I don't have one" is
             answered with a real place to get one rather than a dead button. */
          <Button
            size="sm"
            variant="ghost"
            color="module"
            className="shrink-0 whitespace-nowrap"
            // silica's Button renders through `render`, so the composition moves
            // this Button's children onto the anchor. The a11y rule reads the
            // source element and cannot see that.
            // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive via `render`
            render={<a href={DOMAIN_SHOP_URL} target="_blank" rel="noreferrer" />}
          >
            <ShoppingBag className="size-4" aria-hidden />
            <span className="hidden @2xl:inline">Get a domain</span>
            <ExternalLink className="hidden size-3 @2xl:inline" aria-hidden />
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={domains ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <p className="text-sm" role="status">
            Loading…
          </p>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<GlobeLock className="size-6" aria-hidden />}
            title={needle ? 'No addresses match that' : 'No web addresses yet'}
            description={
              needle
                ? 'Try part of the address or the name of the site it belongs to — or clear the search to see them all.'
                : 'Every site comes with a free sparx.zone address, so this list should not be empty. Try reloading.'
            }
          />
        ) : (
          // Capped and centred: a pane torn onto a second monitor is otherwise
          // 2000px wide with the state badges a foot away from their addresses.
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {groups.map(({ site, rows }) => (
              <section key={site.id} className="card bg-base-100 overflow-hidden">
                <header className="border-base-300 flex flex-wrap items-center gap-2 border-b px-4 py-3">
                  <Heading level={2} className="text-base font-semibold">
                    {site.name}
                  </Heading>
                  {site.id === activeId ? (
                    <Badge color="success" variant="soft" size="sm">
                      You are here
                    </Badge>
                  ) : null}
                  <div className="flex-1" />
                  <Text className="text-sm">
                    {rows.length === 1 ? '1 address' : `${String(rows.length)} addresses`}
                  </Text>
                </header>
                <ul>
                  {rows.map((domain) => (
                    <AddressRow
                      key={domain.id}
                      domain={domain}
                      onOpen={(event) => {
                        open(domain, event);
                      }}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* No border now that the pane is base-200 — the hint sits ON the pane
          rather than in a docked strip, so a rule above it would be drawing a
          line under nothing. */}
      <RowOpenHint what="an address to set it up" />
    </div>
  );
}
