'use client';

// Sales channels — every outside shop you've connected, and the ones you could.
//
// product-channels.tsx shows where ONE product is listed. This is the whole-
// business view: each connected shop, whether it's healthy, and how many of your
// product listings ride on it. Connections are made by an OAuth handshake and
// the listings on them are created by the sync worker (the side that knows the
// external ids), so this surface manages what exists — view health, disconnect —
// and shows the catalog of what's available, rather than hand-creating a link.
//
// Disconnecting is the one destructive act here, and it has a sharp edge: it
// removes OUR record of the shop's listings, but it does NOT take those listings
// down on the shop itself. The confirm says so first.

import { useMemo } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Link2Off, ServerCrash, Store } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { productErrorMessage } from './products-data';
import {
  connectionState,
  useChannels,
  useDisconnectChannel,
  type ChannelCatalogEntry,
  type ChannelConnection,
} from './channels-data';

const LABEL = 'Sales channels';

const PHASE_LABEL: Record<ChannelCatalogEntry['phase'], string> = {
  P1: 'coming soon',
  P2: 'coming soon',
  P3: 'coming later',
  P4: 'coming later',
  P5: 'coming later',
};

function ConnectionRow({
  connection,
  channelName,
}: {
  connection: ChannelConnection;
  channelName: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const disconnect = useDisconnectChannel();
  const state = connectionState(connection.status);
  const where = connection.shopName ? `${channelName} · ${connection.shopName}` : channelName;

  const onDisconnect = () => {
    void (async () => {
      const ok = await confirm({
        title: `Disconnect ${where}?`,
        description: `This does NOT take your listings down on ${channelName} — they stay live there and people can still buy them. What stops is us keeping them up to date and matching orders from ${channelName} back to your products, so stock will drift. To actually remove the listings, delist them in ${channelName}'s own seller tools first.`,
        confirmLabel: 'Disconnect it',
        cancelLabel: 'Keep it connected',
        color: 'danger',
      });
      if (!ok) return;
      disconnect.mutate(connection.channel, {
        onSuccess: () => {
          toast.add({ title: `Disconnected ${channelName}`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not disconnect that shop',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  return (
    <div className="border-base-300 flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text as="span" className="font-medium">
            {where}
          </Text>
          <Text className="text-sm">
            {connection.mappingCount === 0
              ? 'No product listings on it yet.'
              : connection.mappingCount === 1
                ? '1 product listing rides on it.'
                : `${String(connection.mappingCount)} product listings ride on it.`}
          </Text>
          <Text className="text-sm">
            {connection.lastSyncedAt ? (
              <>
                Last updated <Timestamp value={connection.lastSyncedAt} format="relative" />
              </>
            ) : (
              'Not updated since it was connected.'
            )}
          </Text>
        </div>
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </div>
      <div className="flex">
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          className="ml-auto"
          loading={disconnect.isPending}
          onClick={onDisconnect}
        >
          <Link2Off className="size-4" aria-hidden />
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function CatalogRow({ entry }: { entry: ChannelCatalogEntry }) {
  const available = entry.availability === 'available';
  return (
    <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="span" className="font-medium">
          {entry.name}
        </Text>
        <Text className="text-sm">{entry.tagline}</Text>
      </div>
      <Badge color={available ? 'success' : 'neutral'} variant="soft" size="sm">
        {available ? 'Available' : PHASE_LABEL[entry.phase]}
      </Badge>
    </div>
  );
}

export function ChannelsSurface({ ctx: _ctx }: { ctx: SurfaceContext }) {
  const channels = useChannels();
  const data = channels.data;

  const nameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of data?.catalog ?? []) map.set(entry.slug, entry.name);
    return map;
  }, [data]);

  const connections = data?.connections ?? [];
  const available = (data?.catalog ?? []).filter((c) => c.availability === 'available');
  const comingSoon = (data?.catalog ?? []).filter((c) => c.availability !== 'available');

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Sales channels controls"
        controls={
          <>
            <Store className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {LABEL}
            </Heading>
            {connections.length > 0 ? (
              <Badge color="success" variant="soft" size="sm">
                {connections.length === 1
                  ? '1 connected'
                  : `${String(connections.length)} connected`}
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={channels.isFetching}
            updatedAt={data ? channels.dataUpdatedAt : undefined}
            onRefresh={() => {
              void channels.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {channels.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load your sales channels"
              description={productErrorMessage(
                channels.error,
                'This is a problem reaching the server. Nothing about your connected shops has changed.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void channels.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : channels.isLoading ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Heading level={1} className="text-2xl font-semibold">
                  Where else you sell
                </Heading>
                <Text className="text-sm">
                  Outside shops like Etsy or TikTok Shop that you’ve connected, and the ones you’ll
                  be able to connect. Connecting a shop syncs your products to it and brings its
                  orders back to you.
                </Text>
              </div>

              <FormSection title="Connected shops">
                {connections.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={<Store className="size-6" aria-hidden />}
                    title="No shops connected yet"
                    description="Once you connect an outside shop, it appears here with how many of your products are listed on it and whether it's up to date."
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    {connections.map((connection) => (
                      <ConnectionRow
                        key={connection.id}
                        connection={connection}
                        channelName={nameBySlug.get(connection.channel) ?? connection.channel}
                      />
                    ))}
                  </div>
                )}
              </FormSection>

              {available.length > 0 ? (
                <FormSection
                  title="Ready to connect"
                  description="These shops are set up on sparx and can be connected from your settings."
                >
                  <div className="flex flex-col gap-3">
                    {available.map((entry) => (
                      <CatalogRow key={entry.slug} entry={entry} />
                    ))}
                  </div>
                </FormSection>
              ) : null}

              {comingSoon.length > 0 ? (
                <FormSection
                  title="On the way"
                  description="Shops that aren't ready to connect yet — they'll light up here when they are, with nothing for you to do."
                >
                  <div className="flex flex-col gap-3">
                    {comingSoon.map((entry) => (
                      <CatalogRow key={entry.slug} entry={entry} />
                    ))}
                  </div>
                </FormSection>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
