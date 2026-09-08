'use client';

// A SPREADSHEET OF COUNTS, TURNED INTO STOCK
// (docs/146 Phase 10.5 + 10.6, extended by 11.2, 11.3 and 11.7).
//
// ── The screen is three steps because the operation is ───────────────────
//
// Upload, say what the columns mean, look at what WOULD happen, then apply. A
// bad adjustment import is indistinguishable from theft in the ledger afterwards
// — four hundred corrections, all stamped the same second, all attributed to
// whoever pressed the button — so the moment to catch it is before it is posted,
// and the only way to catch it is to show it.
//
// ── The mapping step, and why a guess shows its confidence ───────────────
//
// sparx guesses what each of your headings means and says how sure it is. A
// guess it is not sure about arrives EMPTY rather than filled in with something
// plausible, because a mapping screen that comes pre-filled with the wrong
// column is worse than one that comes blank: the blank one gets read.
//
// Confirm it once and save it, and next month's export is one click. That is the
// whole value of the step — it is not configuration, it is the last time anybody
// has to think about these headings.
//
// ── The preview is deliberately unflattering ─────────────────────────────
//
// The rows that cannot be used come FIRST, above the ones that would work,
// because "412 rows, 6 of them wrong" is the sentence that makes somebody fix
// the file instead of shrugging and pressing on. Each one can be sorted out
// where it sits — skipped, or turned into a new item — without re-uploading.
//
// ── Undo ─────────────────────────────────────────────────────────────────
//
// An applied import can be undone. It writes compensating movements rather than
// deleting anything — the ledger is append-only, and an import that could be
// erased is one nobody could audit.

import { useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Table,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Download, FileSpreadsheet, Undo2, Upload } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useConfirm } from '../../lib/confirm';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage, useStockLocations } from './data';
import {
  formatCount,
  importStatusLabel,
  importStatusTone,
  importTemplatePath,
  useApplyImport,
  useDiscardImport,
  useImportBatch,
  useImportBatches,
  usePlanImport,
  useReverseImport,
  type ImportBatchDetail,
  type ImportRowPlan,
} from './reporting-data';
import {
  useDeleteImportProfile,
  useImportProfiles,
  useMigrationRecipes,
  usePreviewImport,
  useResolveImportRows,
  useSaveImportProfile,
  type ColumnMatch,
  type ImportPreview,
} from './onboarding-data';

/** What the movements this file writes will be recorded AS. The choice matters:
 *  `recount` puts the differences in the shrinkage report, where a stock-take
 *  belongs, and `manual` does not. */
const REASONS = [
  { value: 'recount', label: 'A stock count — differences count as shrinkage' },
  { value: 'manual', label: 'A correction — keep it out of the shrinkage figures' },
  { value: 'opening', label: 'What we started with — the first quantities on the books' },
  { value: 'receive', label: 'Goods arriving' },
  { value: 'damage', label: 'Damaged stock' },
  { value: 'loss', label: 'Stock lost' },
];

/** The name the file gave, or the code when it gave none. An EMPTY name is a
 *  missing one, so `??` would keep the empty string and produce an item titled
 *  nothing — which the API refuses and nobody could find afterwards. */
function nameOrCode(name: string | null | undefined, sku: string | null): string {
  const trimmed = name?.trim() ?? '';
  if (trimmed !== '') return trimmed;
  return sku ?? 'New item';
}

/** How sure sparx is, in words. A percentage would invite somebody to treat 71%
 *  and 74% as different answers; they are the same answer, which is "probably,
 *  have a look". */
function confidenceBadge(match: ColumnMatch): {
  label: string;
  tone: 'success' | 'warning' | 'danger';
} {
  if (match.header === null) {
    return match.required
      ? { label: 'Needs an answer', tone: 'danger' }
      : { label: 'Not used', tone: 'warning' };
  }
  return match.reason === 'exact'
    ? { label: 'Matched', tone: 'success' }
    : { label: 'Check this', tone: 'warning' };
}

