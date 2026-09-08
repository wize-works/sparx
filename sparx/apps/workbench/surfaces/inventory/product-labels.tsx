'use client';

// PRODUCT LABELS — a printable sheet of barcodes for the things you sell.
//
// ── Why a barcode here and a QR on the shelf ──────────────────────────────
//
// The two are read differently and the difference is physical. A shelf label is
// read off a rack, at an angle, usually by a phone; a 2D code survives that. A
// product label is read square-on at close range by a laser gun, which is what
// 1D barcodes are for and what every till and every warehouse scanner in
// existence expects. Using one code for both would make one of the two jobs
// worse, so we use the right one for each.
//
// ── Rendered here, printed by the browser ─────────────────────────────────
//
// No PDF service. The sheet IS the page and `print` takes it from there, so what
// is previewed is exactly what comes out — the only way a label sheet is ever
// trusted — and it works on a warehouse tablet with no connection.
//
// The bars are drawn from `@wizeworks/commerce-schemas`, the same encoder the server
// uses, so a label printed from this screen carries the code the registry
// validated rather than a second implementation's opinion of it.
//
// ── Items with no code get one, here ──────────────────────────────────────
//
// "The ones we can scan and the ones we can't" is how a scan-first warehouse
// quietly reverts to typing, so this screen does not merely refuse to print an
// item without a barcode: it offers to mint one. That is the whole path from a
// spreadsheet catalogue to a scannable warehouse, and it is two clicks.

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  NativeSelect,
  SearchInput,
  Text,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { barcodeSvg, encodeBarcode } from '@wizeworks/commerce-schemas';
import { Barcode as BarcodeIcon, Printer, Sparkles } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { PrintSheet } from '../../components/print-sheet';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import { useBarcodes, useGenerateBarcodes, type Barcode } from './scan-data';

/** Label sizes named by what they are FOR. Nobody picks a label by remembering 62mm. */
const SIZES = [
  {
    value: 'small',
    label: 'Small',
    hint: 'Unit stickers',
    cell: 'w-[45mm] h-[25mm]',
    module: 1,
    barHeight: 28,
    font: 8,
  },
  {
    value: 'medium',
    label: 'Medium',
    hint: 'Shelf-edge tickets',
    cell: 'w-[70mm] h-[38mm]',
    module: 1.4,
    barHeight: 40,
    font: 10,
  },
  {
    value: 'large',
    label: 'Large',
    hint: 'Cartons and totes',
    cell: 'w-[95mm] h-[55mm]',
    module: 2,
    barHeight: 56,
    font: 12,
  },
] as const;

type SizeKey = (typeof SIZES)[number]['value'];

/** What goes on the label besides the bars. Presets, because the answer is
 *  almost always one of three and a field-by-field designer is a form nobody
 *  wants to fill in before printing forty stickers. */
const PRESETS = [
  {
    value: 'warehouse',
    label: 'Warehouse',
    hint: 'Code, SKU and name',
    showSku: true,
    showTitle: true,
    showPrice: false,
  },
  {
    value: 'shelf',
    label: 'Shelf edge',
    hint: 'Name and price',
    showSku: false,
    showTitle: true,
    showPrice: true,
  },
  {
    value: 'bare',
    label: 'Code only',
    hint: 'Just the bars',
    showSku: false,
    showTitle: false,
    showPrice: false,
  },
] as const;

type PresetKey = (typeof PRESETS)[number]['value'];

/**
 * One label's bars, as an inline SVG string.
 *
 * Returns null rather than a broken image when the code cannot be encoded: a
 * label that prints but does not scan is worse than one that is visibly missing,
 * because the first is found in the warehouse and the second at the desk.
 */
function useBarcodeSvg(
  value: string,
  symbology: string,
  size: (typeof SIZES)[number]
): { svg: string | null; error: string | null } {
  return useMemo(() => {
    try {
      const encoded = encodeBarcode(value, symbology as never);
      return {
        svg: barcodeSvg(encoded, {
          moduleWidth: size.module,
          height: size.barHeight,
          fontSize: size.font,
          quietZone: 10,
        }),
        error: null,
      };
    } catch (error) {
      return {
        svg: null,
        error: error instanceof Error ? error.message : 'Cannot print this code',
      };
    }
  }, [value, symbology, size]);
}

