'use client';

// WAREHOUSE MODE — the whole app, on a phone, for someone wearing gloves.
//
// ── Why this is one surface and not a responsive variant of six ───────────
//
// On a desk the workbench is panes side by side. On a phone in a warehouse there
// is one screen, one job at a time, and a person who is walking. Trying to make
// the desk surfaces collapse into that produces six screens that are each a bad
// phone screen; making the phone its OWN surface produces one that is right, and
// costs the desk nothing.
//
// So this is a single column with four jobs in it — look something up, put it
// away, count a shelf, receive a delivery — switched by four targets big enough
// to hit without looking. Every control is at least 44px, which is not a style
// preference: it is the smallest thing a gloved thumb reliably hits.
//
// ── Everything is a scan first and a form second ──────────────────────────
//
// The field has focus on arrival and takes it back after every action. The
// answer is large, colored, and one sentence, because the person reading it is
// at arm's length holding something heavy.
//
// ── It is honest about being offline ──────────────────────────────────────
//
// A warehouse has metal racking and no signal at the back of it. The queue
// counter is always visible when it is non-zero, and it says "keep going" rather
// than "error", because the correct behaviour when the wifi drops is to keep
// scanning.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  Text,
} from '@wizeworks/silicaui-react';
import {
  ArrowDownToLine,
  ClipboardCheck,
  CloudUpload,
  PackageOpen,
  PackageSearch,
  Route,
  Search,
  Truck,
  WifiOff,
} from 'lucide-react';
import { PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, useStockLocations } from './data';
import { useBins } from './bins-data';
import { ScanInput, playScanFeedback } from './scan-input';
import { pickListState, usePickLists } from './picking-data';
import {
  resolveScan,
  scanKindLabel,
  useScanPutAway,
  useScanQueue,
  type ScanActionResult,
  type ScanMatch,
  type ScanResolution,
} from './scan-data';

type Job = 'lookup' | 'pick' | 'pack' | 'put_away' | 'count' | 'receive';

// Six jobs, in the order a shift actually runs: find out what something is,
// fetch orders, box them, put the delivery away, count a shelf, take a delivery
// in. Two columns on a phone, three given room — never one long list, because a
// job switcher you have to scroll is a job switcher nobody uses.
const JOBS: { value: Job; label: string; hint: string; icon: typeof Search }[] = [
  { value: 'lookup', label: 'What is this', hint: 'Scan anything', icon: Search },
  { value: 'pick', label: 'Pick', hint: 'Open a walk', icon: Route },
  { value: 'pack', label: 'Pack', hint: 'Open an order', icon: PackageOpen },
  { value: 'put_away', label: 'Put away', hint: 'Item, then shelf', icon: ArrowDownToLine },
  { value: 'count', label: 'Count', hint: 'Open a count', icon: ClipboardCheck },
  { value: 'receive', label: 'Receive', hint: 'Open a delivery', icon: Truck },
];

/** 44px minimum, everywhere. The smallest target a gloved thumb reliably hits. */
const TOUCH = 'min-h-11';

