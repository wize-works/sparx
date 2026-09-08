'use client';

// MOVE IN — pick the platform you are leaving.
//
// The first screen of a migration, and the one that decides whether the tenant
// keeps going. It answers three questions in the order a person actually asks
// them: is my platform here, what will actually come across, and what do I have
// to go and get.
//
// The file names and menu paths are shown VERBATIM from the vendor's own
// vocabulary — `products_export.csv`, "Products → Export → All products" —
// because the person reading this has that platform open in the next tab. A
// generic "upload your product export" makes them go and hunt; naming the file
// makes it a click.
//
// A locked entity is shown, not hidden. "Your posts come across when the website
// builder is switched on" is useful; a quietly shorter list looks like we cannot
// do it.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Text,
} from '@wizeworks/silicaui-react';
import { ArrowRight, FileDown, History, Lock, Plug } from 'lucide-react';
import { ModuleScope } from '../../components/module-scope';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { KIND_LABEL, sentenceList, useMigrationVendors, vendorHue, type VendorCard } from './data';

function VendorTile({ vendor, onPick }: { vendor: VendorCard; onPick: () => void }) {
  const locked = vendor.entities.filter((entity) => !entity.available);
  const available = vendor.entities.filter((entity) => entity.available);
  // Things this vendor genuinely cannot export — reachable only by connecting.
  const connectorOnly = available.filter((entity) => entity.connectorOnly === true);

  return (
    <ModuleScope module={vendorHue(vendor.kind)}>
      <div className="border-base-300 bg-base-100 flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Heading level={3} className="text-lg">
              {vendor.name}
            </Heading>
            <Text className="text-sm">
              {vendor.sources.length} file{vendor.sources.length === 1 ? '' : 's'} to fetch
              {vendor.hasConnector ? ', or connect it live' : ''}
            </Text>
          </div>
          {vendor.hasConnector ? (
            <Badge color="module" variant="soft" size="sm">
              Live connection
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {available.map((entity) => (
            // A live-connection-only entity wears the module hue as an OUTLINE.
            // Same color, because it is the same data landing in the same place;
            // different weight, because it is the one thing on this card you
            // cannot get by downloading a file, and the difference has to be
            // visible before the tenant has committed to a route.
            <Badge
              key={entity.entity}
              color="module"
              variant={entity.connectorOnly === true ? 'outline' : 'soft'}
              size="sm"
            >
              {entity.connectorOnly === true ? <Plug className="size-3" aria-hidden /> : null}
              {entity.label}
            </Badge>
          ))}
          {locked.map((entity) => (
            <Badge key={entity.entity} color="neutral" variant="outline" size="sm">
              <Lock className="size-3" aria-hidden />
              {entity.label}
            </Badge>
          ))}
        </div>

        {connectorOnly.length > 0 ? (
          <Text className="text-sm">
            {sentenceList(connectorOnly.map((entity) => entity.label))} only come across through the
            live connection — {vendor.name} has no export that produces{' '}
            {connectorOnly.length === 1 ? 'it' : 'them'}.
          </Text>
        ) : null}

        {locked.length > 0 ? (
          <Text className="text-sm">
            {sentenceList(locked.map((entity) => entity.label))} will come across once you switch on{' '}
            {sentenceList([...new Set(locked.map((entity) => entity.module ?? 'that module'))])}.
          </Text>
        ) : null}

        <Button color="module" size="sm" onClick={onPick} className="mt-auto self-start">
          Move from {vendor.name}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </ModuleScope>
  );
}

export function MigrationStartSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useMigrationVendors();

  const groups = (['commerce', 'site', 'cms', 'crm', 'email'] as const)
    .map((kind) => ({
      kind,
      label: KIND_LABEL[kind],
      vendors: (data?.vendors ?? []).filter((vendor) => vendor.kind === kind),
    }))
    .filter((group) => group.vendors.length > 0);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Migration controls"
        controls={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ctx.open('platform.migrate.history', {}, { target: 'tab' })}
            >
              <History className="size-4" aria-hidden />
              Past moves
            </Button>
          </>
        }
        refresh={
          <div className="ml-auto flex items-center gap-2">
            <RefreshButton
              onRefresh={() => void refetch()}
              isFetching={isFetching}
              updatedAt={dataUpdatedAt}
            />
          </div>
        }
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <Heading level={2}>Bring your business over</Heading>
          <Text>
            Export the file your current platform already makes, drop it in, and see exactly what
            will happen before anything is saved. Nothing is uploaded until you have looked at it.
          </Text>
        </div>

        {isError ? (
          <Alert color="danger" variant="soft">
            <AlertContent>
              <AlertTitle>We could not load the list of platforms</AlertTitle>
              <AlertDescription>Try again in a moment.</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {isPending ? <Text>Loading…</Text> : null}

        {groups.map((group) => (
          <section key={group.kind} className="flex flex-col gap-3">
            <Heading level={3} className="text-base">
              {group.label}
            </Heading>
            <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {group.vendors.map((vendor) => (
                <VendorTile
                  key={vendor.slug}
                  vendor={vendor}
                  onPick={() =>
                    ctx.open('platform.migrate.run', { vendor: vendor.slug }, { target: 'tab' })
                  }
                />
              ))}
            </div>
          </section>
        ))}

        <div className="border-base-300 flex flex-col gap-2 rounded-xl border border-dashed p-4">
          <Heading level={3} className="text-base">
            Somewhere else, or your own spreadsheet
          </Heading>
          <Text className="text-sm">
            Drop any CSV in and tell us what each column means. It works the same way from there.
          </Text>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => ctx.open('platform.migrate.run', {}, { target: 'tab' })}
          >
            <FileDown className="size-4" aria-hidden />
            Start with a file
          </Button>
        </div>
      </div>
    </div>
  );
}
