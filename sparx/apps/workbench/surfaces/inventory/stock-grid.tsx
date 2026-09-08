'use client';

// STOCK, EDITED LIKE A SPREADSHEET (docs/146 Phase 11.5).
//
// The complaint this closes is the oldest one in docs/146 §2: a stock system
// where changing forty reorder points means forty screens loses to a spreadsheet
// every time, whatever else it can do. So this grid does the four things the
// spreadsheet does and the product did not — type into a cell, paste a column,
// select a block and act on all of it, move around with the keyboard.
//
// ── Nothing saves until you say so ───────────────────────────────────────
//
// Edits are held as a DRAFT and shown as changed cells until Save. Autosave in a
// grid means a mistyped digit becomes a stock movement before the finger leaves
// the key, and the platform's editors are explicit-save everywhere else.
//
// ── What is sent, and what is not ────────────────────────────────────────
//
// A quantity cell sends the TARGET, never the difference. What the cell was
// showing may be a minute old; the server computes the change against what is
// live, inside the row lock. So a sale that landed while the grid was open is
// reconciled instead of being quietly undone by a stale subtraction.
//
// ── Pasting ──────────────────────────────────────────────────────────────
//
// Paste into a cell and a column of values from a spreadsheet fills downwards
// from it. That is the single most-used thing in the tool this replaces, and
// without it "spreadsheet-grade" is a claim rather than a feature.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  EmptyState,
  Input,
  NativeSelect,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Download, Grid3x3, Save, Undo2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useConfirm } from '../../lib/confirm';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage, useStockLocations } from './data';
import {
  stockGridCsvPath,
  useSaveStockGrid,
  useStockGrid,
  type CustomField,
  type StockGridEdit,
  type StockGridRow,
} from './onboarding-data';

/** The columns a person can type into. `onHand` posts a movement; the rest are
 *  bookkeeping and are plain overwrites. */
const EDITABLE = ['onHand', 'reorderPoint', 'reorderQuantity', 'safetyBuffer', 'unitCost'] as const;
type EditableColumn = (typeof EDITABLE)[number];

const COLUMN_LABELS: Record<EditableColumn, string> = {
  onHand: 'On hand',
  reorderPoint: 'Reorder at',
  reorderQuantity: 'Order qty',
  safetyBuffer: 'Held back',
  unitCost: 'Unit cost',
};

/** Draft edits, keyed by row then column. Strings, because a half-typed number
 *  is a real state and coercing on every keystroke fights the person typing. */
type Draft = Record<string, Record<string, string>>;

const rowKey = (row: { variantId: string; warehouseId: string }): string =>
  `${row.variantId}:${row.warehouseId}`;

function currentValue(row: StockGridRow, column: EditableColumn): string {
  switch (column) {
    case 'onHand':
      return String(row.onHand);
    case 'reorderPoint':
      return row.reorderPoint === null ? '' : String(row.reorderPoint);
    case 'reorderQuantity':
      return row.reorderQuantity === null ? '' : String(row.reorderQuantity);
    case 'safetyBuffer':
      return String(row.safetyBuffer);
    case 'unitCost':
      return row.unitCostCents === null ? '' : (row.unitCostCents / 100).toFixed(2);
    default:
      return '';
  }
}

function customValue(row: StockGridRow, field: CustomField): string {
  const value = row.customFields[field.key];
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('|');
  if (field.type === 'money' && typeof value === 'number') return (value / 100).toFixed(2);
  return String(value);
}

/** Turn a row's draft into the patch the API takes. Only fields that actually
 *  differ from what is on screen are sent — a grid that re-posts every visible
 *  value would write four hundred movements of zero. */
function toEdit(
  row: StockGridRow,
  draft: Record<string, string>,
  fields: CustomField[]
): StockGridEdit | null {
  const edit: StockGridEdit = { variantId: row.variantId, warehouseId: row.warehouseId };
  let changed = false;

  for (const column of EDITABLE) {
    const typed = draft[column];
    if (typed === undefined || typed === currentValue(row, column)) continue;
    const trimmed = typed.trim();
    if (column === 'unitCost') {
      // Blank clears the cost. Null, not zero: an item whose cost nobody has
      // recorded has not been established to be free.
      edit.unitCostCents = trimmed === '' ? null : Math.round(Number(trimmed) * 100);
      if (trimmed !== '' && !Number.isFinite(Number(trimmed))) return null;
    } else if (column === 'onHand' || column === 'safetyBuffer') {
      if (trimmed === '' || !Number.isInteger(Number(trimmed))) return null;
      edit[column] = Number(trimmed);
    } else {
      edit[column] = trimmed === '' ? null : Number(trimmed);
      if (trimmed !== '' && !Number.isInteger(Number(trimmed))) return null;
    }
    changed = true;
  }

  const customFields: Record<string, unknown> = {};
  for (const field of fields) {
    const typed = draft[`cf:${field.key}`];
    if (typed === undefined || typed === customValue(row, field)) continue;
    customFields[field.key] = typed;
    changed = true;
  }
  if (Object.keys(customFields).length > 0) edit.customFields = customFields;

  return changed ? edit : null;
}

