'use client';

// FITMENT — what this product fits, so a shopper only ever sees parts that work
// with the thing they own.
//
// A product-scoped facet pane, implementing the contract in product-scope.tsx
// verbatim.
//
// ── The data, in one paragraph ───────────────────────────────────────────
//
// A DOMAIN is a kind of thing to match against — vehicles, printers, tractors.
// Each domain declares its axes: `level` axes branch and form a TREE (Make →
// Model → Engine), `range` axes are numeric windows recorded per rule (years,
// weight). A RULE says this product fits one point in that tree — and crucially
// it may stop at ANY depth: a rule attached to "Ford" fits every Ford, and the
// server's lookup treats an ancestor rule as matching a specific query. So the
// picker must let you commit at every level, not only at a leaf.
//
// ── Why the picker drills instead of listing ─────────────────────────────
//
// A real vehicle dictionary is tens of thousands of nodes. A flat list of ids is
// not a fitment editor; neither is a tree that has to be fully loaded to render.
// So it is a column navigator: one level at a time, `GET …/nodes?parentId=`, a
// breadcrumb of where you are, and "everything under here" available at every
// step. Each level is its own long-lived cache entry, so walking back up costs
// nothing.
//
// ── Why the picker is a modal, in an app where a pane is the default ─────
//
// It is a nested picker over work the PANE is holding — the exemption docs/123
// grants `line-editor-modal.tsx` — and the pane declares itself dirty for as
// long as it is open, so the app's unsaved-work safety net still covers it. It
// also wants width the pane may not have: this pane is meant to be docked narrow.
//
// ── There is no Save on this pane, and that is deliberate ────────────────
//
// Every act here commits immediately, because every act here is a discrete
// thing rather than a field in a form: adding a rule is one addition, removing
// one is one removal, and each is meaningful and complete on its own. A draft
// layer over that would be a Save invented to have a Save — and it would put
// the destructive act (removing a rule) inside an ambient "save my changes",
// where nothing names what stops matching.
//
// So removal is its OWN action behind its OWN confirm, naming the exact entry
// and saying what stops happening. Adding goes through `PUT …/fitment`, which
// has no add-one form and replaces the list atomically — so the add sends the
// rules already on the server plus the new one, which is the same write the
// server would have done for an add-one endpoint.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ChevronRight, CornerDownLeft, Layers, Plus, Puzzle, Trash2 } from 'lucide-react';
import { PaneScope } from '../../lib/dock/window-boundary';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  FollowingNotice,
  ProductScopeFallback,
  useProductScope,
  type ProductScope,
} from './product-scope';
import {
  productErrorMessage,
  useDeleteProductFitment,
  useFitmentDomains,
  useFitmentNodes,
  useProductFitment,
  useSaveProductFitment,
  type FitmentDimension,
  type FitmentDomain,
  type ProductFitment,
  type ProductFitmentRange,
} from './products-data';

const LABEL = 'Fitment';
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

type ReadyScope = Extract<ProductScope, { state: 'ready' }>;

/** What the picker hands back — a rule that does not exist on the server yet.
 *  `nodePath` rides along purely so the toast can name what was just added. */
interface NewRule {
  domainId: string;
  nodeId: string | null;
  nodePath: string[];
  ranges: ProductFitmentRange[];
  notes: string | null;
}

/* ── Saying a rule out loud ─────────────────────────────────────────────── */

/**
 * A numeric window in words. "Year 2011–2016", "Weight up to 12000 lb".
 *
 * The unit is dropped when it merely repeats the axis label, which is the common
 * case — the stock vehicle dictionary ships a `Year` axis whose unit is `year`,
 * and printing both gives "Year 2011–2022 year".
 */
function rangeLabel(range: ProductFitmentRange, dimension: FitmentDimension | undefined): string {
  const label = dimension?.label ?? range.dimensionKey;
  const redundant = dimension?.unit?.toLowerCase() === label.toLowerCase();
  const unit = dimension?.unit && !redundant ? ` ${dimension.unit}` : '';
  if (range.min !== null && range.max !== null) {
    return `${label} ${String(range.min)}–${String(range.max)}${unit}`;
  }
  if (range.min !== null) return `${label} ${String(range.min)}${unit} and up`;
  if (range.max !== null) return `${label} up to ${String(range.max)}${unit}`;
  return `${label} — any`;
}

