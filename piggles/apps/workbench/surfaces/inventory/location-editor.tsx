'use client';

// The location form: one pane that both creates and edits, because the two
// differ by which fields are required rather than by what they are.

import { useEffect, useState } from 'react';
import { Badge, Button, Text } from '@wizeworks/silicaui-react';
import { faFloppyDisk, faLocationDot } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  conflictField,
  locationErrorMessage,
  locationPlace,
  locationState,
  useArchiveLocation,
  useCreateLocation,
  useUpdateLocation,
  type Location,
} from './locations-data';
import { COLUMN, type Draft } from './location-draft';
import { useLocationValidity } from './location-validity';
import { LocationFields } from './location-fields';
import { LocationLifecycle } from './location-lifecycle';
import { useLocationSave } from './location-save';
import { SaveFailure } from '@/components/save-failure';

function EditorToolbar({
  isNew,
  existing,
  canSave,
  busy,
  onSave,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  isNew: boolean;
  existing: Location | null;
  canSave: boolean;
  busy: boolean;
  onSave: () => void;
  isFetching: boolean;
  updatedAt: number | undefined;
  onRefresh: (() => void) | undefined;
}) {
  return (
    <PaneToolbar
      label={isNew ? 'New location actions' : 'Location actions'}
      refresh={
        onRefresh ? (
          <RefreshButton isFetching={isFetching} updatedAt={updatedAt} onRefresh={onRefresh} />
        ) : undefined
      }
      status={
        existing ? (
          <Badge color={locationState(existing).tone} variant="soft" size="sm">
            {locationState(existing).label}
          </Badge>
        ) : null
      }
      primary={
        <Button
          color="module"
          size="sm"
          className="ml-auto shrink-0"
          disabled={!canSave}
          loading={busy}
          onClick={onSave}
        >
          <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
          {isNew ? 'Create location' : 'Save'}
        </Button>
      }
    />
  );
}

/** The name is the pane's TAB and its editable field below, so the body opens
 *  with the REST of the identity — the code on its shelf labels, where it is,
 *  and whether a sample pack put it there. A new location is introduced by the
 *  form section instead. */
function IdentityLine({ existing }: { existing: Location | null }) {
  if (!existing) return null;
  const place = locationPlace(existing);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono text-sm">{existing.code}</span>
      {/* Says where the place came FROM. Removing the sample data deliberately
          leaves locations alone — a tenant may have renamed one and made it
          theirs — so this outlives the rest of the pack, and without it a
          location nobody set up is indistinguishable from one they did.
          See issue 174. */}
      {existing.isSample ? (
        <Badge color="info" variant="soft" size="sm">
          Sample
        </Badge>
      ) : null}
      {place ? (
        <>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Icon glyph={faLocationDot} className="size-3.5 shrink-0" aria-hidden />
            <Text as="span" className="text-sm">
              {place}
            </Text>
          </span>
        </>
      ) : null}
    </div>
  );
}

export function LocationEditor({
  ctx,
  id,
  initial,
  existing,
  isFetching = false,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  /** 'new' or a real id. */
  id: string;
  /** The starting draft — blank for a new location, hydrated for one that exists. */
  initial: Draft;
  /** The loaded row, when editing — drives the identity header and archive. */
  existing: Location | null;
  /** The owning query's state, threaded down so the toolbar can offer a refresh.
   *  Absent on a new location — there is nothing loaded to re-read. */
  isFetching?: boolean;
  updatedAt?: number | undefined;
  onRefresh?: (() => void) | undefined;
}) {
  const isNew = id === 'new';

  const create = useCreateLocation();
  const update = useUpdateLocation(id);
  const archive = useArchiveLocation(id);

  const [draft, setDraft] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    ctx.setTitle(isNew ? 'New location' : draft.name.trim() || 'Location');
  }, [ctx, isNew, draft.name]);

  const { nameOk, codeOk, addrValid, showAddrWarning, changed } = useLocationValidity(
    draft,
    initial,
    isNew
  );

  const busy = create.isPending || update.isPending;
  const canSave = nameOk && codeOk && addrValid && changed && !busy;

  useDirtySource(
    changed && !create.isSuccess,
    isNew
      ? 'This new location has not been saved yet. Close anyway?'
      : `${initial.name || 'This location'} has unsaved changes. Close anyway?`
  );

  // The code-in-use conflict belongs under the code box, not in a banner.
  const codeConflict =
    (create.isError && conflictField(create.error) === 'code') ||
    (update.isError && conflictField(update.error) === 'code');
  const codeError = codeConflict ? 'A location is already using that code. Pick another.' : null;

  // ONE banner, the most specific one — and never for the code conflict, which
  // has its own message under the field.
  const saveError =
    (create.isError && !codeConflict) || (update.isError && !codeConflict)
      ? locationErrorMessage(
          create.error ?? update.error,
          'Nothing was saved. Try again in a moment.'
        )
      : null;

  const { submit, onArchive } = useLocationSave({
    ctx,
    isNew,
    draft,
    initial,
    existing,
    canSave,
    create,
    update,
    archive,
  });

  return (
    <div className={PANE_SHELL}>
      <EditorToolbar
        isNew={isNew}
        existing={existing}
        canSave={canSave}
        busy={busy}
        onSave={submit}
        isFetching={isFetching}
        updatedAt={updatedAt}
        onRefresh={onRefresh}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <IdentityLine existing={existing} />

          <SaveFailure title="Could not save this location" message={saveError} />

          <LocationFields
            isNew={isNew}
            draft={draft}
            set={set}
            codeError={codeError}
            showAddrWarning={showAddrWarning}
          />

          <LocationLifecycle
            draft={draft}
            set={set}
            existing={existing}
            archiving={archive.isPending}
            onArchive={onArchive}
          />
        </div>
      </div>
    </div>
  );
}
