'use client';

// The legal-pages checklist — the policy documents a business is expected to
// publish, and where they link on the site.
//
// This is NOT a table. It is a short, fixed set of documents (privacy, terms,
// cookies, and — with commerce on — returns/shipping/refund), each of which is a
// one-line thing with a state and a next action. So it reads as a card per group
// (the ones you are required to have, then the optional extras) with a row per
// document, the document's own name as the content and one status badge on the
// right — never a grouped table inventing columns to justify itself.
//
// The surface owns three jobs: the checklist, instantiating a page from a
// starter template, and acknowledging that starter wording has been reviewed —
// plus managing the footer links (placements) at the bottom. It owns NO prose
// editor: a legal page is an ordinary content entry, so "Edit text" hands off to
// the one content editor the app already has (`cms.content.detail`). Building a
// second editor here would be building it twice.
//
// Everything here commits immediately (create, acknowledge, link, unlink), so
// there is no draft and no unsaved-work guard — each action is its own confirm or
// its own button, done in one click.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  NativeSelect,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Check, Eye, EyeOff, Link2, Plus, RefreshCw, Scale, SquarePen, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { contentErrorMessage, entryStatusState } from './data';
import {
  legalItemStatus,
  legalKindBlurb,
  useAcknowledgeLegalPage,
  useTakeStarterWording,
  useAddPlacement,
  useInstantiateLegalPage,
  useLegalChecklist,
  useLegalPlacements,
  useRemovePlacement,
  useSetPlacementEnabled,
  type ChecklistItem,
  type LegalPlacement,
} from './legal-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** Same modifier contract as every other list in the app — Shift alongside, Alt
 *  a new window. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function LegalListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();

  const checklist = useLegalChecklist();
  const placements = useLegalPlacements();

  const instantiate = useInstantiateLegalPage();
  const acknowledge = useAcknowledgeLegalPage();
  const takeStarter = useTakeStarterWording();

  const items = checklist.data?.items ?? [];
  const completeness = checklist.data?.completeness;
  const requiredItems = items.filter((item) => item.required);
  const optionalItems = items.filter((item) => !item.required);

  const allRequiredReady =
    completeness !== undefined &&
    completeness.requiredTotal > 0 &&
    completeness.requiredComplete === completeness.requiredTotal;

  const editText = (item: ChecklistItem, event: { shiftKey: boolean; altKey: boolean }) => {
    if (!item.entry) return;
    ctx.open('cms.content.detail', { id: item.entry.id }, { target: targetFor(event) });
  };

  const addPage = async (item: ChecklistItem) => {
    const ok = await confirm({
      title: `Add your ${item.title.toLowerCase()}?`,
      description:
        'This creates a private draft from a sparx starter template, so you have something to work from rather than a blank page. The starter wording is a starting point, not legal advice — read it through and make it fit your business before you publish. It will also be linked in your site footer.',
      confirmLabel: 'Add it',
      cancelLabel: 'Cancel',
      color: 'module',
    });
    if (!ok) return;
    instantiate.mutate(item.legalKind, {
      onSuccess: () => {
        toast.add({
          title: `${item.title} added as a draft`,
          description: 'Read the starter wording, make it yours, then publish it.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not add this page',
          description: contentErrorMessage(error, 'Nothing was created.'),
          type: 'error',
        });
      },
    });
  };

  /**
   * Take the newer starter wording.
   *
   * The confirm has to say two different things because two different things are
   * at stake. A page she has never edited loses nothing. A page she HAS edited
   * loses her words from the live page — recoverable from the page's history,
   * which is why the sentence says so rather than just warning her off.
   */
  const takeWording = async (item: ChecklistItem) => {
    const entry = item.entry;
    if (!entry) return;
    const live = entry.status === 'published';
    const ok = await confirm({
      title: `Use the new wording for your ${item.title.toLowerCase()}?`,
      description: `Everything on this page is replaced with the current starter wording${
        live ? ', and your live page changes straight away' : ''
      }. What is on it now is kept in the page’s history, so you can get it back. You will need to read the new wording and mark it reviewed.`,
      confirmLabel: 'Use the new wording',
      cancelLabel: 'Leave it as it is',
      color: 'warning',
    });
    if (!ok) return;
    takeStarter.mutate(entry.id, {
      onSuccess: () => {
        toast.add({
          title: `${item.title} now uses the new wording`,
          description: 'Read it through and mark it reviewed.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not update the wording',
          description: contentErrorMessage(error, 'The page is unchanged.'),
          type: 'error',
        });
      },
    });
  };

  const acknowledgePage = async (item: ChecklistItem) => {
    if (!item.entry) return;
    const ok = await confirm({
      title: `Mark your ${item.title.toLowerCase()} as reviewed?`,
      description:
        'Confirm you have read the starter wording and made it fit your business. This is not legal advice — if you are unsure, check it with your own advisor. This only clears the “needs review” note; it does not publish the page.',
      confirmLabel: 'I have reviewed it',
      cancelLabel: 'Not yet',
      color: 'module',
    });
    if (!ok) return;
    acknowledge.mutate(item.entry.id, {
      onSuccess: () => {
        toast.add({ title: `${item.title} marked as reviewed`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not update this',
          description: contentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Legal pages controls"
        controls={
          <>
            {completeness ? (
              <Badge
                color={allRequiredReady ? 'success' : 'info'}
                variant="soft"
                size="sm"
                className="whitespace-nowrap"
              >
                {allRequiredReady
                  ? 'All required pages ready'
                  : `${completeness.requiredComplete} of ${completeness.requiredTotal} required ready`}
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={checklist.isFetching}
            updatedAt={checklist.data ? checklist.dataUpdatedAt : undefined}
            onRefresh={() => {
              void checklist.refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {checklist.isError ? (
          <EmptyState
            icon={<Scale className="size-6" aria-hidden />}
            title="Could not load your legal pages"
            description="This is a problem reaching the server. None of your pages are affected — nothing has been lost."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void checklist.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : checklist.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className="p-3 @lg:p-4">
            <div className={COLUMN}>
              <div className="flex flex-col gap-1">
                <Heading level={1} className="text-2xl font-semibold">
                  Legal pages
                </Heading>
                <Text>
                  The policy pages people expect to find on your site. Add each one from a starter
                  template, make the wording fit your business, then publish it.
                </Text>
              </div>

              {completeness ? (
                <Alert color={allRequiredReady ? 'success' : 'info'} variant="soft">
                  <AlertContent>
                    <AlertTitle>
                      {allRequiredReady
                        ? 'Your required pages are all set'
                        : `${completeness.requiredComplete} of ${completeness.requiredTotal} required pages ready`}
                    </AlertTitle>
                    <AlertDescription>
                      {allRequiredReady
                        ? 'Every page you are expected to have is published, up to date, and linked in your footer.'
                        : 'A page counts as ready once it is published, built on the latest starter wording, and linked in your footer.'}
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}

              {requiredItems.length > 0 ? (
                <FormSection
                  title="Pages you should have"
                  description="These are the policies a business like yours is normally expected to publish."
                >
                  <ChecklistRows
                    items={requiredItems}
                    onAdd={(item) => {
                      void addPage(item);
                    }}
                    onEdit={editText}
                    onAcknowledge={(item) => {
                      void acknowledgePage(item);
                    }}
                    addingKind={instantiate.isPending ? instantiate.variables : undefined}
                    onTakeWording={(item) => {
                      void takeWording(item);
                    }}
                    acknowledgingId={acknowledge.isPending ? acknowledge.variables : undefined}
                    takingWordingId={takeStarter.isPending ? takeStarter.variables : undefined}
                  />
                </FormSection>
              ) : null}

              {optionalItems.length > 0 ? (
                <FormSection
                  title="Optional pages"
                  description="Helpful to have, but not required. Add one if it fits how you do business."
                >
                  <ChecklistRows
                    items={optionalItems}
                    onAdd={(item) => {
                      void addPage(item);
                    }}
                    onEdit={editText}
                    onAcknowledge={(item) => {
                      void acknowledgePage(item);
                    }}
                    addingKind={instantiate.isPending ? instantiate.variables : undefined}
                    onTakeWording={(item) => {
                      void takeWording(item);
                    }}
                    acknowledgingId={acknowledge.isPending ? acknowledge.variables : undefined}
                    takingWordingId={takeStarter.isPending ? takeStarter.variables : undefined}
                  />
                </FormSection>
              ) : null}

              <PlacementsSection ctx={ctx} items={items} placements={placements} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── The checklist rows ─────────────────────────────────────────────────── */

interface ChecklistRowsProps {
  items: ChecklistItem[];
  onAdd: (item: ChecklistItem) => void;
  onEdit: (item: ChecklistItem, event: { shiftKey: boolean; altKey: boolean }) => void;
  onAcknowledge: (item: ChecklistItem) => void;
  onTakeWording: (item: ChecklistItem) => void;
  /** The legalKind currently being instantiated, so only its row shows a spinner. */
  addingKind: string | undefined;
  /** The entry id currently being acknowledged. */
  acknowledgingId: string | undefined;
  /** The entry id currently taking the newer starter wording. */
  takingWordingId: string | undefined;
}

function ChecklistRows({
  items,
  onAdd,
  onEdit,
  onAcknowledge,
  onTakeWording,
  addingKind,
  acknowledgingId,
  takingWordingId,
}: ChecklistRowsProps) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const status = legalItemStatus(item);
        const entry = item.entry;
        // Acknowledging only clears the "unreviewed starter wording" note — it
        // cannot resolve a newer-version-available (stale) page, whose real fix
        // is editing the text. So it is offered only when that is the whole story.
        const showAcknowledge = entry !== null && !entry.acknowledged && !status.stale;

        return (
          <li
            key={item.legalKind}
            className="border-base-300 flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0"
          >
            <div className="flex min-w-0 flex-[1_1_16rem] flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <Text className="font-medium">{item.title}</Text>
                <Badge color={status.tone} variant="soft" size="sm">
                  {status.label}
                </Badge>
              </div>
              <Text className="text-sm">{legalKindBlurb(item.legalKind)}</Text>
              {status.detail ? <Text className="text-sm">{status.detail}</Text> : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {entry === null ? (
                <Button
                  size="sm"
                  color="module"
                  loading={addingKind === item.legalKind}
                  onClick={() => {
                    onAdd(item);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add
                </Button>
              ) : (
                <>
                  {status.stale ? (
                    <Button
                      size="sm"
                      color="warning"
                      loading={takingWordingId === entry.id}
                      onClick={() => {
                        onTakeWording(item);
                      }}
                    >
                      <RefreshCw className="size-4" aria-hidden />
                      Use the new wording
                    </Button>
                  ) : null}
                  {showAcknowledge ? (
                    <Button
                      size="sm"
                      variant="soft"
                      color="warning"
                      loading={acknowledgingId === entry.id}
                      onClick={() => {
                        onAcknowledge(item);
                      }}
                    >
                      <Check className="size-4" aria-hidden />
                      Mark reviewed
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    color="neutral"
                    title="Open the editor — hold Shift to open alongside, Alt for a new window"
                    onClick={(event) => {
                      onEdit(item, event);
                    }}
                  >
                    <SquarePen className="size-4" aria-hidden />
                    Edit text
                  </Button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Footer placements ──────────────────────────────────────────────────── */

interface PlacementsSectionProps {
  ctx: SurfaceContext;
  items: ChecklistItem[];
  placements: ReturnType<typeof useLegalPlacements>;
}

function PlacementsSection({ items, placements }: PlacementsSectionProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const add = useAddPlacement();
  const setEnabled = useSetPlacementEnabled();
  const remove = useRemovePlacement();

  const [pick, setPick] = useState('');

  const rows = placements.data ?? [];

  // A page can be linked only if it exists AND is not already in the footer.
  const placedEntryIds = useMemo(
    () =>
      new Set(
        (placements.data ?? []).map((row) => row.entryId).filter((id): id is string => id !== null)
      ),
    [placements.data]
  );
  const candidates = useMemo(
    () => items.filter((item) => item.entry !== null && !placedEntryIds.has(item.entry.id)),
    [items, placedEntryIds]
  );

  // Names for the footer rows: prefer the placement's own label, then the
  // document's proper name, then its address — never a blank row.
  const titleByEntryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.entry) map.set(item.entry.id, item.title);
    }
    return map;
  }, [items]);

  const linkChosen = () => {
    const item = candidates.find((candidate) => candidate.entry?.id === pick);
    if (!item?.entry) return;
    add.mutate(
      { entryId: item.entry.id, label: item.title },
      {
        onSuccess: () => {
          setPick('');
          toast.add({ title: `${item.title} linked in your footer`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not link this page',
            description: contentErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const toggle = (row: LegalPlacement) => {
    setEnabled.mutate(
      { id: row.id, enabled: !row.enabled },
      {
        onError: (error) => {
          toast.add({
            title: 'Could not change this link',
            description: contentErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const removeRow = async (row: LegalPlacement) => {
    const name = placementName(row, titleByEntryId);
    const ok = await confirm({
      title: `Remove “${name}” from your footer?`,
      description:
        'This only takes the link out of your footer — the page itself, and everything on it, stays exactly as it is. You can link it again whenever you like.',
      confirmLabel: 'Remove the link',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(row.id, {
      onSuccess: () => {
        toast.add({ title: `${name} unlinked from your footer`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this link',
          description: contentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <FormSection
      title="Links in your footer"
      description="The legal pages people can reach from the footer at the bottom of every page."
    >
      {placements.isError ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>Could not load your footer links</AlertTitle>
            <AlertDescription>This is a problem reaching the server.</AlertDescription>
          </AlertContent>
          <Button
            size="sm"
            color="warning"
            variant="soft"
            onClick={() => {
              void placements.refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      ) : placements.isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : (
        <>
          {rows.length === 0 ? (
            <Text className="text-sm">
              No legal pages are linked in your footer yet. Add one below so visitors can find it.
            </Text>
          ) : (
            <ul className="flex flex-col">
              {rows.map((row) => {
                const name = placementName(row, titleByEntryId);
                const state = row.status ? entryStatusState(row.status) : null;
                return (
                  <li
                    key={row.id}
                    className="border-base-300 flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-[1_1_16rem] flex-col">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link2 className="size-4 shrink-0" aria-hidden />
                        <Text className="font-medium">{name}</Text>
                        {!row.enabled ? (
                          <Badge color="neutral" variant="soft" size="sm">
                            Hidden
                          </Badge>
                        ) : null}
                        {state ? (
                          <Badge color={state.tone} variant="soft" size="sm">
                            {state.label}
                          </Badge>
                        ) : null}
                      </div>
                      <Text className="text-sm">
                        {row.propertyId === null
                          ? 'Shown on every site you run.'
                          : 'Shown on this site only.'}
                        {row.slug ? ` · /${row.slug}` : ''}
                      </Text>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        color="neutral"
                        loading={setEnabled.isPending && setEnabled.variables?.id === row.id}
                        title={
                          row.enabled ? 'Hide this link without removing it' : 'Show this link'
                        }
                        onClick={() => {
                          toggle(row);
                        }}
                      >
                        {row.enabled ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                        {row.enabled ? 'Hide' : 'Show'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        color="danger"
                        loading={remove.isPending && remove.variables === row.id}
                        onClick={() => {
                          void removeRow(row);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {candidates.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <label className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
                <span className="text-sm font-medium">Link another page</span>
                <NativeSelect
                  color="module"
                  value={pick}
                  aria-label="Choose a page to link in your footer"
                  onChange={(event) => {
                    setPick(event.target.value);
                  }}
                >
                  <option value="">Choose a page…</option>
                  {candidates.map((item) => (
                    <option key={item.legalKind} value={item.entry?.id ?? ''}>
                      {item.title}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <Button
                size="sm"
                color="module"
                disabled={pick === ''}
                loading={add.isPending}
                onClick={linkChosen}
              >
                <Plus className="size-4" aria-hidden />
                Link to footer
              </Button>
            </div>
          ) : rows.length > 0 ? (
            <Text className="text-sm">
              Every legal page you have added is already linked. Add a new page above to link more.
            </Text>
          ) : null}
        </>
      )}
    </FormSection>
  );
}

/** The best available name for a footer link: its own label, then the document's
 *  proper name, then its address, then a safe fallback. */
function placementName(row: LegalPlacement, titleByEntryId: Map<string, string>): string {
  if (row.label && row.label.trim() !== '') return row.label.trim();
  if (row.entryId) {
    const title = titleByEntryId.get(row.entryId);
    if (title) return title;
  }
  if (row.slug) return `/${row.slug}`;
  return 'Legal page';
}