function ruleTitle(rule: { nodePath: string[] }, domain: FitmentDomain | undefined): string {
  if (rule.nodePath.length > 0) return rule.nodePath.join(' › ');
  return `Every ${(domain?.displayName ?? 'thing').toLowerCase()}`;
}

/* ── The picker ─────────────────────────────────────────────────────────── */

interface PickerStep {
  id: string;
  name: string;
}

/**
 * Choose what this product fits, one level at a time.
 *
 * Commits a rule to the caller's DRAFT and nothing else — see the header. The
 * "everything under here" button is present at every depth, including the very
 * top, because a rule that stops at Ford is a legitimate and common thing to
 * mean, not a half-finished one.
 */
function FitmentPicker({
  open,
  domains,
  saving,
  onClose,
  onAdd,
}: {
  open: boolean;
  domains: FitmentDomain[];
  saving: boolean;
  onClose: () => void;
  onAdd: (rule: NewRule) => void;
}) {
  const [domainId, setDomainId] = useState(domains[0]?.id ?? '');
  const [path, setPath] = useState<PickerStep[]>([]);
  const [ranges, setRanges] = useState<Record<string, { min: string; max: string }>>({});
  const [notes, setNotes] = useState('');

  const domain = domains.find((candidate) => candidate.id === domainId);
  const parentId = path.length > 0 ? (path[path.length - 1]?.id ?? null) : null;
  const nodes = useFitmentNodes(open && domainId !== '' ? domainId : null, parentId);
  const children = nodes.data ?? [];

  const rangeDimensions = (domain?.dimensions ?? []).filter(
    (dimension) => dimension.kind === 'range'
  );
  const levelDimensions = (domain?.dimensions ?? []).filter(
    (dimension) => dimension.kind === 'level'
  );
  const currentLevel = levelDimensions[path.length];

  const domainItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const candidate of domains) items[candidate.id] = candidate.displayName;
    return items;
  }, [domains]);

  // Everything typed here is transient and belongs to the pane until it commits,
  // so the pane declares itself dirty on its behalf — an abandoned picker is
  // then covered by the same guard as any other unsaved work.
  useDirtySource(
    path.length > 0 || notes.trim() !== '',
    'You were choosing something this product fits and never added it. Close anyway?'
  );

  const reset = () => {
    setPath([]);
    setRanges({});
    setNotes('');
  };

  const commit = () => {
    if (domainId === '') return;
    const built: ProductFitmentRange[] = [];
    for (const dimension of rangeDimensions) {
      const entry = ranges[dimension.key];
      if (!entry) continue;
      const min = entry.min.trim() === '' ? null : Number(entry.min);
      const max = entry.max.trim() === '' ? null : Number(entry.max);
      if (min === null && max === null) continue;
      built.push({
        dimensionKey: dimension.key,
        min: min !== null && Number.isFinite(min) ? min : null,
        max: max !== null && Number.isFinite(max) ? max : null,
      });
    }
    onAdd({
      domainId,
      nodeId: parentId,
      nodePath: path.map((step) => step.name),
      ranges: built,
      notes: notes.trim() === '' ? null : notes.trim(),
    });
    // No close here. The write is what closes this, on success — dismissing
    // optimistically would hide a failure and leave someone believing a rule
    // exists that does not.
  };

  const here =
    path.length === 0
      ? `every ${(domain?.displayName ?? 'thing').toLowerCase()}`
      : path.map((step) => step.name).join(' › ');

  return (
    // PaneScope portals into the pane that opened it — a modal in a
    // multi-document interface belongs to ONE document, not the whole app.
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Nothing here has reached the server yet, and everything in it is
          // seconds of work re-doable from the same button — so an abandoned
          // picker needs no confirm of its own. The pane-level guard above
          // covers the case that matters: closing the whole pane mid-choice.
          if (!next) {
            reset();
            onClose();
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden">
          <DialogTitle>Add what this fits</DialogTitle>

          <div className="@container flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
            {domains.length > 1 ? (
              <Field>
                <FieldLabel>What kind of thing</FieldLabel>
                <Select
                  color="module"
                  size="sm"
                  items={domainItems}
                  value={domainId}
                  aria-label="What kind of thing"
                  onValueChange={(next) => {
                    setDomainId(next as string);
                    reset();
                  }}
                />
              </Field>
            ) : null}

            {/* Where you are, and the way back. A drill-down with no visible
                path is a maze — you cannot tell a dead end from the bottom. */}
            <div className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                disabled={path.length === 0}
                onClick={() => {
                  setPath([]);
                }}
              >
                {domain?.displayName ?? 'All'}
              </Button>
              {path.map((step, index) => (
                <span key={step.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3 shrink-0" aria-hidden />
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    disabled={index === path.length - 1}
                    onClick={() => {
                      setPath((current) => current.slice(0, index + 1));
                    }}
                  >
                    {step.name}
                  </Button>
                </span>
              ))}
            </div>

            {/* Stopping here is a first-class answer, so it is a real button at
                every depth rather than something you discover by not clicking. */}
            <Button size="sm" color="module" variant="soft" loading={saving} onClick={commit}>
              <CornerDownLeft className="size-4" aria-hidden />
              It fits {here}
            </Button>

            {nodes.isPending && domainId !== '' ? (
              <p className="text-sm" role="status">
                Loading…
              </p>
            ) : nodes.isError ? (
              <Alert color="danger" variant="soft">
                <AlertContent>
                  <AlertTitle>Could not load the list</AlertTitle>
                  <AlertDescription>
                    This is a problem reaching the server. Nothing has been changed.
                  </AlertDescription>
                </AlertContent>
                <Button
                  size="sm"
                  color="danger"
                  variant="soft"
                  onClick={() => {
                    void nodes.refetch();
                  }}
                >
                  Try again
                </Button>
              </Alert>
            ) : children.length === 0 ? (
              <Text className="text-sm">
                Nothing more specific than this is listed, so this is as far as it goes.
              </Text>
            ) : (
              <div className="flex flex-col gap-1">
                <Text className="text-sm font-semibold">
                  {currentLevel?.label ?? 'Narrow it down'}
                </Text>
                <ul className="flex flex-col">
                  {children.map((node) => (
                    <li key={node.id}>
                      {/* A real <button>, not a row with a click handler —
                          keyboard reach and focus come free and correct. */}
                      <button
                        type="button"
                        className="border-base-300 hover:bg-base-200 flex w-full items-center justify-between gap-2 border-b px-2 py-2 text-left"
                        onClick={() => {
                          setPath((current) => [...current, { id: node.id, name: node.name }]);
                        }}
                      >
                        <span className="min-w-0 truncate">{node.name}</span>
                        {node.childCount > 0 ? (
                          <ChevronRight className="size-4 shrink-0" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rangeDimensions.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Text className="text-sm font-semibold">Narrow it further (optional)</Text>
                {rangeDimensions.map((dimension) => (
                  <Field key={dimension.key}>
                    <FieldLabel>
                      {dimension.label}
                      {dimension.unit ? ` (${dimension.unit})` : ''}
                    </FieldLabel>
                    <div className="flex items-center gap-2">
                      <Input
                        color="module"
                        size="sm"
                        type="number"
                        inputMode="numeric"
                        placeholder="From"
                        aria-label={`${dimension.label} from`}
                        value={ranges[dimension.key]?.min ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRanges((current) => ({
                            ...current,
                            [dimension.key]: {
                              min: value,
                              max: current[dimension.key]?.max ?? '',
                            },
                          }));
                        }}
                      />
                      <Text aria-hidden>–</Text>
                      <Input
                        color="module"
                        size="sm"
                        type="number"
                        inputMode="numeric"
                        placeholder="To"
                        aria-label={`${dimension.label} to`}
                        value={ranges[dimension.key]?.max ?? ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRanges((current) => ({
                            ...current,
                            [dimension.key]: {
                              min: current[dimension.key]?.min ?? '',
                              max: value,
                            },
                          }));
                        }}
                      />
                    </div>
                    <FieldDescription>
                      Leave both blank and this rule applies whatever the{' '}
                      {dimension.label.toLowerCase()}.
                    </FieldDescription>
                  </Field>
                ))}
              </div>
            ) : null}

            <Field>
              <FieldLabel>Note (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    size="sm"
                    value={notes}
                    placeholder="Only with the heavy-duty bracket"
                    onChange={(event) => {
                      setNotes(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                A caveat worth remembering. Kept with the rule, for you — not shown to shoppers.
              </FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button size="sm" color="module" loading={saving} onClick={commit}>
              <Plus className="size-4" aria-hidden />
              Add it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

function FitmentBody({
  ctx,
  scope,
  picking,
  setPicking,
}: {
  ctx: SurfaceContext;
  scope: ReadyScope;
  picking: boolean;
  setPicking: (open: boolean) => void;
}) {
  const productId = scope.productId;
  const toast = useToast();
  const confirm = useConfirm();

  const fitment = useProductFitment(productId);
  const domainsQuery = useFitmentDomains();
  const add = useSaveProductFitment(productId);
  const remove = useDeleteProductFitment(productId);

  const domains = domainsQuery.data ?? [];
  // Memoised because `?? []` mints a fresh array every render, which would
  // rebuild the per-domain grouping below on every render of the pane.
  const rules = useMemo(() => fitment.data ?? [], [fitment.data]);

  const byDomain = useMemo(() => {
    const map = new Map<string, ProductFitment[]>();
    for (const rule of rules) {
      const list = map.get(rule.domainId);
      if (list) list.push(rule);
      else map.set(rule.domainId, [rule]);
    }
    return map;
  }, [rules]);

  /**
   * Add one rule.
   *
   * `PUT …/fitment` is a whole-list replace with no add-one form, so the write
   * is "everything already there, plus this". Built from the SERVER's copy
   * rather than anything held locally — there is nothing held locally, which is
   * exactly what makes that safe.
   */
  const onAdd = (rule: NewRule) => {
    const domain = domains.find((candidate) => candidate.id === rule.domainId);
    add.mutate(
      [
        ...rules.map((existing) => ({
          domainId: existing.domainId,
          nodeId: existing.nodeId,
          ranges: existing.ranges,
          notes: existing.notes,
        })),
        { domainId: rule.domainId, nodeId: rule.nodeId, ranges: rule.ranges, notes: rule.notes },
      ],
      {
        onSuccess: () => {
          // Close FIRST, announce after, one tick apart — closing unmounts the
          // picker and withdraws its dirty source, so the toast describes a
          // settled state rather than racing it. (It does not silence Base UI's
          // flushSync warning on toast mount; that is app-wide and fires for
          // every invalidate-then-toast save here.)
          setPicking(false);
          afterPaneChange(() => {
            toast.add({ title: `Now fits ${ruleTitle(rule, domain)}`, type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  /** Remove one rule — its own action, its own confirm, naming the exact entry
   *  and what stops happening because of it. */
  const onRemove = async (rule: ProductFitment) => {
    const domain = domains.find((candidate) => candidate.id === rule.domainId);
    const title = ruleTitle(rule, domain);
    const ok = await confirm({
      title: `Stop saying this fits ${title}?`,
      description: `Anyone filtering your website by what they own will no longer be shown ${scope.product.title} for ${title}, from the moment you confirm. Nothing else about the product changes, and you can add it again — but nothing here remembers the note or the years you had set on it.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(rule.id, {
      onSuccess: () => {
        toast.add({ title: `No longer fits ${title}`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove that',
          description: productErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const body = () => {
    if (fitment.isError || domainsQuery.isError) {
      return (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>Could not load what this product fits</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server. Nothing about the product has changed — it just
              could not be read just now.
            </AlertDescription>
          </AlertContent>
          <Button
            size="sm"
            color="danger"
            variant="soft"
            onClick={() => {
              void fitment.refetch();
              void domainsQuery.refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      );
    }

    if (fitment.isPending || domainsQuery.isPending) {
      return (
        <p className="text-sm" role="status">
          Loading…
        </p>
      );
    }

    // Nothing to match AGAINST is a different problem from nothing matched YET,
    // and the fix is in a different place — so it gets its own state and its own
    // destination rather than an Add button that opens an empty picker.
    if (domains.length === 0) {
      return (
        <EmptyState
          icon={<Layers className="size-6" aria-hidden />}
          title="There is nothing to match against yet"
          description="Before a product can be marked as fitting something, your catalog needs a list of what those things ARE — a list of vehicles, of machine models, of printers. Add one and every product can then be matched against it."
          actions={
            <Button
              size="sm"
              color="module"
              onClick={(event) => {
                ctx.open('commerce.fitment.list', undefined, {
                  target: event.shiftKey ? 'beside' : 'tab',
                });
              }}
            >
              Set up a compatibility list
            </Button>
          }
        />
      );
    }

    if (rules.length === 0) {
      return (
        <EmptyState
          icon={<Puzzle className="size-6" aria-hidden />}
          title="This product is not matched to anything"
          description="Shoppers using “does this fit what I own?” on your website will never be shown this product. Add what it fits and it starts appearing for the right people."
          actions={
            <Button
              size="sm"
              color="module"
              onClick={() => {
                setPicking(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add what it fits
            </Button>
          }
        />
      );
    }

    return (
      <>
        {[...byDomain.entries()].map(([id, list]) => {
          const domain = domains.find((candidate) => candidate.id === id);
          return (
            <section key={id} className="card bg-base-100 flex flex-col gap-3 p-4">
              <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <Heading level={3} className="text-lg font-semibold">
                  {domain?.displayName ?? 'Other'}
                </Heading>
                <Badge color="neutral" variant="outline" size="sm">
                  {list.length === 1 ? '1 entry' : `${String(list.length)} entries`}
                </Badge>
              </div>

              <ul className="flex flex-col">
                {list.map((rule) => (
                  <li
                    key={rule.id}
                    // NOT flex-wrap. In a pane docked at 380px a wrapping row
                    // drops the remove button onto its own line, left-aligned
                    // under the entry it belongs to, where it reads as belonging
                    // to nothing. Pinned right at every width instead.
                    className="border-base-300 flex items-start justify-between gap-2 border-b py-2 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Text className="min-w-0 font-semibold break-words">
                        {ruleTitle(rule, domain)}
                      </Text>
                      {rule.ranges.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {rule.ranges.map((range) => (
                            <Badge key={range.dimensionKey} color="module" variant="soft" size="sm">
                              {rangeLabel(
                                range,
                                domain?.dimensions.find((d) => d.key === range.dimensionKey)
                              )}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {rule.notes === null ? null : <Text className="text-sm">{rule.notes}</Text>}
                    </div>
                    {/* Its own action with its own confirm, naming this exact
                        entry — not a subtraction folded into an ambient Save,
                        where nothing would say what stopped matching. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      color="danger"
                      shape="square"
                      className="shrink-0"
                      aria-label={`Remove ${ruleTitle(rule, domain)}`}
                      title={`Remove ${ruleTitle(rule, domain)}`}
                      onClick={() => {
                        void onRemove(rule);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Fitment actions"
        controls={
          <>
            <Puzzle className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {scope.product.title}
            </Heading>
            {scope.isFollowing ? (
              <Badge color="info" variant="soft" size="sm">
                Following
              </Badge>
            ) : null}
            {/* This pane's primary action, in this pane's own toolbar — not floating
            at the bottom of the list where it would read as belonging to the
            last card rather than to the pane. Its label sheds first when the
            pane is docked narrow; the icon carries it. */}
            {rules.length > 0 && domains.length > 0 ? (
              <Button
                size="sm"
                color="module"
                className="ml-auto"
                onClick={() => {
                  setPicking(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                <span className="hidden @md:inline">Add what it fits</span>
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className={rules.length > 0 && domains.length > 0 ? undefined : 'ml-auto'}
            isFetching={fitment.isFetching}
            updatedAt={fitment.dataUpdatedAt}
            onRefresh={() => {
              void fitment.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <FollowingNotice scope={scope} />
          {body()}
        </div>
      </div>

      {/* Mounted only while open, so every visit starts at the top of the tree
          rather than wherever the last one was abandoned. */}
      {picking ? (
        <FitmentPicker
          open
          domains={domains}
          saving={add.isPending}
          onClose={() => {
            setPicking(false);
          }}
          onAdd={onAdd}
        />
      ) : null}
    </div>
  );
}

export function ProductFitmentSurface({ ctx }: { ctx: SurfaceContext }) {
  // Whether the picker is open lives HERE, above the scope hook, so `hold` can
  // be answered: a FOLLOWING pane that re-points while someone is three levels
  // into choosing a vehicle throws that choice away with no dialog.
  //
  // There is no draft beyond that, and no Save — every act on this pane commits
  // on its own. See the header.
  const [picking, setPicking] = useState(false);
  const scope = useProductScope(ctx, { label: LABEL, hold: picking });

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} />;
  }
  // Keyed on the product so a following pane that DID move starts clean rather
  // than carrying one product's state onto the next.
  return (
    <FitmentBody
      key={scope.productId}
      ctx={ctx}
      scope={scope}
      picking={picking}
      setPicking={setPicking}
    />
  );
}
