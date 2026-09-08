'use client';

// One saved piece — rename it, see its reach, and jump to the editor to change
// how it looks.
//
// This pane is MANAGE-only: a piece is created in the studio (build, select,
// "save as a piece"), so there is no `{ id: 'new' }` state here. The identity
// (name, description) is edited on an explicit Save, last-write-wins, like every
// other editor; the DESIGN is edited in `builder.piece`, which this pane hands
// off to rather than trying to render — a faithful visual preview needs the
// tenant compile, and that lives in the editor.
//
// NOT built on EditorLayout: there is a small form here but no running summary
// rail, so a bento would float a near-empty rail beside it. One centred, capped
// column instead, with the reach and the fields as the point.
//
// The name is this pane's identity AND its editable field — never both a heading
// and a field. Actions (Edit design, Save, Delete) live in the pane header and
// under a divider, not as cards competing with the work.

import { useEffect, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { faPencil, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import { UsagePanel } from './saved-piece-usage';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { tenantSymbolId } from '../../lib/studio/saved-pieces';
import {
  countBlocks,
  formatDate,
  groupMeta,
  pieceErrorMessage,
  usageState,
  useDeletePiece,
  useSavedPiece,
  useSavedPieceUsage,
  useUpdatePiece,
  type Piece,
} from './saved-pieces-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function SavedPieceDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const key = typeof ctx.params.key === 'string' ? ctx.params.key : '';
  const {
    data: piece,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useSavedPiece(key);

  useEffect(() => {
    if (piece) ctx.setTitle(piece.name);
  }, [ctx, piece]);

  if (key === '') {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            title="No piece to show"
            description="This pane opened without a piece to manage. Open one from the Saved pieces list."
          />
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="piece"
            title="Could not load this piece"
            description="This is a problem reaching the server. The piece itself is unaffected."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !piece) {
    return <PaneWaiting />;
  }

  return (
    <ManagePiece
      ctx={ctx}
      pieceKey={key}
      piece={piece}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
    />
  );
}

interface Draft {
  name: string;
  description: string;
}

function serializeDraft(draft: Draft): string {
  return JSON.stringify({ name: draft.name.trim(), description: draft.description.trim() });
}

function ManagePiece({
  ctx,
  pieceKey,
  piece,
  isFetching,
  dataUpdatedAt,
  refetch,
}: {
  ctx: SurfaceContext;
  pieceKey: string;
  piece: Piece;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdatePiece(pieceKey);
  const del = useDeletePiece(pieceKey);
  const usage = useSavedPieceUsage(pieceKey);

  const [draft, setDraft] = useState<Draft>({
    name: piece.name,
    description: piece.description ?? '',
  });
  const initialRef = useRef<string>(
    serializeDraft({ name: piece.name, description: piece.description ?? '' })
  );
  // Initialise ONCE per piece key. Re-seeding on every background refetch would
  // wipe an in-progress rename; Save resets the snapshot itself (below).
  const initializedFor = useRef<string>(pieceKey);
  useEffect(() => {
    if (initializedFor.current === pieceKey) return;
    initializedFor.current = pieceKey;
    const next: Draft = { name: piece.name, description: piece.description ?? '' };
    setDraft(next);
    initialRef.current = serializeDraft(next);
  }, [pieceKey, piece.name, piece.description]);

  const nameEmpty = draft.name.trim() === '';
  const dirty = serializeDraft(draft) !== initialRef.current;
  useDirtySource(dirty, 'You have unsaved changes to this piece. Close anyway?');

  const meta = groupMeta(piece.group);
  // Whichever half this piece stores its design in — a silica piece has no legacy
  // tree, and counting only that one would report every current piece as empty.
  const blocks = countBlocks(piece.silicaTree ?? piece.tree);

  const usageTotal = usage.data?.total ?? 0;
  const state = usageState(usageTotal);
  // Only trust "deletable" once reach has actually loaded — deleting while a
  // stale 0 is showing is how a live placement gets orphaned.
  const usageKnown = usage.isSuccess;
  const inUse = usageKnown && usageTotal > 0;
  // BEING USED AND BEING BLOCKED ARE DIFFERENT. A piece the current editor placed
  // detaches on delete — the page keeps the design and stops following the master
  // — so it is used without standing in the way. Only an old-style placement
  // refuses. Reading `total` as the block is how this pane would tell her she
  // cannot delete something the server would delete happily.
  const blockedTotal = usage.data?.blocking ?? 0;
  const blocked = usageKnown && blockedTotal > 0;

  const save = () => {
    if (nameEmpty) return;
    update.mutate(
      {
        name: draft.name.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
      },
      {
        onSuccess: (saved) => {
          const next: Draft = { name: saved.name, description: saved.description ?? '' };
          setDraft(next);
          initialRef.current = serializeDraft(next);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: pieceErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const editDesign = (event: { shiftKey: boolean; altKey: boolean }) => {
    // The piece pane opens the master itself, so every page using it repaints as
    // this is edited. It takes the SYMBOL id, not the library key.
    const target = event.altKey ? 'window' : event.shiftKey ? 'beside' : 'tab';
    ctx.open('builder.piece', { pieceId: tenantSymbolId(piece.key) }, { target });
  };

  const onDelete = async () => {
    // The confirm says what will HAPPEN to her pages, which is not the same
    // sentence in both cases. Unplaced: nothing changes anywhere. Placed: every
    // page keeps the design exactly as it looks and simply stops following this
    // piece — silica detaches rather than leaving a hole, and saying "nothing
    // your visitors see will change" over a placed piece was false (issue 393).
    // A piece with an old-style placement never reaches here; Delete is disabled.
    const ok = await confirm({
      title: `Delete “${piece.name}”?`,
      description: inUse
        ? `This removes the piece and its whole history for good. ${
            usageTotal === 1 ? 'The page' : 'The pages'
          } it is on will keep the design exactly as it looks now and simply stop following it, so nothing your visitors see will change. You will not be able to change ${
            usageTotal === 1 ? 'it' : 'them'
          } from one place any more. This cannot be undone.`
        : 'This removes the piece and its whole history for good. It is not on any of your pages, so nothing your visitors see will change. This cannot be undone.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${piece.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this piece',
          // If it was placed between load and now, the server says so exactly.
          description: pieceErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Saved piece actions"
        status={
          <Badge color={state.tone} variant="soft" size="sm">
            {usage.isPending ? 'Checking reach…' : state.label}
          </Badge>
        }
        // Save is `primary`, never `controls`: `controls` relocates into the
        // overflow popover under 672px, and a commit action must be reachable
        // at every width. Enforced by scripts/check-toolbar-primary.mjs.
        primary={
          <Button
            size="sm"
            color="module"
            disabled={!dirty || nameEmpty}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        }
        controls={
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Offered ONLY when the editor can actually open it. A piece built in the
              retired builder stores its design in a format nothing left can read, so
              this button would open an empty canvas and leave the owner thinking
              their piece had been lost. The alert below says what is true instead. */}
            <Button
              size="sm"
              variant="outline"
              color="module"
              disabled={!piece.placeable}
              onClick={editDesign}
            >
              <Icon glyph={faPencil} className="size-4" aria-hidden />
              Edit design
            </Button>
          </div>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching || usage.isFetching}
            updatedAt={dataUpdatedAt}
            onRefresh={() => {
              refetch();
              void usage.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* ONE status line, the most specific true thing: how far this piece
              reaches and what changing it therefore touches. */}
          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>
                {usage.isPending ? 'Checking where this is used…' : state.label}
              </AlertTitle>
              <AlertDescription>
                {usage.isError
                  ? 'We could not check where this piece is used just now. Everything else here still works — try Refresh.'
                  : usage.isPending
                    ? 'Looking at every page and layout to see where this piece appears.'
                    : state.detail}
              </AlertDescription>
            </AlertContent>
          </Alert>

          {piece.placeable ? null : (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>This piece can&apos;t be opened in the editor</AlertTitle>
                <AlertDescription>
                  It was built in an earlier version of the site editor, and its design is saved in
                  a form the current one can&apos;t read. Its name and notes are still yours to edit
                  here, and anywhere it&apos;s already placed keeps working — but to change how it
                  looks you&apos;ll need to build it again as a new piece.
                </AlertDescription>
              </AlertContent>
            </Alert>
          )}

          <FormSection
            title="Details"
            description="The name and note are how you recognize this piece — in this list and in the editor's Add panel."
          >
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.name}
                    placeholder="Hero banner"
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, name: event.target.value }));
                    }}
                  />
                }
              />
              {nameEmpty ? (
                <FieldDescription>A piece needs a name so you can find it again.</FieldDescription>
              ) : (
                <FieldDescription>Reference: {piece.key}</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>What it&apos;s for</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={draft.description}
                    placeholder="A one-line reminder of what this is and where it goes. Optional."
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, description: event.target.value }));
                    }}
                  />
                }
              />
              <FieldDescription>
                {meta.label} · Built from {blocks === 1 ? '1 block' : `${String(blocks)} blocks`} ·
                Added {formatDate(piece.createdAt)}
              </FieldDescription>
            </Field>
          </FormSection>

          <UsagePanel
            ctx={ctx}
            usage={usage.data}
            isPending={usage.isPending}
            isError={usage.isError}
          />

          {/* Destructive action as a plain row under a divider — not a card with
              equal weight to the work above it. Deletion is only possible when the
              piece is used nowhere; while it is in use, we say why, plainly. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this piece</Text>
              <Text className="text-sm">
                {blocked
                  ? `You can't delete this while it's on ${
                      blockedTotal === 1 ? '1 page' : `${String(blockedTotal)} places`
                    } built the old way. Remove it from those in the editor first — otherwise they'd be left with a hole.`
                  : !usageKnown
                    ? 'Checking where this is used before this can be deleted.'
                    : inUse
                      ? `Removes it for good. ${
                          usageTotal === 1 ? 'The page' : 'The pages'
                        } it is on will keep the design and stop following it. This cannot be undone.`
                      : 'Removes it and its history for good. This cannot be undone.'}
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="danger"
              disabled={!usageKnown || blocked}
              loading={del.isPending}
              onClick={() => {
                void onDelete();
              }}
            >
              <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