export function WarehouseModeSurface({ ctx }: { ctx: SurfaceContext }) {
  const [job, setJob] = useState<Job>('lookup');
  const [locationId, setLocationId] = useState('');

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);
  const queue = useScanQueue();

  return (
    <div className={PANE_SHELL}>
      {/* Job switcher. Filled shapes, not tabs with an underline — from arm's
          length a 2px rule is invisible and a filled block is not. */}
      <div className="grid shrink-0 grid-cols-2 gap-2 @lg:grid-cols-3 @3xl:grid-cols-6">
        {JOBS.map((entry) => {
          const Icon = entry.icon;
          const active = job === entry.value;
          return (
            <Button
              key={entry.value}
              color="module-inventory"
              variant={active ? 'solid' : 'outline'}
              size="lg"
              className={`${TOUCH} flex-col gap-0.5`}
              onClick={() => {
                setJob(entry.value);
              }}
            >
              <Icon className="size-5" aria-hidden />
              <span>{entry.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Where you are. Persistent, because "which building" is the single most
          consequential thing a scan can be wrong about, and somebody who walked
          to a different site will not think to check. */}
      <div className="flex shrink-0 items-center gap-2">
        <NativeSelect
          size="lg"
          className={TOUCH}
          aria-label="Which location you are in"
          value={locationId}
          onChange={(event) => {
            setLocationId(event.target.value);
          }}
        >
          <option value="">Choose where you are</option>
          {activeLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </NativeSelect>
        {queue.size > 0 ? (
          <Button
            variant="outline"
            color="warning"
            size="lg"
            className={TOUCH}
            disabled={queue.replaying}
            onClick={() => {
              void queue.replay();
            }}
          >
            {queue.replaying ? (
              <CloudUpload className="size-5" aria-hidden />
            ) : (
              <WifiOff className="size-5" aria-hidden />
            )}
            {queue.size}
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {job === 'lookup' ? (
          <LookupJob warehouseId={locationId || undefined} ctx={ctx} />
        ) : job === 'put_away' ? (
          <PutAwayJob warehouseId={locationId} />
        ) : job === 'pick' ? (
          <MyWalksJob ctx={ctx} warehouseId={locationId} />
        ) : (
          <OpenSomethingJob job={job} ctx={ctx} warehouseId={locationId} />
        )}
      </div>
    </div>
  );
}

/* ── Look it up (3.7) ───────────────────────────────────────────────────── */

/**
 * Scan anything and be told what it is.
 *
 * The most-used screen in any warehouse system and usually the worst one, because
 * it is built as a search box that happens to accept barcodes. It is the other
 * way round here: the answer to "what is this" is a product, a shelf, an order or
 * a batch, and the resolver returns whichever it is — including several, when the
 * value honestly matches more than one thing, rather than guessing.
 */
function LookupJob({ warehouseId, ctx }: { warehouseId?: string; ctx: SurfaceContext }) {
  const [resolution, setResolution] = useState<ScanResolution | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useScanQueue();

  const onScan = async (value: string) => {
    setBusy(true);
    try {
      const found = await resolveScan(value, {
        ...(warehouseId ? { warehouseId } : {}),
      });
      setResolution(found);
      playScanFeedback(found.matches.length > 0 ? 'applied' : 'not_found');
    } catch {
      setResolution({ scanned: value, matches: [] });
      playScanFeedback('rejected');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="p-4">
          <ScanInput
            onScan={onScan}
            placeholder="Scan anything"
            busy={busy}
            queued={queue.size}
            large
          />
        </div>
      </Card>

      {resolution === null ? null : resolution.matches.length === 0 ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>Nothing matches {resolution.scanned}</AlertTitle>
            <AlertDescription>
              If this is something you stock, add the code to the item and it will scan from then
              on.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <div className="flex flex-col gap-2">
          {resolution.matches.length > 1 ? (
            <Text className="text-sm">
              That code matches {plural(resolution.matches.length, 'thing', 'things')}. Pick the one
              you are holding.
            </Text>
          ) : null}
          {resolution.matches.map((match) => (
            <MatchCard key={`${match.kind}-${match.id}`} match={match} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, ctx }: { match: ScanMatch; ctx: SurfaceContext }) {
  const open = () => {
    switch (match.kind) {
      case 'variant':
        if (match.productId) ctx.open('commerce.product.detail', { id: match.productId });
        break;
      case 'bin':
        ctx.open('inventory.bins.detail', { id: match.id });
        break;
      case 'purchase_order':
        ctx.open('inventory.purchase-orders.detail', { id: match.id });
        break;
      case 'goods_receipt':
        ctx.open('inventory.receiving.detail', { id: match.id });
        break;
      case 'transfer':
        ctx.open('inventory.transfers.detail', { id: match.id });
        break;
      case 'count':
        ctx.open('inventory.counts.detail', { id: match.id });
        break;
      case 'lot':
        ctx.open('inventory.lots.detail', { id: match.id });
        break;
      default:
        break;
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <span className="flex flex-wrap items-center gap-2">
          <Badge color="module-inventory" variant="soft">
            {scanKindLabel(match.kind)}
          </Badge>
          {match.via === 'equivalent' ? (
            // Worth saying out loud: the registry holds a different-looking code
            // for the same item, and knowing that saves an argument.
            <Badge color="info" variant="soft" size="sm">
              Read as {match.code}
            </Badge>
          ) : null}
        </span>

        <span className="flex flex-col">
          <span className="text-lg font-semibold">{match.title}</span>
          <span className="font-mono text-sm">{match.code}</span>
          {match.detail ? <Text className="text-sm">{match.detail}</Text> : null}
        </span>

        {/* The two numbers a person on a floor is actually asking for. */}
        {match.kind === 'variant' ? (
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex flex-col">
              <Text className="text-sm">In stock</Text>
              <span className="text-2xl font-semibold tabular-nums">{match.onHand ?? 0}</span>
            </span>
            {match.packSize && match.packSize > 1 ? (
              <Badge color="module-commerce" size="lg">
                One scan = {match.packSize}
              </Badge>
            ) : null}
          </span>
        ) : null}

        {match.kind === 'bin' ? (
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex flex-col">
              <Text className="text-sm">On this shelf</Text>
              <span className="text-2xl font-semibold tabular-nums">{match.unitCount ?? 0}</span>
            </span>
            {match.isSellable === false ? (
              <Badge color="danger" size="lg">
                Not for sale
              </Badge>
            ) : null}
          </span>
        ) : null}

        <Button color="module-inventory" size="lg" className={TOUCH} onClick={open}>
          Open it
        </Button>
      </div>
    </Card>
  );
}

/* ── Put away (3.7) ─────────────────────────────────────────────────────── */

/**
 * Scan the item, scan the shelf, done.
 *
 * The shelf is chosen FIRST and stays chosen, because putting a pallet away is
 * twenty items onto one shelf, not one item onto twenty shelves. Making the
 * shelf per-scan would double the trigger pulls for no information.
 */
function PutAwayJob({ warehouseId }: { warehouseId: string }) {
  const [toBinId, setToBinId] = useState('');
  const [result, setResult] = useState<ScanActionResult | null>(null);
  const [putAwayCount, setPutAwayCount] = useState(0);

  const bins = useBins({
    ...(warehouseId ? { warehouseId } : {}),
    take: 500,
    skip: 0,
  });
  const putAway = useScanPutAway();
  const queue = useScanQueue();

  const shelves = (bins.data?.items ?? []).filter((b) => b.isActive);

  if (!warehouseId) {
    return (
      <EmptyState
        icon={<ArrowDownToLine className="size-6" aria-hidden />}
        title="Choose where you are first"
        description="Putting something away means putting it on a shelf, and shelves belong to a location."
      />
    );
  }

  if (!bins.isLoading && shelves.length === 0) {
    return (
      <EmptyState
        icon={<ArrowDownToLine className="size-6" aria-hidden />}
        title="This location has no shelves"
        description="Turn shelves on for this location and add the ones you actually have, then stock can be recorded onto them."
      />
    );
  }

  const onScan = async (value: string) => {
    if (!toBinId) return;
    const outcome = await putAway.mutateAsync({ value, warehouseId, toBinId });
    setResult(outcome);
    playScanFeedback(outcome.outcome);
    if (outcome.outcome === 'applied') setPutAwayCount((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-col gap-3 p-4">
          <NativeSelect
            size="lg"
            className={TOUCH}
            aria-label="Which shelf you are putting things on"
            value={toBinId}
            onChange={(event) => {
              setToBinId(event.target.value);
              setPutAwayCount(0);
            }}
          >
            <option value="">Choose a shelf</option>
            {shelves.map((bin) => (
              <option key={bin.id} value={bin.id}>
                {bin.code}
                {bin.name ? ` — ${bin.name}` : ''}
              </option>
            ))}
          </NativeSelect>

          <ScanInput
            onScan={onScan}
            placeholder={toBinId ? 'Scan an item' : 'Choose a shelf first'}
            result={result}
            disabled={!toBinId}
            busy={putAway.isPending}
            queued={queue.size}
            large
          />
        </div>
      </Card>

      {putAwayCount > 0 ? (
        <Alert color="success" variant="soft">
          <AlertContent>
            <AlertTitle>{plural(putAwayCount, 'item', 'items')} put away on this shelf</AlertTitle>
            <AlertDescription>
              Keep scanning. Choose a different shelf when you move to one.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
    </div>
  );
}

/* ── Open a count or a delivery ─────────────────────────────────────────── */

/**
 * Scan the paperwork.
 *
 * Counts and deliveries are both "find the document, then work it", and on a
 * phone the way you find a document is by scanning the sheet in your hand. The
 * job then hands off to the surface that owns it rather than reimplementing it
 * small — a count worked on a phone and a count worked at a desk have to be the
 * same count.
 */
function OpenSomethingJob({
  job,
  ctx,
  warehouseId,
}: {
  job: 'count' | 'receive' | 'pack';
  ctx: SurfaceContext;
  warehouseId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useScanQueue();

  const expect =
    job === 'count'
      ? (['count'] as const)
      : job === 'pack'
        ? (['variant'] as const)
        : (['purchase_order'] as const);

  const onScan = async (value: string) => {
    setBusy(true);
    try {
      const found = await resolveScan(value, {
        expect: [...expect],
        ...(warehouseId ? { warehouseId } : {}),
      });
      const hit = found.matches[0];
      if (!hit) {
        setMessage(
          job === 'count'
            ? `No stock count has the number ${found.scanned}.`
            : job === 'pack'
              ? `Nothing in the catalogue matches ${found.scanned}.`
              : `No purchase order has the number ${found.scanned}.`
        );
        playScanFeedback('not_found');
        return;
      }
      playScanFeedback('applied');
      if (job === 'pack') {
        // The pack bench is per ORDER, and a scanned product cannot say which
        // one. So this opens the bench with nothing chosen rather than guessing —
        // and the bench asks. Scanning a walk sheet is the fast path, which is
        // what the Pick job is for.
        ctx.open('inventory.packing.bench', {});
        return;
      }
      ctx.open(job === 'count' ? 'inventory.counts.detail' : 'inventory.receiving.scan', {
        id: hit.id,
      });
    } catch {
      setMessage('Could not reach the server. Try again when the connection is back.');
      playScanFeedback('rejected');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="p-4">
          <ScanInput
            onScan={onScan}
            placeholder={
              job === 'count'
                ? 'Scan a count sheet'
                : job === 'pack'
                  ? 'Scan anything on the order'
                  : 'Scan a purchase order'
            }
            busy={busy}
            queued={queue.size}
            large
          />
        </div>
      </Card>

      {message ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>{message}</AlertTitle>
            <AlertDescription>
              You can also type the number — {job === 'count' ? 'CNT-000012' : 'PO-000045'} — and
              press Enter.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <div className="flex items-start gap-3 p-4">
          <PackageSearch className="size-5 shrink-0" aria-hidden />
          <Text className="text-sm">
            {job === 'count'
              ? 'Scan the number printed on the count sheet, or type it. The count opens with the scanner ready.'
              : job === 'pack'
                ? 'Open the pack bench and choose the order you are boxing. Every item is scanned in, and anything that does not belong is refused.'
                : 'Scan the number on the delivery paperwork, or type it. The delivery opens with the scanner ready.'}
          </Text>
        </div>
      )}
    </div>
  );
}

/* ── Pick (docs/146 Phase 4.3) ──────────────────────────────────────────── */

/**
 * The walks waiting to be worked, as big tap targets.
 *
 * Deliberately NOT a scan-first screen, unlike every other job here. A picker
 * arriving for a shift does not have a walk sheet in their hand yet — they have
 * to be given one, and the useful question is "what needs picking", not "what is
 * this piece of paper". Scanning a printed walk sheet still works: it resolves
 * through the Look-it-up job like any other document.
 *
 * Unassigned walks come first. A walk with somebody's name on it is somebody
 * else's job, and burying the free ones under it is how two people end up on one
 * trolley.
 */
function MyWalksJob({ ctx, warehouseId }: { ctx: SurfaceContext; warehouseId: string }) {
  const walks = usePickLists({
    ...(warehouseId ? { warehouseId } : {}),
    take: 25,
    skip: 0,
  });

  const open = (walks.data?.items ?? []).filter(
    (w) => w.status === 'draft' || w.status === 'assigned' || w.status === 'picking'
  );
  const ordered = [...open].sort((a, b) => {
    const mine = Number(Boolean(a.assignedTo)) - Number(Boolean(b.assignedTo));
    return mine !== 0 ? mine : a.number.localeCompare(b.number);
  });

  if (walks.isLoading) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading walks…
      </p>
    );
  }

  if (ordered.length === 0) {
    return (
      <EmptyState
        icon={<Route className="size-6" aria-hidden />}
        title="Nothing to pick right now"
        description="When somebody in the office turns orders into a walk, it shows up here and you can start straight away."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {ordered.map((walk) => {
        const state = pickListState(walk.status);
        return (
          <Card key={walk.id}>
            <div className="flex flex-col gap-3 p-4">
              <span className="flex flex-wrap items-center gap-2">
                <Badge color={state.tone} variant="soft">
                  {state.label}
                </Badge>
                <span className="font-mono text-sm">{walk.number}</span>
                {walk.assignedTo ? (
                  <Badge color="info" variant="outline" size="sm">
                    {walk.assignedTo}
                  </Badge>
                ) : null}
              </span>

              <span className="flex flex-col">
                <span className="text-lg font-semibold">
                  {plural(walk.lineCount, 'thing', 'things')} to fetch
                </span>
                <Text className="text-sm">
                  {walk.warehouseName} · {plural(walk.orderCount, 'order', 'orders')}
                  {walk.unitsPicked > 0
                    ? ` · ${String(walk.unitsPicked)} of ${String(walk.unitsRequested)} units done`
                    : ''}
                </Text>
              </span>

              <Button
                color="module-inventory"
                size="lg"
                className={TOUCH}
                onClick={() => {
                  ctx.open('inventory.picking.guided', { id: walk.id });
                }}
              >
                {walk.status === 'picking' ? 'Carry on' : 'Start this walk'}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
