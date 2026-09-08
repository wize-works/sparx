'use client';

// HOW THE FLOOR IS RUNNING — pick and pack throughput.
//
// ── Four numbers, and the fourth is the one that pays ─────────────────────
//
// Units per hour is the number every warehouse system leads with, and on its own
// it is the least useful thing here: it tells a manager how fast people are
// going and nothing about whether the going is worth anything. The number that
// pays is the SHELF table at the bottom — a shelf that keeps coming up empty is a
// put-away problem, a signage problem or a theft problem, and it will never show
// up in a per-person view.
//
// So the layout puts people first because that is what people look for, and then
// spends the rest of the screen on where the stock numbers are actually wrong.
//
// ── "Scan-verified", not "accuracy" ───────────────────────────────────────
//
// We can measure how many lines were confirmed by a trigger pull rather than a
// tap. We cannot measure what was picked wrong and never noticed, and a metric
// called "accuracy" would claim we can. Naming it honestly costs a nicer-sounding
// dashboard and buys a number nobody has to caveat.

import { useState } from 'react';
import { Badge, Card, EmptyState, NativeSelect, Table, Text } from '@wizeworks/silicaui-react';
import { BarChart3, Gauge, ScanLine, TriangleAlert } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, useStockLocations } from './data';
import { shortReasonLabel, usePickThroughput } from './picking-data';

const WINDOWS: { value: string; label: string; days: number }[] = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
];

const DAY_MS = 86_400_000;

/** The color a rate wears. A short-pick rate is bad when high; a scan-verified
 *  rate is bad when low — so they cannot share one helper, and pretending they
 *  can is how a dashboard ends up green on the wrong thing. */
function shortTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 10) return 'danger';
  if (rate >= 3) return 'warning';
  return 'success';
}

function verifiedTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 90) return 'success';
  if (rate >= 50) return 'warning';
  return 'danger';
}

