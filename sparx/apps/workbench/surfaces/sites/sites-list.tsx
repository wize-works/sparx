'use client';

// Every site this business publishes.
//
// Not built on `createEntityListSurface`: that renders one endpoint's rows as a
// table, and this list's job is mostly the things a generic table has no idea
// about — which site you are CURRENTLY working in, which one is primary, and
// switching between them. A site is a workspace, not a record.

import { useMemo, useState } from 'react';
import { Badge, Button, Card, SearchInput, Table } from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ExternalLink, Globe, Plus } from 'lucide-react';
import { ListPagination, type PageSize } from '../../components/list-pagination';
import { useWorkbench } from '../../lib/workbench/context';
import { RefreshButton } from '../../components/refresh-button';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useActiveSiteId } from '../../lib/api/shell-data';
import { switchSite } from '../../lib/api/shell-data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useDomains, useSites, type Domain, type Site } from './data';
import { RowOpenHint } from '../../components/row-open-hint';
import { PaneLoadError } from '../../components/pane-load-error';

/** Same modifier contract as the launcher and every other list. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The address a visitor would actually type. Canonical when one is marked,
 *  otherwise the first — a site always has at least its sparx.zone subdomain. */
function canonicalHost(domains: Domain[]): string | null {
  const active = domains.filter((domain) => domain.status !== 'removed');
  return (active.find((domain) => domain.isCanonical) ?? active[0])?.host ?? null;
}

