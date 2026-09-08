'use client';

// Modules — the parts of sparx this business has switched on.
//
// Each module is one switchboard tile: the SAME card the marketing site, the
// pricing switchboard, and signup render (sparx/apps/web's module-toggle-card) — a
// neutral card with the module's own color on its border, a solid module icon
// chip, an on/off Switch, and a soft module badge. One shared look for "the parts
// of sparx" everywhere a person meets them, so a module toggled on here reads as
// the very same object they switched on the pricing page.
//
// A module is a switch, not a plan tier. Turning one on makes it appear
// everywhere at once; turning it off makes it stop entirely — the switch is the
// control, and the turn-off runs behind a confirm that says plainly what stops.
// Some modules come free with another (Invoicing and Stock ride along with the
// Online store or Wholesale): their switch is locked on, the badge reads
// "Included" in place of a price, and the line beneath names the provider.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  SearchInput,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Layers } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useViewer } from '../../lib/api/shell-data';
import { RefreshButton } from '../../components/refresh-button';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  MODULE_META,
  MODULE_META_BY_SLUG,
  moduleErrorMessage,
  useBilling,
  useModules,
  useToggleModule,
  type BillingState,
  type ModuleMeta,
  type ModuleRow,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-6xl flex-col gap-3 @lg:gap-4';

/** True while the account is inside its no-charge trial window. */
function inTrial(billing: BillingState | undefined): boolean {
  if (!billing?.trialEndsAt) return false;
  return new Date(billing.trialEndsAt).getTime() > Date.now();
}

