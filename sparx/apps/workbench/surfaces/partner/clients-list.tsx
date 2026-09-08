'use client';

// Clients — the sparx accounts you look after, and the access each one has given
// you.
//
// A client is the UNION of two relationships (docs/114 §B.7): a business you
// REFERRED (they signed up under your link, which is what earns commission), and
// a business you MANAGE (they added you to their account as a consultant, so you
// can work inside it). An account can be one, the other, or both — a referral you
// also manage is the certified-tier "managed account" that earns ongoing.
//
// Read-only: each row states the relationship and the access it carries. Entering
// a managed account is a workspace switch, done from the account switcher in the
// chrome — not a per-row action here, which would be a second, competing way to
// do the same thing.

import { Badge, EmptyState, Heading, Text } from '@wizeworks/silicaui-react';
import { Building2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { usePartnerClients, type PartnerClient } from './data';
import { formatDate, referralState } from './format';
import { PartnerLoadError, PartnerLoading } from './gate';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function accessDescription(client: PartnerClient): string {
  if (client.referred && client.managed) {
    return 'You referred them and you manage their account — full access, and they earn you commission.';
  }
  if (client.managed) {
    return 'You manage their account — they added you as a consultant, so you can work inside it.';
  }
  if (client.firstPaymentAt) {
    return `They signed up under your link and first paid on ${formatDate(client.firstPaymentAt)}.`;
  }
  return 'They signed up under your referral link.';
}

function ClientRow({ client }: { client: PartnerClient }) {
  const referral = client.referralStatus ? referralState(client.referralStatus) : null;
  return (
    <li className="border-base-300 flex flex-col gap-2 border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Text className="min-w-0 flex-1 truncate font-medium">{client.name}</Text>
        {client.managed ? (
          <Badge color="module" variant="soft" size="sm">
            You manage this
          </Badge>
        ) : null}
        {client.referred ? (
          <Badge color="info" variant="soft" size="sm">
            Referred
          </Badge>
        ) : null}
        {referral ? (
          <Badge color={referral.tone} variant="soft" size="sm">
            {referral.label}
          </Badge>
        ) : null}
      </div>
      <Text className="text-sm">{accessDescription(client)}</Text>
    </li>
  );
}

export function ClientsListSurface(_props: { ctx: SurfaceContext }) {
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch, error } =
    usePartnerClients();
  const clients = data ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Clients list controls"
        status={
          <Text className="text-sm whitespace-nowrap">
            {clients.length === 1 ? '1 client' : `${String(clients.length)} clients`}
          </Text>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {isError ? (
        <PartnerLoadError
          section="clients"
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : isPending ? (
        <PartnerLoading />
      ) : clients.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            <EmptyState
              icon={<Building2 className="size-6" aria-hidden />}
              title="No clients yet"
              description="Refer a business with your link, or ask a client to add you to their account as a consultant. Accounts you refer or manage will appear here."
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            <section className="card bg-base-100 overflow-hidden">
              <header className="border-base-300 border-b px-4 py-3">
                <Heading level={2} className="text-base font-semibold">
                  Your accounts
                </Heading>
              </header>
              <ul>
                {clients.map((client) => (
                  <ClientRow key={client.orgId} client={client} />
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