function LabelCell({
  row,
  size,
  preset,
}: {
  row: Barcode;
  size: (typeof SIZES)[number];
  preset: (typeof PRESETS)[number];
}) {
  const { svg, error } = useBarcodeSvg(row.value, row.symbology, size);

  return (
    // `break-inside-avoid` is load-bearing: without it a label splits across a
    // page break and both halves are useless.
    <div
      className={`flex break-inside-avoid flex-col items-center justify-center gap-1 border border-black bg-white p-1 ${size.cell}`}
    >
      {preset.showTitle ? (
        <span className="w-full truncate text-center text-[10px] leading-tight font-semibold text-black">
          {row.productTitle ?? ''}
          {row.variantTitle ? ` · ${row.variantTitle}` : ''}
        </span>
      ) : null}

      {svg ? (
        // The encoder returns a complete, self-contained SVG document with no
        // scripts and no external references, built from our own numbers — there
        // is no untrusted content anywhere in it.
        <span
          className="flex items-center justify-center"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span className="text-center text-[9px] leading-tight font-bold text-black">
          {error}
          <br />
          {row.value}
        </span>
      )}

      {preset.showSku && row.sku ? (
        <span className="w-full truncate text-center font-mono text-[9px] leading-tight text-black">
          {row.sku}
        </span>
      ) : null}
      {row.packSize > 1 ? (
        <span className="text-center text-[9px] leading-tight font-bold text-black">
          CASE OF {row.packSize}
        </span>
      ) : null}
    </div>
  );
}

