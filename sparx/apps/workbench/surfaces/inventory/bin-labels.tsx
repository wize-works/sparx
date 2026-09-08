'use client';

// SHELF LABELS — a printable sheet of codes and QR squares.
//
// ── Why QR and not a barcode ─────────────────────────────────────────────
//
// A shelf label is read off a rack, at an angle, in bad light, usually by a
// phone camera rather than a laser gun. A 2D code survives all four; a 1D barcode
// needs to be square-on and well-lit. Product labels are the other way round and
// will get Code 128 when scanning lands.
//
// ── Rendered in the browser, printed by the browser ──────────────────────
//
// No PDF service and no server round trip: the sheet IS the page, and `print`
// takes it from there. That means what someone previews is exactly what comes out
// of the printer, which is the only way a label sheet is ever trusted — and it
// works offline, on the warehouse tablet, which is where labels get printed.
//
// The QR encodes the shelf's own code, not a URL. A code that resolves to
// sparx.works is useless the moment the wifi drops in the back of the building,
// and the scan flows (Phase 3) resolve a bare shelf label perfectly well.

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  NativeSelect,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from '@wizeworks/silicaui-react';
import { Printer, QrCode } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { PrintSheet } from '../../components/print-sheet';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, useStockLocations } from './data';
import { binTypeLabel, useBins, type Bin } from './bins-data';

/** Label sizes, named by what they are FOR rather than by their dimensions —
 *  nobody chooses a label by remembering it is 62mm. */
const SIZES = [
  { value: 'small', label: 'Small', hint: 'Bin fronts', cell: 'w-[45mm] h-[25mm]', qr: 64 },
  { value: 'medium', label: 'Medium', hint: 'Shelf edges', cell: 'w-[70mm] h-[38mm]', qr: 96 },
  { value: 'large', label: 'Large', hint: 'Rack ends', cell: 'w-[95mm] h-[55mm]', qr: 128 },
] as const;

type SizeKey = (typeof SIZES)[number]['value'];

/** One shelf's QR, as a data URI.
 *
 *  `qrcode` is imported dynamically so it never enters the pane's initial bundle
 *  — labels are printed occasionally and the encoder is dead weight on every
 *  other inventory screen. */
