'use client';

// DOCUMENT LABEL — the barcode that goes on a piece of paperwork.
//
// ── Why this exists at all ────────────────────────────────────────────────
//
// Warehouse mode says "scan the count sheet" and "scan the delivery
// paperwork". That instruction is a lie unless the number on those documents is
// printed as something a scanner can read, and a purchase order printed from
// sparx has only ever carried its number as text. So: one label, Code 128, big
// enough to read from the top of a pallet.
//
// ── One surface for four documents, not four surfaces ─────────────────────
//
// A purchase order, a receipt, a transfer and a count all need exactly the same
// thing: their reference as bars, their reference as text, and one line saying
// what it is. There is no per-document variation worth four files, and four
// files would guarantee the four drift apart.
//
// ── Deliberately not part of the PDF document builder ─────────────────────
//
// The PO document (`purchase-order-document.ts`) is what gets emailed to a
// supplier — an external artefact with a brand on it. This is a sticker for our
// own dock. Putting a scannable code on the supplier's copy would be putting our
// internal reference on someone else's desk, where it means nothing.

import { useMemo, useState } from 'react';
import { Alert, Button, NativeSelect, Text } from '@wizeworks/silicaui-react';
import { barcodeSvg, encodeBarcode } from '@wizeworks/commerce-schemas';
import { Printer } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { PrintSheet } from '../../components/print-sheet';
import type { SurfaceContext } from '../../lib/surfaces/registry';

/** Copies, because a delivery gets one on the paperwork and one on the pallet. */
const COPY_COUNTS = [1, 2, 4, 6];

const SIZES = [
  {
    value: 'medium',
    label: 'Medium',
    hint: 'Paperwork',
    module: 1.6,
    height: 50,
    cell: 'w-[90mm]',
  },
  {
    value: 'large',
    label: 'Large',
    hint: 'Pallets and totes',
    module: 2.6,
    height: 80,
    cell: 'w-[140mm]',
  },
] as const;

type SizeKey = (typeof SIZES)[number]['value'];

export function DocumentLabelSurface({ ctx }: { ctx: SurfaceContext }) {
  const number = typeof ctx.params.number === 'string' ? ctx.params.number : '';
  const title = typeof ctx.params.title === 'string' ? ctx.params.title : 'Document';
  const subtitle = typeof ctx.params.subtitle === 'string' ? ctx.params.subtitle : '';

  const [size, setSize] = useState<SizeKey>('medium');
  const [copies, setCopies] = useState(2);

  const sizeSpec = SIZES.find((s) => s.value === size) ?? SIZES[0];

  const svg = useMemo(() => {
    if (!number) return null;
    try {
      // Code 128 rather than a GTIN family: a document number is alphanumeric
      // ("PO-000045") and no fixed-length numeric symbology can carry it.
      return barcodeSvg(encodeBarcode(number, 'code_128'), {
        moduleWidth: sizeSpec.module,
        height: sizeSpec.height,
        fontSize: sizeSpec.module * 8,
        quietZone: 10,
      });
    } catch {
      return null;
    }
  }, [number, sizeSpec]);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Document label controls"
        className="print:hidden"
        controls={
          <>
            <Button
              color="module-inventory"
              size="sm"
              disabled={svg === null}
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="size-4" aria-hidden />
              Print
            </Button>
            <NativeSelect
              size="sm"
              className="max-w-36 shrink"
              aria-label="Label size"
              value={size}
              onChange={(event) => {
                setSize(event.target.value as SizeKey);
              }}
            >
              {SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.hint}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-28 shrink"
              aria-label="How many copies"
              value={String(copies)}
              onChange={(event) => {
                setCopies(Number(event.target.value));
              }}
            >
              {COPY_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'copy' : 'copies'}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {svg === null ? (
          <Alert color="warning" className="print:hidden">
            {number
              ? `${number} cannot be printed as a barcode.`
              : 'No document reference was given, so there is nothing to print.'}
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            <Text className="text-sm print:hidden">
              Stick one on the paperwork and one on the pallet. Scanning it in warehouse mode opens
              this {title.toLowerCase()} straight away.
            </Text>

            {/* The sheet. `PrintSheet` is what keeps the workbench itself off the
                paper — see components/print-sheet.tsx. */}
            <PrintSheet>
              {Array.from({ length: copies }, (_, index) => (
                <div
                  key={index}
                  className={`flex break-inside-avoid flex-col items-center gap-1 border border-black bg-white p-3 ${sizeSpec.cell}`}
                >
                  <span className="w-full truncate text-center text-xs leading-tight font-semibold text-black">
                    {title}
                  </span>
                  <span
                    className="flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                  {subtitle ? (
                    <span className="w-full truncate text-center text-xs leading-tight text-black">
                      {subtitle}
                    </span>
                  ) : null}
                </div>
              ))}
            </PrintSheet>

            <Text className="text-sm print:hidden">
              Print at actual size — scaling narrows the bars, which is the commonest reason a
              printed label will not scan.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