export function StockGridSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkColumn, setBulkColumn] = useState<EditableColumn>('reorderPoint');
  const [bulkValue, setBulkValue] = useState('');

  const locations = useStockLocations();
  const grid = useStockGrid({
    ...(warehouseId ? { warehouseId } : {}),
    ...(search ? { search } : {}),
    ...(lowOnly ? { lowOnly } : {}),
    take: 200,
  });
  const save = useSaveStockGrid();

  const rows = useMemo(() => grid.data?.rows ?? [], [grid.data]);
  const fields = useMemo(() => grid.data?.customFields ?? [], [grid.data]);
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);

  const pending = useMemo(() => {
    const edits: StockGridEdit[] = [];
    let invalid = 0;
    for (const row of rows) {
      const rowDraft = draft[rowKey(row)];
      if (!rowDraft) continue;
      const edit = toEdit(row, rowDraft, fields);
      if (edit === null) {
        // Distinguish "nothing changed" from "what was typed is not a number":
        // only the second is worth telling somebody about.
        const typedSomething = Object.entries(rowDraft).some(([column, value]) => {
          if (column.startsWith('cf:')) return false;
          return value !== currentValue(row, column as EditableColumn);
        });
        if (typedSomething) invalid += 1;
        continue;
      }
      edits.push(edit);
    }
    return { edits, invalid };
  }, [draft, rows, fields]);

  // A row that reloads underneath a draft keeps the draft: the person typed it,
  // and throwing it away on a background refetch is the grid losing work.
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  useEffect(() => {
    cellRefs.current.clear();
  }, [rows]);

  const setCell = (key: string, column: string, value: string): void => {
    setDraft((previous) => ({ ...previous, [key]: { ...previous[key], [column]: value } }));
  };

  /** Fill a column downwards from a pasted block — the spreadsheet move. */
  const pasteColumn = (startIndex: number, column: string, text: string): boolean => {
    const values = text
      .split(/\r\n|\r|\n/)
      .map((line) => line.split('\t')[0]?.trim() ?? '')
      .filter((line, index, all) => !(index === all.length - 1 && line === ''));
    if (values.length <= 1) return false;
    setDraft((previous) => {
      const next = { ...previous };
      values.forEach((value, offset) => {
        const row = rows[startIndex + offset];
        if (!row) return;
        const key = rowKey(row);
        next[key] = { ...next[key], [column]: value };
      });
      return next;
    });
    return true;
  };

  const applyBulk = (): void => {
    if (selected.size === 0 || bulkValue.trim() === '') return;
    setDraft((previous) => {
      const next = { ...previous };
      for (const key of selected) {
        next[key] = { ...next[key], [bulkColumn]: bulkValue.trim() };
      }
      return next;
    });
    setBulkValue('');
  };

  const onSave = (): void => {
    void (async () => {
      const quantityEdits = pending.edits.filter((edit) => edit.onHand !== undefined).length;
      if (quantityEdits > 0) {
        const ok = await confirm({
          title: `Save ${plural(pending.edits.length, 'change', 'changes')}?`,
          description: `${plural(quantityEdits, 'quantity', 'quantities')} will post a stock movement, recorded against whoever you are signed in as. The change is worked out against what is on the shelf right now, so anything that sold while this was open is taken into account.`,
          confirmLabel: 'Save them',
          cancelLabel: 'Not yet',
          color: 'module',
        });
        if (!ok) return;
      }
      save.mutate(
        { edits: pending.edits, reason: 'manual' },
        {
          onSuccess: (result) => {
            // Only clear the rows that actually saved. Wiping the whole draft on
            // a partial save would throw away the two rows that failed along
            // with their typed values, which is the moment a person stops
            // trusting the grid.
            const failedKeys = new Set(
              result.results.filter((row) => row.error !== null).map((row) => rowKey(row))
            );
            setDraft((previous) => {
              const next: Draft = {};
              for (const [key, value] of Object.entries(previous)) {
                if (failedKeys.has(key)) next[key] = value;
              }
              return next;
            });
            setSelected(new Set());
            afterCommit(() => {
              toast.add({
                title: `${plural(result.saved, 'row', 'rows')} saved`,
                ...(result.failed > 0
                  ? {
                      description: `${plural(result.failed, 'row', 'rows')} did not save — the reason is on the row.`,
                    }
                  : result.unitsChanged > 0
                    ? { description: `${result.unitsChanged.toLocaleString()} units moved.` }
                    : {}),
                type: result.failed > 0 ? 'warning' : 'success',
              });
            });
          },
          onError: (error) => {
            afterCommit(() => {
              toast.add({
                title: 'Could not save',
                description: stockErrorMessage(error, 'Nothing was changed.'),
                type: 'error',
              });
            });
          },
        }
      );
    })();
  };

  const failures = new Map(
    (save.data?.results ?? [])
      .filter((row) => row.error !== null)
      .map((row) => [rowKey(row), row.error])
  );

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock grid controls"
        primary={
          <Button
            color="neutral"
            variant="outline"
            size="sm"
            className="ml-auto"
            render={
              <a
                href={stockGridCsvPath({
                  ...(warehouseId ? { warehouseId } : {}),
                  ...(search ? { search } : {}),
                  ...(lowOnly ? { lowOnly } : {}),
                })}
                download
              >
                <Download className="size-4" aria-hidden />
                Export
              </a>
            }
          />
        }
        controls={
          <>
            <Input
              color="module"
              size="sm"
              placeholder="Search items"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              className="max-w-56"
            />
            <NativeSelect
              color="module"
              size="sm"
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
              }}
              className="max-w-56"
            >
              <option value="">Every location</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                color="module"
                checked={lowOnly}
                onChange={(event) => {
                  setLowOnly(event.target.checked);
                }}
              />
              Running low only
            </label>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={grid.isFetching}
            updatedAt={grid.data ? grid.dataUpdatedAt : undefined}
            onRefresh={() => {
              void grid.refetch();
            }}
          />
        }
      />

      {selected.size > 0 ? (
        <div className="border-base-300 bg-base-100 flex flex-wrap items-end gap-2 border-b p-3">
          <Text className="text-sm font-medium">
            {plural(selected.size, 'row', 'rows')} selected — set
          </Text>
          <NativeSelect
            color="module"
            size="sm"
            value={bulkColumn}
            onChange={(event) => {
              setBulkColumn(event.target.value as EditableColumn);
            }}
            className="max-w-44"
          >
            {EDITABLE.map((column) => (
              <option key={column} value={column}>
                {COLUMN_LABELS[column]}
              </option>
            ))}
          </NativeSelect>
          <Input
            color="module"
            size="sm"
            inputMode="decimal"
            placeholder="to"
            value={bulkValue}
            onChange={(event) => {
              setBulkValue(event.target.value);
            }}
            className="max-w-28"
          />
          <Button color="module" size="sm" disabled={bulkValue.trim() === ''} onClick={applyBulk}>
            Apply to {selected.size}
          </Button>
          <Button
            color="neutral"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(new Set());
            }}
          >
            Clear selection
          </Button>
        </div>
      ) : null}

      {pending.edits.length > 0 || pending.invalid > 0 ? (
        <div className="border-base-300 bg-module bg-soft flex flex-wrap items-center gap-3 border-b p-3">
          <Text className="font-medium">
            {plural(pending.edits.length, 'change', 'changes')} not saved
            {pending.invalid > 0
              ? ` · ${plural(pending.invalid, 'row is', 'rows are')} not a number`
              : ''}
          </Text>
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={pending.edits.length === 0 || save.isPending}
            onClick={onSave}
          >
            <Save className="size-4" aria-hidden />
            Save {pending.edits.length}
          </Button>
          <Button
            color="neutral"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft({});
            }}
          >
            <Undo2 className="size-4" aria-hidden />
            Discard
          </Button>
        </div>
      ) : null}

      {failures.size > 0 ? (
        <Alert color="danger" variant="soft" className="m-3">
          <AlertContent>
            <AlertTitle>{plural(failures.size, 'row', 'rows')} did not save</AlertTitle>
            <AlertDescription>
              They are still here with what you typed. Everything else went through.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Grid3x3 className="size-6" aria-hidden />}
            title={search === '' ? 'No stock to show' : `Nothing matches ${search}`}
            description={
              search === ''
                ? 'Import a spreadsheet or add an item, and every quantity you keep will be editable here.'
                : 'Try a shorter search, or clear the location filter.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th className="w-8">
                  <Checkbox
                    color="module"
                    aria-label="Select every row"
                    checked={selected.size > 0 && selected.size === rows.length}
                    onChange={(event) => {
                      setSelected(event.target.checked ? new Set(rows.map(rowKey)) : new Set());
                    }}
                  />
                </th>
                {/* `w-full` on the item column is what makes every other column
                    shrink to the width its input actually needs. Without it the
                    inputs claim their intrinsic width — five of them across a
                    row — and the item column collapses to "6a…", which is the
                    one column you cannot edit a grid without reading. */}
                <th className="w-full">Item</th>
                <th className="hidden @lg:table-cell">Location</th>
                {/* `min-w` and not just `w`: a width alone is a SUGGESTION the
                    table drops when the row is crowded, and a dropped width
                    here clips "312" to "3" — a number that is wrong rather than
                    merely small. The item column gives up space; figures do not. */}
                {EDITABLE.map((column) => (
                  <th key={column} className="w-28 min-w-28 text-right">
                    {COLUMN_LABELS[column]}
                  </th>
                ))}
                {fields.map((field) => (
                  <th key={field.id} className="w-40 min-w-40">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = rowKey(row);
                const rowDraft = draft[key] ?? {};
                const failure = failures.get(key);
                return (
                  <tr key={key} className={failure ? 'bg-danger bg-soft' : undefined}>
                    <td>
                      <Checkbox
                        color="module"
                        aria-label={`Select ${row.sku}`}
                        checked={selected.has(key)}
                        onChange={(event) => {
                          const { checked } = event.target;
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (checked) next.add(key);
                            else next.delete(key);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="w-full max-w-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono text-sm">{row.sku}</span>
                        <span className="truncate text-sm">{row.title}</span>
                        {failure ? <span className="text-danger text-sm">{failure}</span> : null}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap @lg:table-cell">{row.warehouseCode}</td>
                    {EDITABLE.map((column) => (
                      <td key={column} className="w-28 min-w-28 text-right">
                        <GridCell
                          value={rowDraft[column] ?? currentValue(row, column)}
                          dirty={
                            rowDraft[column] !== undefined &&
                            rowDraft[column] !== currentValue(row, column)
                          }
                          onChange={(value) => {
                            setCell(key, column, value);
                          }}
                          onPaste={(text) => pasteColumn(index, column, text)}
                          label={`${COLUMN_LABELS[column]} for ${row.sku}`}
                        />
                      </td>
                    ))}
                    {fields.map((field) => (
                      <td key={field.id} className="w-40 min-w-40">
                        <GridCell
                          value={rowDraft[`cf:${field.key}`] ?? customValue(row, field)}
                          dirty={
                            rowDraft[`cf:${field.key}`] !== undefined &&
                            rowDraft[`cf:${field.key}`] !== customValue(row, field)
                          }
                          onChange={(value) => {
                            setCell(key, `cf:${field.key}`, value);
                          }}
                          onPaste={(text) => pasteColumn(index, `cf:${field.key}`, text)}
                          label={`${field.label} for ${row.sku}`}
                          align="left"
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      {grid.data && grid.data.total > rows.length ? (
        <div className="border-base-300 border-t p-3">
          <Text className="text-sm">
            Showing {rows.length.toLocaleString()} of {grid.data.total.toLocaleString()}. Narrow it
            with the search or the location filter — everything shown here is editable, and nothing
            off-screen is touched by a save.
          </Text>
        </div>
      ) : null}
    </div>
  );
}

/** One cell. A dirty cell is marked by its own color rather than by a dot in a
 *  margin: the whole point of the grid is that a person can see at a glance what
 *  they have changed and what they have not. */
function GridCell({
  value,
  dirty,
  onChange,
  onPaste,
  label,
  align = 'right',
}: {
  value: string;
  dirty: boolean;
  onChange: (value: string) => void;
  onPaste: (text: string) => boolean;
  label: string;
  align?: 'left' | 'right';
}) {
  return (
    <Input
      color={dirty ? 'module' : 'neutral'}
      size="sm"
      aria-label={label}
      value={value}
      // A changed cell is marked by its own border color rather than by a dot
      // in a margin: the point of the grid is seeing at a glance what you have
      // changed and what you have not.
      className={[
        'w-full',
        align === 'right' ? 'text-right tabular-nums' : '',
        dirty ? 'font-medium' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onPaste={(event) => {
        const text = event.clipboardData.getData('text/plain');
        if (!text.includes('\n') && !text.includes('\r')) return;
        // A multi-line paste is a column from a spreadsheet, and letting the
        // browser drop all of it into one cell is the failure that makes people
        // go back to the spreadsheet.
        if (onPaste(text)) event.preventDefault();
      }}
    />
  );
}