export function SitesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const { controller } = useWorkbench();
  const confirm = useConfirm();
  const { data: sites, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSites();
  const { data: domains } = useDomains();
  const { data: active } = useActiveSiteId();
  const [switching, setSwitching] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);

  /** Every route back to the search box goes through here, because changing what
   *  matches has to send you back to the first page. Stay on page 2 while the
   *  results narrow to three sites and the table is simply blank — the rows are
   *  all on page 1, and nothing on screen says so. */
  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const byProperty = useMemo(() => {
    const map = new Map<string, Domain[]>();
    for (const domain of domains ?? []) {
      const list = map.get(domain.propertyId) ?? [];
      list.push(domain);
      map.set(domain.propertyId, list);
    }
    return map;
  }, [domains]);

  // The active site can be null before anyone has ever switched — the cookie
  // simply does not exist yet — in which case api-rest is serving the primary.
  // Resolving it here means the badge is honest on a first-ever visit instead of
  // showing nothing as active.
  const activeId = active?.propertyId ?? sites?.find((site) => site.isPrimary)?.id ?? null;

  const open = (site: Site, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('platform.settings.site', { id: site.id }, { target: targetFor(event) });
  };

  /**
   * Switching is a full context change — it saves this site's pane layout, moves
   * the cookie, and reloads the window — so it asks first when anything is
   * unsaved. The same conversation the toolbar switcher has, for the same
   * reason: the reload would discard the work without it.
   */
  const onSwitch = async (site: Site) => {
    if (site.id === activeId) return;
    if (controller.hasUnsavedWork()) {
      const ok = await confirm({
        title: `Switch to ${site.name}?`,
        description:
          'Something in this workspace has unsaved changes. Switching sites reloads the workbench and those changes will be lost.',
        confirmLabel: 'Switch anyway',
        cancelLabel: 'Stay here',
        color: 'warning',
      });
      if (!ok) return;
    }
    setSwitching(site.id);
    await switchSite(controller, activeId ?? 'default', site.id);
  };

  if (isError) {
    return (
      <PaneLoadError
        icon={<Globe className="size-6" aria-hidden />}
        title="Could not load your sites"
        description="This is a problem reaching the server, not a problem with your sites."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const all = sites ?? [];
  // Filtered here rather than through the API: /v1/properties takes no query,
  // the whole list is already loaded, and a business has sites in the tens —
  // so this is instant and costs no round trip. Matches the web address too,
  // because "which one is shop.acme.com again?" is a real way to look.
  const needle = search.trim().toLowerCase();
  const rows = needle
    ? all.filter((site) => {
        const host = canonicalHost(byProperty.get(site.id) ?? []) ?? '';
        return (
          site.name.toLowerCase().includes(needle) ||
          site.slug.toLowerCase().includes(needle) ||
          host.toLowerCase().includes(needle)
        );
      })
    : all;

  // Paged here rather than at the server, and that is forced by the filter above
  // rather than being a shortcut. `useSites()` asks /v1/properties for the whole
  // list with no paging params, and the search box filters what came back — so
  // paging has to sit on the SAME side of the wire as the filter it pages. Ask
  // the server for rows 51–100 while the box filters locally and the box only
  // ever searches the page you happen to be standing on: type a site's name and
  // it is "not found" because it is on page 2. If you are here to add skip/take
  // to /v1/properties, the search has to move there in the same change.
  //
  // The slice is taken from the FILTERED list, so the pager's "of N" counts what
  // matches the search — the same number the toolbar prints as "3 of 12". Two
  // counts describing one list must never disagree; a range reading "1–3 of 12"
  // under a table of three is how someone concludes rows are missing.
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // Clamped rather than trusted. Page resets to 1 whenever the search changes
  // (see `changeSearch`), but the list can also shrink underneath a settled
  // search — a site can be removed elsewhere and this query refetch — and losing
  // the last row of page 2 would otherwise leave someone staring at an empty
  // table with no hint that the fix is to page back.
  const currentPage = Math.min(page, pageCount);
  const skip = (currentPage - 1) * pageSize;
  const paged = rows.slice(skip, skip + pageSize);

  return (
    // Surfaces, not one slab: the pane is base-200 and the toolbar is a base-100
    // card lifted onto it, matching invoicing and orders. The house pattern.
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Site list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search sites"
              placeholder="Search sites…"
              value={search}
              onValueChange={changeSearch}
            />
          </div>
        }
        status={
          <p className="shrink-0 text-sm whitespace-nowrap">
            {needle
              ? `${String(rows.length)} of ${String(all.length)}`
              : all.length === 1
                ? '1 site'
                : `${String(all.length)} sites`}
          </p>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="New site — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('platform.settings.site', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New site
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={sites ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {/* The base-200 backdrop and its padding now live on the pane root, above,
          so the toolbar sits on the same surface as the list rather than being
          docked to the pane edge. This used to be a second wrapper doing that
          job for the list alone — nesting it inside the new root would have
          doubled the gutter.

          Scroll lives on the sheet, not the backdrop, so the rows move
          underneath a card that stays put. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <p className="text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          // "Nothing matched" and "you have none" are different situations, and
          // telling someone to create their first site when they have twelve
          // and simply mistyped is the more annoying of the two mistakes.
          <ListEmptyState
            filtered={Boolean(needle)}
            noResults={{
              icon: <Globe className="size-6" aria-hidden />,
              // Quote the search back rather than describing it — someone who
              // mistyped sees the typo next to the word they typed, not in a
              // sentence. Same treatment as the team roster. Only this case gets
              // a way out, because only this case is recoverable.
              title: `No sites match "${search.trim()}"`,
              description: 'Try part of the name, the handle, or the web address.',
              actions: (
                <Button
                  color="neutral"
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    changeSearch('');
                  }}
                >
                  Show all sites
                </Button>
              ),
            }}
            firstRun={{
              // No action: nothing conjures a first site, and the toolbar
              // already carries "New site".
              title: 'No sites yet',
              description:
                'A site is one website — its own name, pages, and web address. Your business can run as many as it needs.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Site</th>
                <th>Web address</th>
                <th>Role</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((site) => {
                const host = canonicalHost(byProperty.get(site.id) ?? []);
                const isActive = site.id === activeId;
                return (
                  <tr
                    key={site.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(site, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(site, event);
                    }}
                  >
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{site.name}</span>
                        <span className="font-mono text-xs">{site.slug}</span>
                      </div>
                    </td>
                    <td>
                      {host ? (
                        // Stops the row's own open-handler: this opens the live
                        // site, which is not what clicking the row means.
                        <a
                          href={`https://${host}`}
                          target="_blank"
                          rel="noreferrer"
                          className="link inline-flex items-center gap-1 text-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {host}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-sm">Not published yet</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {site.isPrimary ? (
                          <Badge color="module" variant="soft" size="sm">
                            Primary
                          </Badge>
                        ) : null}
                        {isActive ? (
                          <Badge color="success" variant="soft" size="sm">
                            You are here
                          </Badge>
                        ) : null}
                        {site.status !== 'active' ? (
                          <Badge color="warning" variant="soft" size="sm">
                            {site.status}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-right">
                      {isActive ? null : (
                        <Button
                          size="xs"
                          variant="outline"
                          color="neutral"
                          disabled={switching !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onSwitch(site);
                          }}
                        >
                          {switching === site.id ? 'Switching…' : 'Work on this'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Outside the scrolling region above, so it does not scroll away with the
          rows — the control that moves you to page 3 is useless if reaching it
          means scrolling to the bottom of page 2.

          Hidden entirely when there is nothing to page. "No sites yet" and "no
          sites match that" both already say what happened and what to do about
          it; a "Nothing to show" readout and a rows-per-page picker underneath
          that is a second, quieter voice answering a question nobody asked,
          about a list that isn't there. It is also the only reading under which
          the pager cannot contradict the empty state — it says nothing at all. */}
      {!isPending && rows.length > 0 ? (
        // Sits on the pane, not in a card — it describes the table rather than
        // being part of it, which is what the recessed surface says. No border
        // now the pane is base-200: a rule here would underline nothing.
        <div className="shrink-0">
          <ListPagination
            shown={paged.length}
            firstRow={paged.length === 0 ? 0 : skip + 1}
            total={rows.length}
            page={currentPage}
            pageSize={pageSize}
            // Every site is already in memory, so there is no wider window to
            // fetch — "Load more" would be a button that loads nothing. The
            // numbered pages do the whole job here.
            canLoadMore={false}
            busy={isPending}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              // Page 2 at 25 rows is somewhere else entirely at 100, so the
              // honest answer is to start again from the top rather than guess
              // which of the old rows someone was looking at.
              setPage(1);
            }}
          />
        </div>
      ) : null}

      <RowOpenHint what="a site to manage it" />
    </div>
  );
}
