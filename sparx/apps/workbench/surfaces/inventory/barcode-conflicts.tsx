'use client';

// SHARED BARCODES — the codes two items both claim.
//
// A barcode has to point at exactly one thing or a scan is a coin toss, so the
// registry refuses the second claimant. This is where those refusals surface,
// and it is the only screen in the inventory module whose job is to be EMPTY.
//
// ── Two answers, and only two ─────────────────────────────────────────────
//
// Either this item owns the code, or it does not. There is no "keep both",
// because keeping both is the problem. Each row therefore offers exactly the two
// buttons that end the conflict, and names the other claimant so the choice can
// actually be made — "these two items claim 4006381333931" is answerable;
// "this barcode is a duplicate" is not.

import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Text,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { ArrowLeftRight, CircleCheck, Eraser } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import { useBarcodeConflicts, useResolveBarcodeConflict } from './scan-data';

export function BarcodeConflictsSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useBarcodeConflicts();
  const resolve = useResolveBarcodeConflict();
  const confirm = useConfirm();

  const rows = data ?? [];

  const takeIt = async (row: (typeof rows)[number]) => {
    const ok = await confirm({
      title: `Give ${row.value} to ${row.productTitle}?`,
      description: row.heldByProductTitle
        ? `Scanning ${row.value} will start bringing up ${row.productTitle} (${row.sku}) instead of ${row.heldByProductTitle} (${row.heldBySku ?? ''}). The code is removed from that item entirely.`
        : `Scanning ${row.value} will bring up ${row.productTitle} (${row.sku}).`,
      confirmLabel: 'Give it to this item',
      color: 'danger',
    });
    if (!ok) return;
    resolve.mutate({ variantId: row.variantId, action: 'take' });
  };

  const clearIt = async (row: (typeof rows)[number]) => {
    const ok = await confirm({
      title: `Remove ${row.value} from ${row.productTitle}?`,
      description: `${row.productTitle} (${row.sku}) will no longer claim this code. Nothing changes for the item that has it.`,
      confirmLabel: 'Remove it',
      color: 'danger',
    });
    if (!ok) return;
    resolve.mutate({ variantId: row.variantId, action: 'clear' });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<ArrowLeftRight className="size-6" aria-hidden />}
          title="Could not check for shared barcodes"
          description="This is a problem reaching the server. Your codes are unaffected."
        />
      );
    }
    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Checking for shared barcodes…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<CircleCheck className="size-6" aria-hidden />}
          title="Every barcode points at one thing"
          description="Nothing to sort out. Scanning any registered code will bring up exactly one item."
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          // Plain, not tinted. Every row on this screen is a conflict, so a wall
          // of red backgrounds would distinguish nothing — the color goes on
          // the badge and the actions, which is where it carries meaning.
          <Card key={row.variantId}>
            <CardBody className="flex flex-col gap-3">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-lg font-semibold">{row.value}</span>
                <Badge color="danger" variant="soft" size="sm">
                  Claimed twice
                </Badge>
              </span>

              <div className="grid gap-2 @lg:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Text className="text-sm">Not scannable — this item is the one waiting</Text>
                  <span className="font-medium">{row.productTitle}</span>
                  <span className="font-mono text-sm">{row.sku}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Text className="text-sm">Scanning it currently brings up</Text>
                  <span className="font-medium">{row.heldByProductTitle ?? 'Unknown item'}</span>
                  <span className="font-mono text-sm">{row.heldBySku ?? ''}</span>
                </div>
              </div>

              <span className="flex flex-wrap gap-2">
                <Tooltip content="The code belongs to this item — move it here">
                  <Button
                    color="module-inventory"
                    size="sm"
                    disabled={resolve.isPending}
                    onClick={() => {
                      void takeIt(row);
                    }}
                  >
                    <ArrowLeftRight className="size-4" aria-hidden />
                    {row.productTitle} owns it
                  </Button>
                </Tooltip>
                <Tooltip content="This item never had this code — drop the claim">
                  <Button
                    variant="outline"
                    color="neutral"
                    size="sm"
                    disabled={resolve.isPending}
                    onClick={() => {
                      void clearIt(row);
                    }}
                  >
                    <Eraser className="size-4" aria-hidden />
                    Remove it from this item
                  </Button>
                </Tooltip>
                <Button
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  onClick={() => {
                    ctx.open('commerce.product.detail', { id: row.productId }, { target: 'tab' });
                  }}
                >
                  Open the item
                </Button>
              </span>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Shared barcode controls"
        status={
          <Text className="text-sm">
            {rows.length > 0
              ? `${plural(rows.length, 'code', 'codes')} claimed by more than one item`
              : 'Nothing shared'}
          </Text>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={dataUpdatedAt}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