function MappingStep({
  preview,
  mapping,
  onChange,
}: {
  preview: ImportPreview;
  mapping: Record<string, string>;
  onChange: (key: string, header: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {preview.mapping.missingRequired.length > 0 ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>Still needed: {preview.mapping.missingRequired.join(', ')}</AlertTitle>
            <AlertDescription>
              Pick the column each of these should read from. Without them the file cannot be read
              at all.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : preview.mapping.needsConfirmation.length > 0 ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>
              {plural(preview.mapping.needsConfirmation.length, 'column', 'columns')} matched by
              resemblance
            </AlertTitle>
            <AlertDescription>
              {preview.mapping.needsConfirmation.join(', ')} — worth a look before you go on.
              Everything else matched exactly.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : (
        <Alert color="success" variant="soft">
          <AlertContent>
            <AlertTitle>Every column matched</AlertTitle>
            <AlertDescription>
              Nothing to decide. Read the file, and you will see what it would change before
              anything is applied.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <Table size="sm">
        <thead>
          <tr>
            <th>What sparx needs</th>
            <th>Your column</th>
            <th className="w-32">How sure</th>
          </tr>
        </thead>
        <tbody>
          {preview.mapping.matches.map((match) => {
            const badge = confidenceBadge(match);
            return (
              <tr key={match.key}>
                <td className="max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{match.label}</span>
                      {match.required ? (
                        <Badge color="warning" variant="soft" size="sm">
                          Needed
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-sm">{match.hint}</span>
                  </span>
                </td>
                <td>
                  <NativeSelect
                    color="module"
                    size="sm"
                    aria-label={`Which column is ${match.label}`}
                    value={mapping[match.key] ?? match.header ?? ''}
                    onChange={(event) => {
                      onChange(match.key, event.target.value);
                    }}
                  >
                    <option value="">Not in this file</option>
                    {preview.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td>
                  <Badge color={badge.tone} variant="soft" size="sm">
                    {badge.label}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {preview.mapping.unmatchedHeaders.length > 0 ? (
        <Text className="text-sm">
          Columns sparx has no use for and will ignore:{' '}
          {preview.mapping.unmatchedHeaders.join(', ')}.
        </Text>
      ) : null}

      {preview.numberFormat ? (
        <Text className="text-sm">
          Your numbers use <span className="font-mono">{preview.numberFormat.decimal}</span> before
          the decimals, read from {plural(preview.numberFormat.sampleCount, 'value', 'values')} in
          the file.
        </Text>
      ) : (
        <Text className="text-sm">
          Nothing in the file said whether a comma means thousands or decimals, so whole numbers are
          assumed.
        </Text>
      )}

      {preview.sampleRows.length > 0 ? (
        <div className="overflow-x-auto">
          <Table size="sm">
            <thead>
              <tr>
                {preview.headers.map((header) => (
                  <th key={header} className="whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row, index) => (
                <tr key={index}>
                  {preview.headers.map((header) => (
                    <td key={header} className="whitespace-nowrap">
                      {row[header.trim().toLowerCase()] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function PlanTable({
  batch,
  onResolve,
  busy,
}: {
  batch: ImportBatchDetail;
  onResolve: (row: ImportRowPlan, action: 'skip' | 'create') => void;
  busy: boolean;
}) {
  const errors = batch.plan.filter((row) => row.outcome === 'error');
  const changes = batch.plan.filter((row) => row.outcome === 'apply');
  const skipped = batch.plan.filter((row) => row.outcome === 'skipped');
  const newItems = errors.filter((row) => row.sku !== null && row.variantId === null);

  return (
    <div className="flex flex-col gap-3">
      {errors.length > 0 ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>{plural(errors.length, 'row', 'rows')} could not be used</AlertTitle>
            <AlertDescription>
              {newItems.length > 0
                ? `${plural(newItems.length, 'row carries a code', 'rows carry codes')} sparx has never seen. Create them as new items, or leave them out — either way the decision is recorded with the import.`
                : 'Sort these out below, or fix them in the file and upload it again. A missing code usually means a whole column is off by one.'}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {errors.length > 0 ? (
        <Table size="sm">
          <thead>
            <tr>
              <th className="w-16">Row</th>
              <th>Code</th>
              <th>What is wrong</th>
              <th className="w-0" />
            </tr>
          </thead>
          <tbody>
            {errors.slice(0, 50).map((row) => (
              <tr key={`error-${row.line}`}>
                <td className="tabular-nums">{row.line}</td>
                <td className="font-mono text-sm">{row.sku ?? '—'}</td>
                <td>
                  <Text className="text-danger text-sm">{row.error}</Text>
                  {row.name ? <Text className="text-sm">{row.name}</Text> : null}
                </td>
                <td className="text-right whitespace-nowrap">
                  <span className="flex justify-end gap-2">
                    {row.sku && !row.variantId ? (
                      <Button
                        color="success"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          onResolve(row, 'create');
                        }}
                      >
                        Create it
                      </Button>
                    ) : null}
                    <Button
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        onResolve(row, 'skip');
                      }}
                    >
                      Leave it out
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {skipped.length > 0 ? (
        <Text className="text-sm">
          {plural(skipped.length, 'row', 'rows')} deliberately left out:{' '}
          {skipped
            .slice(0, 12)
            .map((row) => row.sku ?? `row ${row.line}`)
            .join(', ')}
          {skipped.length > 12 ? '…' : ''}
        </Text>
      ) : null}

      {changes.length > 0 ? (
        <Table size="sm">
          <thead>
            <tr>
              <th className="w-16">Row</th>
              <th>Code</th>
              <th className="text-right">Now</th>
              <th className="text-right">Becomes</th>
              <th className="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {changes.slice(0, 200).map((row) => (
              <tr key={`change-${row.line}`}>
                <td className="tabular-nums">{row.line}</td>
                <td className="font-mono text-sm">{row.sku ?? '—'}</td>
                <td className="text-right tabular-nums">{row.currentOnHand ?? '—'}</td>
                <td className="text-right font-medium tabular-nums">{row.newOnHand ?? '—'}</td>
                <td className="text-right">
                  <Badge color={row.delta > 0 ? 'success' : 'warning'} variant="soft" size="sm">
                    {row.delta > 0 ? '+' : ''}
                    {formatCount(row.delta)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {changes.length > 200 ? (
        <Text className="text-sm">
          Showing the first 200 of {formatCount(changes.length)} changes. All of them will be
          applied.
        </Text>
      ) : null}
    </div>
  );
}

export function StockImportSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);

  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState('recount');
  const [recipeKey, setRecipeKey] = useState('');
  const [profileId, setProfileId] = useState('');
  const [planId, setPlanId] = useState('');
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState('');

  const locations = useStockLocations();
  const recipes = useMigrationRecipes();
  const profiles = useImportProfiles();
  const batches = useImportBatches();
  const plan = useImportBatch(planId);
  const previewImport = usePreviewImport();
  const planImport = usePlanImport();
  const applyImport = useApplyImport();
  const discardImport = useDiscardImport();
  const reverseImport = useReverseImport();
  const resolveRows = useResolveImportRows();
  const saveProfile = useSaveImportProfile();
  const deleteProfile = useDeleteImportProfile();

  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const history = batches.data?.items ?? [];
  const current = plan.data;

  /** The mapping actually in force: what the person has chosen, over what sparx
   *  guessed. Sent with the plan so the server reads the same columns the screen
   *  showed. */
  const effectiveMapping = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const match of preview?.mapping.matches ?? []) {
      const chosen = mapping[match.key] ?? match.header ?? '';
      if (chosen !== '') out[match.key] = chosen;
    }
    return out;
  };

  const requiredSatisfied = (): boolean => {
    const active = effectiveMapping();
    const missing = (preview?.mapping.matches ?? []).filter(
      (match) => match.required && !active[match.key]
    );
    const hasQuantity = active.onHand !== undefined || active.delta !== undefined;
    return missing.length === 0 && hasQuantity;
  };

  const onFile = (file: File): void => {
    void file.text().then((text) => {
      setCsv(text);
      setFilename(file.name);
      setPlanId('');
      setMapping({});
      previewImport.mutate(
        {
          csv: text,
          filename: file.name,
          recipe_key: recipeKey === '' ? null : recipeKey,
          profile_id: profileId === '' ? null : profileId,
        },
        {
          onSuccess: (result) => {
            setPreview(result);
            setProfileName(result.profile?.name ?? '');
            afterCommit(() => {
              toast.add({
                title: `${plural(result.rowCount, 'row', 'rows')} read`,
                description: result.mapping.ready
                  ? 'Check the columns below, then read the file. Nothing has been changed.'
                  : 'Some columns need an answer before this can be read.',
                type: result.mapping.ready ? 'info' : 'warning',
              });
            });
          },
          onError: (error) => {
            setPreview(null);
            afterCommit(() => {
              toast.add({
                title: 'Could not read that file',
                description: stockErrorMessage(error, 'Nothing was changed.'),
                type: 'error',
              });
            });
          },
        }
      );
    });
  };

  const readFile = (): void => {
    planImport.mutate(
      {
        csv,
        filename,
        ...(warehouseId ? { warehouse_id: warehouseId } : {}),
        reason,
        mapping: effectiveMapping(),
        ...(preview?.numberFormat ? { decimal: preview.numberFormat.decimal } : {}),
      },
      {
        onSuccess: (created) => {
          setPlanId(created.id);
          afterCommit(() => {
            toast.add({
              title: `${plural(created.rowsTotal, 'row', 'rows')} read`,
              description:
                created.rowsInvalid > 0
                  ? `${plural(created.rowsInvalid, 'row', 'rows')} need sorting out — nothing has been applied.`
                  : `${plural(created.rowsToApply, 'row', 'rows')} would change. Nothing has been applied yet.`,
              type: created.rowsInvalid > 0 ? 'warning' : 'info',
            });
          });
        },
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not read that file',
              description: stockErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  const resolveRow = (row: ImportRowPlan, action: 'skip' | 'create'): void => {
    if (!current) return;
    resolveRows.mutate(
      {
        id: current.id,
        resolutions: [
          action === 'skip'
            ? { line: row.line, action: 'skip' }
            : {
                line: row.line,
                action: 'create',
                sku: row.sku ?? '',
                title: nameOrCode(row.name, row.sku),
                unitCostCents: row.unitCostCents ?? null,
              },
        ],
      },
      {
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not sort that row out',
              description: stockErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock import controls"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={previewImport.isPending}
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            <Upload className="size-4" aria-hidden />
            Upload a file
          </Button>
        }
        controls={
          <>
            <Button
              color="neutral"
              variant="outline"
              size="sm"
              render={
                <a href={importTemplatePath(warehouseId === '' ? undefined : warehouseId)} download>
                  <Download className="size-4" aria-hidden />
                  Download what you have
                </a>
              }
            />
          </>
        }
        refresh={
          <RefreshButton
            isFetching={batches.isFetching}
            updatedAt={batches.data ? batches.dataUpdatedAt : undefined}
            onRefresh={() => {
              void batches.refetch();
            }}
          />
        }
      />

      {/* Hidden, driven by the toolbar button — a bare file input in the layout
          is the one control nobody can style and everybody notices. */}
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          // Reset so re-uploading the same filename fires a change event.
          event.target.value = '';
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <FormSection
            title="Before you upload"
            description="Where the rows go if they do not say, what the movements are recorded as, and what kind of file this is."
          >
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Location</FieldLabel>
                <NativeSelect
                  color="module"
                  value={warehouseId}
                  onChange={(event) => {
                    setWarehouseId(event.target.value);
                  }}
                >
                  <option value="">Only rows that name one</option>
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>
                <Text className="text-sm">
                  A row with its own location column always wins. Nothing is guessed — a row that
                  names no location, with no default chosen here, is reported as an error rather
                  than landing in the wrong building.
                </Text>
              </Field>

              <Field>
                <FieldLabel>Record these as</FieldLabel>
                <NativeSelect
                  color="module"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                >
                  {REASONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel>Where this file came from</FieldLabel>
                <NativeSelect
                  color="module"
                  value={recipeKey}
                  onChange={(event) => {
                    setRecipeKey(event.target.value);
                  }}
                >
                  <option value="">Let sparx work it out</option>
                  {(recipes.data?.recipes ?? []).map((recipe) => (
                    <option key={recipe.key} value={recipe.key}>
                      {recipe.name}
                    </option>
                  ))}
                </NativeSelect>
                <Text className="text-sm">
                  Only widens the list of headings sparx recognises. It never changes what the
                  import does.
                </Text>
              </Field>

              <Field>
                <FieldLabel>Use a mapping you saved</FieldLabel>
                <NativeSelect
                  color="module"
                  value={profileId}
                  onChange={(event) => {
                    setProfileId(event.target.value);
                  }}
                >
                  <option value="">Match the columns fresh</option>
                  {(profiles.data?.items ?? []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {profile.useCount > 0 ? ` · used ${profile.useCount}×` : ' · not used yet'}
                    </option>
                  ))}
                </NativeSelect>
                {profileId !== '' ? (
                  <Button
                    color="danger"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: 'Forget this saved mapping?',
                          description:
                            'Only the mapping is removed. Nothing you have already imported changes.',
                          confirmLabel: 'Forget it',
                          cancelLabel: 'Keep it',
                          color: 'danger',
                        });
                        if (!ok) return;
                        deleteProfile.mutate(profileId, {
                          onSuccess: () => {
                            setProfileId('');
                          },
                        });
                      })();
                    }}
                  >
                    Forget it
                  </Button>
                ) : null}
              </Field>
            </div>

            <Text className="text-sm">
              The file needs a code column and either a count or a change. Download what you have
              above and you get exactly those columns, already filled in — count the shelves,
              correct the numbers that are wrong, upload it back.
            </Text>
          </FormSection>

          {preview && !current ? (
            <FormSection
              title="What your columns mean"
              description={preview.filename ?? undefined}
              action={
                <Button
                  color="module"
                  size="sm"
                  disabled={!requiredSatisfied() || planImport.isPending}
                  onClick={readFile}
                >
                  Read the file
                </Button>
              }
            >
              <MappingStep
                preview={preview}
                mapping={mapping}
                onChange={(key, header) => {
                  setMapping((previous) => ({ ...previous, [key]: header }));
                }}
              />

              <div className="border-base-300 flex flex-wrap items-end gap-2 border-t pt-3">
                <Field className="min-w-56 flex-1">
                  <FieldLabel>Save this mapping for next time</FieldLabel>
                  <Input
                    color="module"
                    value={profileName}
                    placeholder="Monthly stock export"
                    onChange={(event) => {
                      setProfileName(event.target.value);
                    }}
                  />
                </Field>
                <Button
                  color="neutral"
                  variant="outline"
                  disabled={profileName.trim() === '' || saveProfile.isPending}
                  onClick={() => {
                    saveProfile.mutate(
                      {
                        name: profileName.trim(),
                        mapping: effectiveMapping(),
                        options: {
                          reason,
                          warehouseId: warehouseId === '' ? null : warehouseId,
                          ...(preview.numberFormat
                            ? { decimal: preview.numberFormat.decimal }
                            : {}),
                        },
                        recipeKey: recipeKey === '' ? null : recipeKey,
                      },
                      {
                        onSuccess: (saved) => {
                          setProfileId(saved.id);
                          afterCommit(() => {
                            toast.add({
                              title: `Saved as ${saved.name}`,
                              description:
                                'Next time you upload this report, pick it above and the columns are already answered.',
                              type: 'success',
                            });
                          });
                        },
                        onError: (error) => {
                          afterCommit(() => {
                            toast.add({
                              title: 'Could not save the mapping',
                              description: stockErrorMessage(error, 'Nothing was changed.'),
                              type: 'error',
                            });
                          });
                        },
                      }
                    );
                  }}
                >
                  Save it
                </Button>
              </div>
            </FormSection>
          ) : null}

          {current && current.status === 'planned' ? (
            <FormSection
              title={
                <span className="flex flex-wrap items-center gap-2">
                  What this would do
                  <Badge color="info" variant="soft" size="sm">
                    Nothing applied yet
                  </Badge>
                </span>
              }
              description={current.filename ?? undefined}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    color="neutral"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      discardImport.mutate(current.id, {
                        onSuccess: () => {
                          setPlanId('');
                          setPreview(null);
                          afterCommit(() => {
                            toast.add({ title: 'Thrown away', type: 'info' });
                          });
                        },
                      });
                    }}
                  >
                    Throw it away
                  </Button>
                  <Button
                    color="module"
                    size="sm"
                    disabled={current.rowsToApply === 0 || applyImport.isPending}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: `Apply ${plural(current.rowsToApply, 'change', 'changes')}?`,
                          description: `${formatCount(current.unitsChanged)} units will move. Every one is recorded against this import, so it can be undone as a unit afterwards${
                            current.rowsInvalid > 0
                              ? `. The ${plural(current.rowsInvalid, 'row', 'rows')} with errors will be skipped`
                              : ''
                          }.`,
                          confirmLabel: 'Apply it',
                          cancelLabel: 'Not yet',
                          color: 'module',
                        });
                        if (!ok) return;
                        applyImport.mutate(current.id, {
                          onSuccess: (result) => {
                            afterCommit(() => {
                              toast.add({
                                title: `${plural(result.rowsApplied, 'row', 'rows')} applied`,
                                ...(result.driftedRows > 0
                                  ? {
                                      description: `${plural(
                                        result.driftedRows,
                                        'row',
                                        'rows'
                                      )} had moved since you looked, so the change posted differs from the one shown.`,
                                    }
                                  : {}),
                                type: result.driftedRows > 0 ? 'warning' : 'success',
                              });
                            });
                          },
                          onError: (error) => {
                            afterCommit(() => {
                              toast.add({
                                title: 'Could not apply it',
                                description: stockErrorMessage(error, 'Nothing was changed.'),
                                type: 'error',
                              });
                            });
                          },
                        });
                      })();
                    }}
                  >
                    Apply {formatCount(current.rowsToApply)}
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-2 @md:grid-cols-5">
                <div className="flex flex-col">
                  <Text className="text-2xl font-semibold tabular-nums">
                    {formatCount(current.rowsTotal)}
                  </Text>
                  <Text className="text-sm">Rows read</Text>
                </div>
                <div className="flex flex-col">
                  <Text className="text-success text-2xl font-semibold tabular-nums">
                    {formatCount(current.summary?.matchedCount ?? 0)}
                  </Text>
                  <Text className="text-sm">Matched an item</Text>
                </div>
                <div className="flex flex-col">
                  <Text className="text-2xl font-semibold tabular-nums">
                    {formatCount(current.summary?.newItemCount ?? 0)}
                  </Text>
                  <Text className="text-sm">New codes</Text>
                </div>
                <div className="flex flex-col">
                  <Text className="text-2xl font-semibold tabular-nums">
                    {formatCount(current.rowsNoChange)}
                  </Text>
                  <Text className="text-sm">Already correct</Text>
                </div>
                <div className="flex flex-col">
                  <Text
                    className={`text-2xl font-semibold tabular-nums ${
                      current.rowsInvalid > 0 ? 'text-danger' : ''
                    }`}
                  >
                    {formatCount(current.rowsInvalid)}
                  </Text>
                  <Text className="text-sm">To sort out</Text>
                </div>
              </div>

              <PlanTable batch={current} onResolve={resolveRow} busy={resolveRows.isPending} />
            </FormSection>
          ) : null}

          <FormSection
            title="Files you have imported"
            description="What each one did, and how to undo it."
          >
            {history.length === 0 ? (
              <EmptyState
                icon={<FileSpreadsheet className="size-6" aria-hidden />}
                title="Nothing imported yet"
                description="Download what you have, count the shelves, and upload it back. The differences become stock movements you can trace and undo."
              />
            ) : (
              <Table size="sm" hover>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Outcome</th>
                    <th className="hidden text-right @md:table-cell">Rows</th>
                    <th className="text-right">Units</th>
                    <th className="text-right whitespace-nowrap">When</th>
                    <th className="w-0" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((batch) => (
                    <tr
                      key={batch.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      role="button"
                      onClick={() => {
                        setPlanId(batch.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setPlanId(batch.id);
                      }}
                    >
                      <td className="w-full max-w-0">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{batch.filename ?? 'A spreadsheet'}</span>
                          <span className="truncate text-sm">
                            {batch.warehouseName ?? 'Locations from the file'}
                          </span>
                        </span>
                      </td>
                      <td>
                        <Badge color={importStatusTone(batch.status)} variant="soft" size="sm">
                          {importStatusLabel(batch)}
                        </Badge>
                      </td>
                      <td className="hidden text-right tabular-nums @md:table-cell">
                        {batch.status === 'applied'
                          ? formatCount(batch.rowsApplied)
                          : formatCount(batch.rowsTotal)}
                      </td>
                      <td className="text-right tabular-nums">{formatCount(batch.unitsChanged)}</td>
                      <td className="text-right whitespace-nowrap">
                        <Timestamp value={batch.appliedAt ?? batch.createdAt} format="relative" />
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {batch.status === 'applied' && !batch.reversedAt ? (
                          <Button
                            color="danger"
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void (async () => {
                                const ok = await confirm({
                                  title: `Undo ${batch.filename ?? 'this import'}?`,
                                  description: `Every one of the ${plural(
                                    batch.rowsApplied,
                                    'change',
                                    'changes'
                                  )} it made will be reversed with an opposite movement. Nothing is deleted — the original entries stay on the record, with the undo beside them. Any items it created stay too.`,
                                  confirmLabel: 'Undo it',
                                  cancelLabel: 'Leave it',
                                  color: 'danger',
                                });
                                if (!ok) return;
                                reverseImport.mutate(batch.id, {
                                  onSuccess: () => {
                                    afterCommit(() => {
                                      toast.add({ title: 'Undone', type: 'success' });
                                    });
                                  },
                                  onError: (error) => {
                                    afterCommit(() => {
                                      toast.add({
                                        title: 'Could not undo it',
                                        description: stockErrorMessage(
                                          error,
                                          'Nothing was changed.'
                                        ),
                                        type: 'error',
                                      });
                                    });
                                  },
                                });
                              })();
                            }}
                          >
                            <Undo2 className="size-4" aria-hidden />
                            Undo
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </FormSection>
        </div>
      </div>
    </div>
  );
}
