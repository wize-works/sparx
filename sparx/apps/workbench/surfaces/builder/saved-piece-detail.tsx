'use client';

// One saved piece — rename it, see its reach, and jump to the editor to change
// how it looks.
//
// This pane is MANAGE-only: a piece is created in the studio (build, select,
// "save as a piece"), so there is no `{ id: 'new' }` state here. The identity
// (name, description) is edited on an explicit Save, last-write-wins, like every
// other editor; the DESIGN is edited in `builder.studio`, which this pane hands
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
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Text,
  Textarea,
  Input,
  useToast,
} from '@wizeworks/silicaui-react';
import { FileText, LayoutTemplate, Pencil, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
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
  type PieceUsage,
} from './saved-pieces-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function SavedPieceDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const key = typeof ctx.params.key === 'string' ? ctx.params.key : '';
  const {
    data: piece,
    isPending,
    isError,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useSavedPiece(key);

  useEffect(() => {
    if (piece) ctx.setTitle(piece.name);
  }, [ctx, piece]);

  if (key === '') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert color="error" className="max-w-md">
          <AlertContent>
            <AlertTitle>No piece to show</AlertTitle>
            <AlertDescription>
              This pane opened without a piece to manage. Open one from the Saved pieces list.
            </AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert color="error" className="max-w-md">
          <AlertContent>
            <AlertTitle>Could not load this piece</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server. The piece itself is unaffected.
            </AlertDescription>
          </AlertContent>
          <Button
            size="sm"
            color="error"
            variant="soft"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      </div>
    );
  }

  if (isPending || !piece) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
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
    // Hands the visual editing to the studio. The piece is materialized there as the
    // symbol `tenant:<key>`, so the key is all that travels and the studio enters
    // that master (`ApplyInitialPiece`). Editing it updates every place it appears.
    const target = event.altKey ? 'window' : event.shiftKey ? 'beside' : 'tab';
    ctx.open('builder.studio', { componentId: piece.key }, { target });
  };

  const onDelete = async () => {
    // The server refuses a delete while the piece is placed, so we never offer a
    // proceed path that would just 400. Deletion is only presented when reach is
    // known to be zero; the confirm still names the piece and is explicit that it
    // cannot be undone.
    const ok = await confirm({
      title: `Delete “${piece.name}”?`,
      description:
        'This removes the piece and its whole history for good. It is not on any of your pages, so nothing your visitors see will change. This cannot be undone.',
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
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {usage.isPending ? 'Checking reach…' : state.label}
            </Badge>
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
                <Pencil className="size-4" aria-hidden />
                Edit design
              </Button>
              <Button
                size="sm"
                color="module"
                disabled={!dirty || nameEmpty}
                loading={update.isPending}
                onClick={save}
              >
                Save
              </Button>
            </div>
          </>
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
            description="The name and note are how you recognise this piece — in this list and in the editor's Add panel."
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

          <UsagePanel usage={usage.data} isPending={usage.isPending} isError={usage.isError} />

          {/* Destructive action as a plain row under a divider — not a card with
              equal weight to the work above it. Deletion is only possible when the
              piece is used nowhere; while it is in use, we say why, plainly. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this piece</Text>
              <Text className="text-sm">
                {inUse
                  ? `You can't delete this while it's on ${
                      usageTotal === 1 ? '1 page' : `${String(usageTotal)} places`
                    }. Remove it from those in the editor first — otherwise they'd be left with a hole.`
                  : usageKnown
                    ? 'Removes it and its history for good. This cannot be undone.'
                    : 'Checking where this is used before this can be deleted.'}
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="danger"
              disabled={!usageKnown || inUse}
              loading={del.isPending}
              onClick={() => {
                void onDelete();
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Where it's used ────────────────────────────────────────────────────── */

function UsagePanel({
  usage,
  isPending,
  isError,
}: {
  usage: PieceUsage | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  const rows = usage
    ? [
        ...usage.pages.map((page) => ({ ...page, kind: 'Page' as const })),
        ...usage.layouts.map((layout) => ({ ...layout, kind: 'Layout' as const })),
      ]
    : [];

  return (
    <FormSection
      title="Where it's used"
      description="Every page and layout this piece appears on. Change it here or in the editor and all of these update together."
    >
      {isError ? (
        <Text className="text-sm">Could not check where this is used just now.</Text>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Checking…
        </Text>
      ) : rows.length === 0 ? (
        <Text className="text-sm">
          This piece isn&apos;t on any page or layout yet. Add it to a page in the editor and it
          will appear here.
        </Text>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.id}`}
              className="border-base-300 flex items-center gap-3 border-b py-2 last:border-b-0"
            >
              {row.kind === 'Page' ? (
                <FileText className="size-4 shrink-0" aria-hidden />
              ) : (
                <LayoutTemplate className="size-4 shrink-0" aria-hidden />
              )}
              <Text className="min-w-0 flex-1 truncate font-medium">{row.name}</Text>
              <Badge color="neutral" variant="soft" size="sm" className="shrink-0">
                {row.kind}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}
