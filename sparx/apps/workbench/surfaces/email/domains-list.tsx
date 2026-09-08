'use client';

// Every address your email can be sent FROM.
//
// A sending address is a domain you own (yourbusiness.com) that you have proven
// to the email provider, so mail goes out as hello@yourbusiness.com and reaches
// inboxes instead of spam folders. A tenant has a handful of these, so this is a
// short list of one-line things: a card with a row each, NOT a table — a table
// would invent columns to justify itself. The address IS the content of a row;
// everything else is a note about it (whether it is verified, whether this site
// sends from it by default).

import { useMemo, useState } from 'react';
import { Badge, Button, Heading, SearchInput, Text } from '@wizeworks/silicaui-react';
import { MailWarning, Plus, Send } from 'lucide-react';
import { RefreshButton } from '../../components/refresh-button';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  sendingDomainState,
  useEmailSettings,
  useSendingDomains,
  type SendingDomain,
} from './domains-data';
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
  isDefault,
  onOpen,
}: {
  domain: SendingDomain;
  isDefault: boolean;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = sendingDomainState(domain);
  return (
    <li className="border-base-300 hover:bg-base-200 border-b last:border-b-0">
      <button
        type="button"
        className="flex w-full min-w-0 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
        onClick={onOpen}
      >
        {/* The address is the content of this row — nothing else gets to be its
            size. */}
        <span className="min-w-0 font-mono text-base break-all">{domain.domain}</span>
        {isDefault ? (
          <Badge color="module" variant="soft" size="sm">
            Default here
          </Badge>
        ) : null}
        <span className="flex-1" />
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </button>
    </li>
  );
}

export function SendingDomainsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSendingDomains();
  const { data: settings } = useEmailSettings();
  const [search, setSearch] = useState('');

  const all = useMemo(() => data ?? [], [data]);
  const defaultId = settings?.defaultSendingDomainId ?? null;

  const needle = search.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? all.filter((domain) => domain.domain.toLowerCase().includes(needle)) : all),
    [all, needle]
  );

  const open = (domain: SendingDomain, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('email.domains.detail', { id: domain.id }, { target: targetFor(event) });
  };

  if (isError) {
    return (
      <PaneLoadError
        icon={<MailWarning className="size-6" aria-hidden />}
        title="Could not load your sending addresses"
        description="This is a problem reaching the server. Your addresses are unaffected — nothing has been lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Sending address list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search sending addresses"
              placeholder="Search addresses…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="hidden shrink-0 text-sm whitespace-nowrap @xl:block">
            {needle
              ? `${String(matches.length)} of ${String(all.length)}`
              : all.length === 1
                ? '1 address'
                : `${String(all.length)} addresses`}
          </p>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Add a sending address — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('email.domains.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a sending address
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : matches.length === 0 ? (
          <ListEmptyState
            filtered={needle !== ''}
            noResults={{
              icon: <Send className="size-6" aria-hidden />,
              title: 'No addresses match that',
              description: 'Try part of the address, or clear the search to see them all.',
            }}
            firstRun={{
              title: 'No sending addresses yet',
              description:
                'A sending address is a domain you own that your email goes out from — so customers see mail from your own address, like hello@yourbusiness.com, and it lands in inboxes instead of spam. Add one and add a few records at your domain provider to prove it is yours.',
              actions: (
                <Button
                  color="module"
                  size="sm"
                  onClick={(event) => {
                    ctx.open('email.domains.detail', { id: 'new' }, { target: targetFor(event) });
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add a sending address
                </Button>
              ),
            }}
          />
        ) : (
          // Capped and centred: a pane torn onto a second monitor is otherwise
          // 2000px wide with the status badges a foot from their addresses.
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <section className="card bg-base-100 overflow-hidden">
              <header className="border-base-300 flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <Heading level={2} className="text-base font-semibold">
                  Your sending addresses
                </Heading>
                <div className="flex-1" />
                <Text className="text-sm">
                  {all.length === 1 ? '1 address' : `${String(all.length)} addresses`}
                </Text>
              </header>
              <ul>
                {matches.map((domain) => (
                  <AddressRow
                    key={domain.id}
                    domain={domain}
                    isDefault={domain.id === defaultId}
                    onOpen={(event) => {
                      open(domain, event);
                    }}
                  />
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>

      <RowOpenHint what="an address to set it up" />
    </div>
  );
}