export function ProductLabelsSurface({ ctx }: { ctx: SurfaceContext }) {
  const presetVariant = typeof ctx.params.variantId === 'string' ? ctx.params.variantId : undefined;

  const [search, setSearch] = useState('');
  const [size, setSize] = useState<SizeKey>('medium');
  const [preset, setPreset] = useState<PresetKey>('warehouse');
  const [primaryOnly, setPrimaryOnly] = useState(true);
  const [copies, setCopies] = useState(1);

  const { data, isLoading } = useBarcodes({
    ...(presetVariant ? { variantId: presetVariant } : {}),
    q: search.trim(),
    limit: 200,
    offset: 0,
  });
  const generate = useGenerateBarcodes();

  const sizeSpec = SIZES.find((s) => s.value === size) ?? SIZES[1];
  const presetSpec = PRESETS.find((p) => p.value === preset) ?? PRESETS[0];

  const rows = useMemo(() => {
    const all = (data?.items ?? []).filter((b) => b.isActive);
    // One label per item by default. Printing every alternate code an item
    // carries is almost never what somebody means by "print labels", and it
    // silently triples a sheet.
    const chosen = primaryOnly ? all.filter((b) => b.isPrimary) : all;
    // Copies expand here rather than in a loop at render, so the count in the
    // toolbar is the number of stickers that will come out of the printer.
    return chosen.flatMap((row) => Array.from({ length: copies }, () => row));
  }, [data, primaryOnly, copies]);

  return (
    <div className={PANE_SHELL}>
      {/* `print:hidden` — the controls are not part of the sheet. */}
      <PaneToolbar
        label="Product label controls"
        className="print:hidden"
        search={
          !presetVariant ? (
            <SearchInput
              value={search}
              placeholder="Code, SKU or product"
              onValueChange={setSearch}
            />
          ) : null
        }
        controls={
          <>
            <Button
              color="module-inventory"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="size-4" aria-hidden />
              Print {rows.length > 0 ? plural(rows.length, 'label', 'labels') : 'labels'}
            </Button>
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
                  aria-label={`${s.label} — ${s.hint}`}
                >
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="What goes on the label"
              value={preset}
              onChange={(event) => {
                setPreset(event.target.value as PresetKey);
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} — {p.hint}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-28 shrink"
              aria-label="Copies of each label"
              value={String(copies)}
              onChange={(event) => {
                setCopies(Number(event.target.value));
              }}
            >
              {[1, 2, 4, 8, 12, 24].map((n) => (
                <option key={n} value={n}>
                  {n} each
                </option>
              ))}
            </NativeSelect>
            <Tooltip content="Off prints every code an item has, including case and supplier codes">
              <Checkbox
                checked={primaryOnly}
                onChange={(event) => {
                  setPrimaryOnly(event.target.checked);
                }}
              >
                Main code only
              </Checkbox>
            </Tooltip>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading codes…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BarcodeIcon className="size-6" aria-hidden />}
            title={search.trim() ? 'Nothing matches that' : 'No barcodes to print'}
            description={
              search.trim()
                ? 'Try part of a code, a SKU, or a product name.'
                : 'Items need a barcode before a label can be printed. sparx can create one for anything that arrived without a manufacturer code — a real UPC that any scanner reads, in the range reserved for in-house use.'
            }
            actions={
              search.trim() ? undefined : (
                <Button
                  color="module-inventory"
                  onClick={() => {
                    ctx.open('inventory.stock.list', {}, { target: 'tab' });
                  }}
                >
                  <Sparkles className="size-4" aria-hidden />
                  Pick items to create codes for
                </Button>
              )
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Text className="text-sm print:hidden">
              {plural(rows.length, 'label', 'labels')} at {sizeSpec.label.toLowerCase()} size —{' '}
              {sizeSpec.hint.toLowerCase()}. What you see here is exactly what prints.
            </Text>

            {generate.data && generate.data.generated.length > 0 ? (
              <Alert color="success" variant="soft" className="print:hidden">
                Created {plural(generate.data.generated.length, 'code', 'codes')}. They are on the
                sheet below.
              </Alert>
            ) : null}

            {/* The sheet. `PrintSheet` is what keeps the workbench itself off the
                paper — see components/print-sheet.tsx. */}
            <PrintSheet>
              {rows.map((row, index) => (
                <LabelCell
                  key={`${row.id}-${index}`}
                  row={row}
                  size={sizeSpec}
                  preset={presetSpec}
                />
              ))}
            </PrintSheet>

            <Text className="text-sm print:hidden">
              Set your printer to actual size — scaling a barcode to fit the page narrows the bars
              and is the commonest reason a printed label will not scan.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The "give these items a barcode" action, as a button any list can drop in.
 *
 * Lives here rather than in the list that uses it because the explanation
 * belongs with the thing it explains: minting takes from a counter that never
 * goes backwards, and the person clicking it should be told that once, in the
 * place it happens.
 */
export function GenerateBarcodesButton({
  variantIds,
  onDone,
}: {
  variantIds: string[];
  onDone?: (result: { generated: number; skipped: number }) => void;
}) {
  const generate = useGenerateBarcodes();
  return (
    <Tooltip content="Creates a real UPC for anything without one — any scanner reads it, and it can never clash with a manufacturer's code">
      <Button
        color="module-inventory"
        size="sm"
        disabled={variantIds.length === 0 || generate.isPending}
        onClick={() => {
          generate.mutate(
            { variantIds },
            {
              onSuccess: (result) => {
                onDone?.({
                  generated: result.generated.length,
                  skipped: result.skipped.length,
                });
              },
            }
          );
        }}
      >
        <Sparkles className="size-4" aria-hidden />
        {generate.isPending
          ? 'Creating…'
          : `Create ${plural(variantIds.length, 'barcode', 'barcodes')}`}
      </Button>
    </Tooltip>
  );
}

/** How many of a set of items still have no code. The number that decides
 *  whether a warehouse can go scan-first at all. */
export function MissingBarcodeCount({ missing }: { missing: number }) {
  if (missing === 0) return null;
  return (
    <Badge color="warning" variant="soft" size="sm">
      {missing} without a barcode
    </Badge>
  );
}