function useQrCodes(codes: string[], size: number): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const key = `${size}:${codes.join(',')}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = (await import('qrcode')).default;
      const next = new Map<string, string>();
      for (const code of codes) {
        try {
          next.set(
            code,
            await QRCode.toDataURL(code, {
              width: size,
              margin: 0,
              // Pure black on pure white: a label is photocopied, faxed and
              // printed on a thermal unit that has one ink. A themed color here
              // would come out as an unreadable grey.
              color: { dark: '#000000', light: '#ffffff' },
              errorCorrectionLevel: 'M',
            })
          );
        } catch {
          // A code that cannot be encoded still gets a label — the printed text
          // is the fallback, and a missing square beats a missing shelf.
        }
      }
      if (!cancelled) setMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // `key` collapses the array + size into one dependency; the array identity
    // changes every render and would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}

function LabelCell({
  bin,
  size,
  qr,
}: {
  bin: Bin;
  size: (typeof SIZES)[number];
  qr: string | undefined;
}) {
  return (
    // `break-inside-avoid` is the load-bearing class: without it a label splits
    // across a page break and both halves are useless.
    <div
      className={`flex break-inside-avoid items-center gap-3 border border-black bg-white p-2 ${size.cell}`}
    >
      {/* No placeholder while the square is encoding: an empty grey box on a
          print preview looks like a label that will come out blank. The text
          below is the real fallback and stands on its own. */}
      {/* A plain <img> on purpose: this is a data: URI, so next/image has nothing
          to optimise and its wrapper would fight the print layout. */}
      {qr ? <img src={qr} alt="" width={size.qr} height={size.qr} className="shrink-0" /> : null}
      <span className="flex min-w-0 flex-col">
        {/* Black on white, fixed — a printed label is outside the theme. */}
        <span className="truncate font-mono text-lg leading-tight font-bold text-black">
          {bin.code}
        </span>
        {bin.name ? (
          <span className="truncate text-xs leading-tight text-black">{bin.name}</span>
        ) : null}
        <span className="truncate text-[10px] leading-tight text-black">
          {bin.warehouseName ?? ''}
          {bin.zone ? ` · ${bin.zone}` : ''}
        </span>
        {!bin.isSellable ? (
          <span className="truncate text-[10px] leading-tight font-bold text-black">
            {binTypeLabel(bin.type).toUpperCase()} — NOT FOR SALE
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function BinLabelsSurface({ ctx }: { ctx: SurfaceContext }) {
  const presetWarehouse = typeof ctx.params.warehouseId === 'string' ? ctx.params.warehouseId : '';
  const singleBinId = typeof ctx.params.binId === 'string' ? ctx.params.binId : undefined;

  const [locationId, setLocationId] = useState(presetWarehouse);
  const [zone, setZone] = useState('');
  const [size, setSize] = useState<SizeKey>('medium');

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);

  // A single-shelf reprint still goes through the list query — one code path for
  // one label and for four hundred, so the sheet always looks the same.
  const { data, isLoading } = useBins({
    ...(locationId ? { warehouseId: locationId } : {}),
    ...(zone ? { zone } : {}),
    includeSystem: true,
    take: 500,
    skip: 0,
  });

  const bins = useMemo(() => {
    const all = data?.items ?? [];
    return singleBinId ? all.filter((b) => b.id === singleBinId) : all;
  }, [data, singleBinId]);

  const sizeSpec = SIZES.find((s) => s.value === size) ?? SIZES[1];
  const qrs = useQrCodes(
    bins.map((b) => b.code),
    sizeSpec.qr
  );

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const b of data?.items ?? []) if (b.zone) set.add(b.zone);
    return [...set].sort();
  }, [data]);

  return (
    <div className={PANE_SHELL}>
      {/* `print:hidden` — the controls are not part of the sheet. */}
      <PaneToolbar
        label="Label controls"
        className="print:hidden"
        controls={
          <>
            <Button
              color="module-inventory"
              size="sm"
              disabled={bins.length === 0}
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="size-4" aria-hidden />
              Print {bins.length > 0 ? plural(bins.length, 'label', 'labels') : 'labels'}
            </Button>
            {!singleBinId ? (
              <>
                <NativeSelect
                  size="sm"
                  className="max-w-40 shrink"
                  aria-label="Location"
                  value={locationId}
                  onChange={(event) => {
                    setLocationId(event.target.value);
                    setZone('');
                  }}
                >
                  <option value="">Every location</option>
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>

                {zones.length > 0 ? (
                  <NativeSelect
                    size="sm"
                    className="max-w-36 shrink"
                    aria-label="Zone"
                    value={zone}
                    onChange={(event) => {
                      setZone(event.target.value);
                    }}
                  >
                    <option value="">Every zone</option>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </NativeSelect>
                ) : null}
              </>
            ) : null}
            <ToggleGroup
              value={[size]}
              onValueChange={(value) => {
                const next = value[0];
                if (next) setSize(next as SizeKey);
              }}
            >
              {SIZES.map((s) => (
                <ToggleGroupItem
                  key={s.value}
                  value={s.value}
                  aria-label={`${s.label} labels — ${s.hint}`}
                >
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading shelves…
          </p>
        ) : bins.length === 0 ? (
          <EmptyState
            icon={<QrCode className="size-6" aria-hidden />}
            title="No shelves to label"
            description="Choose a location that has shelves set up, or add some first."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Text className="text-sm print:hidden">
              {plural(bins.length, 'label', 'labels')} at {sizeSpec.label.toLowerCase()} size —{' '}
              {sizeSpec.hint.toLowerCase()}. What you see here is exactly what prints.
            </Text>

            {/* The sheet. `PrintSheet` is what keeps the workbench itself off the
                paper — see components/print-sheet.tsx. */}
            <PrintSheet>
              {bins.map((bin) => (
                <LabelCell key={bin.id} bin={bin} size={sizeSpec} qr={qrs.get(bin.code)} />
              ))}
            </PrintSheet>

            <Text className="text-sm print:hidden">
              The square holds the shelf label itself, not a web address — so it still scans when
              the wifi does not reach the back of the building.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