function trialDate(billing: BillingState | undefined): string {
  return billing?.trialEndsAt
    ? new Date(billing.trialEndsAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
}

function names(slugs: string[]): string {
  return slugs.map((slug) => MODULE_META_BY_SLUG.get(slug)?.name ?? slug).join(' and ');
}

function ModuleCard({
  meta,
  row,
  canManage,
  onTurnOn,
  onTurnOff,
  busy,
}: {
  meta: ModuleMeta;
  row: ModuleRow;
  canManage: boolean;
  onTurnOn: (meta: ModuleMeta, row: ModuleRow) => void;
  onTurnOff: (meta: ModuleMeta, row: ModuleRow) => void;
  busy: boolean;
}) {
  const isBundled = row.source === 'bundled';
  const isOn = row.enabled && !isBundled;
  const blockers = row.requiredBy;
  const Icon = meta.icon;

  // A module that comes free with another, or one that something else is built
  // on, cannot be switched here — the switch shows the true state but is locked.
  // Everyone who is not an owner/admin sees the switches read-only too (the pane
  // carries a single explanatory alert for that, so the card stays uncluttered).
  const blockedFromOff = isOn && blockers.length > 0;
  const locked = isBundled || blockedFromOff || !canManage;
  const checked = isBundled || isOn;

  // The module's own hue, as the registered silica color and its bg/border
  // utility classes — the SAME switchboard tile the marketing site, pricing, and
  // signup render: a neutral card with a module-colored border, a solid module
  // icon chip, and a soft module badge. (`hue` must be one of the module colors
  // registered with the plugin in globals.css — an unregistered one emits NO class
  // at all and the tile silently renders grey, which is how Finance and Your team
  // looked untyped for a while.)
  const hue = meta.hue;

  // The badge is the price, exactly as the pricing switchboard shows it —
  // "$49/mo" for a paid module, "Included" while it rides free with its provider,
  // "Free" for a genuinely no-cost module (price 0, e.g. Social posts).
  const badgeText = isBundled ? 'Included' : meta.price === 0 ? 'Free' : `$${meta.price}/mo`;

  // Shown only when a card needs a word the badge can't carry — the same
  // "Included with …" / "Required by …" lines the marketing tile uses, but kept
  // at readable body ink, never its muted caption.
  const reason = isBundled
    ? `Included with ${names(row.includedBy)}`
    : blockedFromOff
      ? `Required by ${names(blockers)}`
      : null;

  return (
    <Card className={`h-full gap-4 border border-module-${hue}`}>
      <CardBody className="gap-4">
        <div className="flex items-start justify-between">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-lg bg-module-${hue}`}
          >
            <Icon size={20} className="text-white" strokeWidth={2} aria-hidden />
          </span>
          <Switch
            color={`module-${hue}`}
            checked={checked}
            disabled={locked || busy}
            aria-label={checked ? `Turn off ${meta.name}` : `Turn on ${meta.name}`}
            onCheckedChange={(next) => {
              if (next) onTurnOn(meta, row);
              else onTurnOff(meta, row);
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">{meta.name}</CardTitle>
          <Text>{meta.blurb}</Text>
          {reason ? <Text className="text-sm">{reason}</Text> : null}
        </div>

        <Badge color={`module-${hue}`} variant="soft" className="w-fit">
          {badgeText}
        </Badge>
      </CardBody>
    </Card>
  );
}

export function ModulesSurface({ ctx: _ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: rows, isPending, isError, isFetching, dataUpdatedAt, refetch } = useModules();
  const { data: billing } = useBilling();
  const { data: viewer } = useViewer();
  const toggle = useToggleModule();
  const [search, setSearch] = useState('');
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const canManage = viewer?.role === 'owner' || viewer?.role === 'admin';

  const bySlug = useMemo(() => {
    const map = new Map<string, ModuleRow>();
    for (const row of rows ?? []) map.set(row.slug, row);
    return map;
  }, [rows]);

  // Filtered against the fixed catalogue, not the server: the list is a dozen
  // rows already loaded, and matching the blurb too means "the thing that sends
  // newsletters" finds Email without knowing it is called Email.
  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const withRows = MODULE_META.map((meta) => ({ meta, row: bySlug.get(meta.slug) })).filter(
      (entry): entry is { meta: ModuleMeta; row: ModuleRow } => Boolean(entry.row)
    );
    if (!needle) return withRows;
    return withRows.filter(
      ({ meta }) =>
        meta.name.toLowerCase().includes(needle) || meta.blurb.toLowerCase().includes(needle)
    );
  }, [bySlug, needle]);

  const runToggle = (slug: string, enabled: boolean, onName: string, offVerb: string) => {
    setPendingSlug(slug);
    toggle.mutate(
      { slug, enabled },
      {
        onSuccess: () => {
          setPendingSlug(null);
          toast.add({
            title: enabled ? `${onName} is on` : `${onName} is off`,
            description: enabled
              ? 'It is now available across sparx.'
              : `${onName} ${offVerb} and is hidden until you turn it back on.`,
            type: 'success',
          });
        },
        onError: (error) => {
          setPendingSlug(null);
          toast.add({
            title: enabled ? `Could not turn on ${onName}` : `Could not turn off ${onName}`,
            description: moduleErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onTurnOn = async (meta: ModuleMeta, _row: ModuleRow) => {
    const missingReqs = meta.requires.filter((slug) => !bySlug.get(slug)?.enabled);
    const trial = inTrial(billing);
    const description = [
      `${meta.name} appears in your sidebar straight away and your whole team can start using it.`,
      missingReqs.length
        ? `It also turns on ${names(missingReqs)}, which ${meta.name} is built on.`
        : '',
      meta.price === 0
        ? 'It is free — nothing is added to your bill.'
        : trial
          ? `You are in your free trial until ${trialDate(billing)}, so nothing is charged for it yet.`
          : 'It is a paid feature, added to your monthly subscription.',
      'You can turn it off again whenever you like.',
    ]
      .filter(Boolean)
      .join(' ');

    const ok = await confirm({
      title: `Turn on ${meta.name}?`,
      description,
      confirmLabel: `Turn on ${meta.name}`,
      cancelLabel: 'Not now',
    });
    if (!ok) return;
    runToggle(meta.slug, true, meta.name, 'is now off');
  };

  const onTurnOff = async (meta: ModuleMeta, _row: ModuleRow) => {
    const ok = await confirm({
      title: `Turn off ${meta.name}?`,
      description: `${meta.name} stops working straight away — it leaves your sidebar and its features switch off across sparx. Nothing you have already created is deleted; it is just hidden until you turn ${meta.name} back on, and you stop being billed for it.`,
      confirmLabel: `Turn off ${meta.name}`,
      cancelLabel: 'Keep it on',
      color: 'danger',
    });
    if (!ok) return;
    runToggle(meta.slug, false, meta.name, 'has stopped');
  };

  if (isError) {
    return (
      <PaneLoadError
        icon={<Layers className="size-6" aria-hidden />}
        title="Could not load your modules"
        description="This is a problem reaching the server. Whatever you have switched on is unaffected and still working."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const trial = inTrial(billing);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Module list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search modules"
              placeholder="Search modules…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="ml-auto hidden shrink-0 text-sm whitespace-nowrap @xl:block">
            {needle ? `${String(visible.length)} of ${String(MODULE_META.length)}` : ''}
          </p>
        }
        refresh={
          <RefreshButton
            className={needle ? undefined : 'ml-auto'}
            isFetching={isFetching}
            updatedAt={rows ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>
            These are the parts of sparx you can switch on. Turn one on and it appears in your
            sidebar; turn it off and it stops entirely — nothing you have made is lost, it is only
            hidden until you turn it back on.
          </Text>

          {trial ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>You are in your free trial</AlertTitle>
                <AlertDescription>
                  Everything you switch on is free to try until {trialDate(billing)}. After that,
                  only what you have left on is billed.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {viewer && !canManage ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>You can see what is on, but not change it</AlertTitle>
                <AlertDescription>
                  Only an owner or an admin can turn modules on or off. Ask one of them if you need
                  something switched on.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {isPending ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Layers className="size-6" aria-hidden />}
              title="No modules match that"
              description="Try part of the name, or clear the search to see everything sparx can do."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
              {visible.map(({ meta, row }) => (
                <ModuleCard
                  key={meta.slug}
                  meta={meta}
                  row={row}
                  canManage={canManage}
                  busy={pendingSlug === meta.slug}
                  onTurnOn={(m, r) => {
                    void onTurnOn(m, r);
                  }}
                  onTurnOff={(m, r) => {
                    void onTurnOff(m, r);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