export function PickThroughputSurface({ ctx: _ctx }: { ctx: SurfaceContext }) {
  const [windowKey, setWindowKey] = useState('30');
  const [locationId, setLocationId] = useState('');

  const days = WINDOWS.find((w) => w.value === windowKey)?.days ?? 30;
  const from = new Date(Date.now() - days * DAY_MS).toISOString();

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = usePickThroughput({
    from,
    ...(locationId ? { warehouseId: locationId } : {}),
  });

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<BarChart3 className="size-6" aria-hidden />}
          title="Could not load the numbers"
          description="This is a problem reaching the server. Nothing on the floor is affected."
        />
      );
    }
    if (isLoading || !data) {
      return (
        <p className="p-4 text-sm" role="status">
          Working out the numbers…
        </p>
      );
    }
    if (data.totals.linesPicked === 0 && data.totals.linesShort === 0) {
      return (
        <EmptyState
          icon={<Gauge className="size-6" aria-hidden />}
          title="Nothing has been picked in this period"
          description="Generate a walk from an order and work it, and this fills in — how fast, how accurately, and which shelves keep coming up empty."
        />
      );
    }

    const t = data.totals;

    return (
      <div className="flex flex-col gap-3">
        {/* The headline four. Each carries its own color, because a short-pick
            rate of 14% and one of 0.4% are not the same news. */}
        <div className="grid gap-3 @lg:grid-cols-4">
          <Metric
            label="Units an hour"
            value={t.unitsPerHour.toFixed(1)}
            hint={`${plural(t.unitsPicked, 'unit', 'units')} over ${plural(Math.round(t.activeMinutes / 60), 'hour', 'hours')} of picking`}
            color="module-inventory"
          />
          <Metric
            label="Walks finished"
            value={String(t.walksCompleted)}
            hint={`${plural(t.boxesPacked, 'box', 'boxes')} packed`}
            color="info"
          />
          <Metric
            label="Confirmed by scan"
            value={`${t.scanVerifiedRate.toFixed(0)}%`}
            hint="The rest were tapped, which we cannot verify"
            color={verifiedTone(t.scanVerifiedRate)}
          />
          <Metric
            label="Came up short"
            value={`${t.shortLineRate.toFixed(1)}%`}
            hint={`${plural(t.unitsShort, 'unit', 'units')} not where we said`}
            color={shortTone(t.shortLineRate)}
          />
        </div>

        {/* People. */}
        <Card>
          <div className="border-base-300 border-b p-3">
            <span className="font-medium">By picker</span>
          </div>
          {data.pickers.length === 0 ? (
            <p className="p-4 text-sm">Nobody has picked anything in this period.</p>
          ) : (
            <Table size="sm">
              <thead>
                <tr>
                  <th>Picker</th>
                  <th className="text-right whitespace-nowrap">Units/hr</th>
                  <th className="hidden text-right whitespace-nowrap @lg:table-cell">Lines</th>
                  <th className="hidden text-right whitespace-nowrap @xl:table-cell">Scanned</th>
                  <th className="text-right whitespace-nowrap">Short</th>
                </tr>
              </thead>
              <tbody>
                {data.pickers.map((picker) => (
                  <tr key={picker.pickedBy ?? 'unattributed'}>
                    <td className="w-full max-w-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {picker.pickedBy ?? 'Not signed in'}
                        </span>
                        <span className="truncate text-sm @lg:hidden">
                          {plural(picker.linesPicked, 'line', 'lines')} ·{' '}
                          {plural(picker.unitsPicked, 'unit', 'units')}
                        </span>
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {picker.unitsPerHour.toFixed(1)}
                    </td>
                    <td className="hidden text-right whitespace-nowrap tabular-nums @lg:table-cell">
                      {picker.linesPicked}
                    </td>
                    <td className="hidden text-right whitespace-nowrap @xl:table-cell">
                      <Badge color={verifiedTone(picker.scanVerifiedRate)} variant="soft" size="sm">
                        <ScanLine className="size-3" aria-hidden />
                        {picker.scanVerifiedRate.toFixed(0)}%
                      </Badge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Badge color={shortTone(picker.shortLineRate)} variant="soft" size="sm">
                        {picker.shortLineRate.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Where the numbers are wrong. The table that pays for the phase. */}
        {data.bins.length > 0 ? (
          <Card>
            <div className="border-base-300 flex items-center gap-2 border-b p-3">
              <TriangleAlert className="size-4" aria-hidden />
              <span className="font-medium">Shelves that keep coming up empty</span>
            </div>
            <Table size="sm">
              <thead>
                <tr>
                  <th>Shelf</th>
                  <th className="hidden @lg:table-cell">Usual reason</th>
                  <th className="text-right whitespace-nowrap">Short</th>
                  <th className="text-right whitespace-nowrap">Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.bins.map((bin) => (
                  <tr key={bin.binId ?? 'no-shelf'}>
                    <td className="w-full max-w-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono font-medium">
                          {bin.binCode ?? 'No shelf recorded'}
                        </span>
                        {bin.zone ? (
                          <span className="truncate text-sm">Zone {bin.zone}</span>
                        ) : null}
                        <span className="truncate text-sm @lg:hidden">
                          {shortReasonLabel(bin.topReason)}
                        </span>
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap @lg:table-cell">
                      {shortReasonLabel(bin.topReason)}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {bin.linesShort} of {bin.linesTotal}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Badge color={shortTone(bin.shortLineRate)} variant="soft" size="sm">
                        {bin.shortLineRate.toFixed(0)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        {/* Why. Small, because it is a summary of the table above — but it is the
            sentence a manager repeats in a meeting. */}
        {data.shortReasons.length > 0 ? (
          <Card>
            <div className="border-base-300 border-b p-3">
              <span className="font-medium">Why things were not there</span>
            </div>
            <Table size="sm">
              <tbody>
                {data.shortReasons.map((reason) => (
                  <tr key={reason.reason}>
                    <td className="w-full max-w-0">
                      <span className="truncate">{shortReasonLabel(reason.reason)}</span>
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {plural(reason.lines, 'line', 'lines')}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {plural(reason.units, 'unit', 'units')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        {/* The bench. */}
        {data.packers.length > 0 ? (
          <Card>
            <div className="border-base-300 border-b p-3">
              <span className="font-medium">By packer</span>
            </div>
            <Table size="sm">
              <thead>
                <tr>
                  <th>Packer</th>
                  <th className="text-right whitespace-nowrap">Boxes</th>
                  <th className="text-right whitespace-nowrap">Units</th>
                  <th className="text-right whitespace-nowrap">Scanned</th>
                </tr>
              </thead>
              <tbody>
                {data.packers.map((packer) => (
                  <tr key={packer.packedBy ?? 'unattributed'}>
                    <td className="w-full max-w-0">
                      <span className="truncate font-medium">
                        {packer.packedBy ?? 'Not signed in'}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {packer.boxesPacked}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {packer.unitsPacked}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Badge color={verifiedTone(packer.scanVerifiedRate)} variant="soft" size="sm">
                        {packer.scanVerifiedRate.toFixed(0)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Throughput controls"
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Period"
              value={windowKey}
              onChange={(event) => {
                setWindowKey(event.target.value);
              }}
            >
              {WINDOWS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Location"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
              }}
            >
              <option value="">Every location</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
            className="ml-auto"
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-1 p-4">
        <Text className="text-sm">{label}</Text>
        <span className="text-3xl leading-none font-bold tabular-nums">{value}</span>
        <Badge color={color} variant="soft" size="sm" className="self-start">
          {hint}
        </Badge>
      </div>
    </Card>
  );
}
