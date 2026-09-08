'use client';

// The pane's own furniture: the action bar above the form, and the two things
// that sit at the top of it.

import { Badge, Button, Text } from '@wizeworks/silicaui-react';
import { faFloppyDisk } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar } from '../../components/pane-toolbar';
import type { BusinessLocation } from './setup-data';
import { SaveFailure } from '@/components/save-failure';

export function EditorToolbar({
  isNew,
  existing,
  canSave,
  busy,
  onSave,
  refresh,
}: {
  isNew: boolean;
  existing: BusinessLocation | null;
  canSave: boolean;
  busy: boolean;
  onSave: () => void;
  refresh: React.ReactNode;
}) {
  return (
    <PaneToolbar
      label={isNew ? 'New place actions' : 'Place actions'}
      refresh={refresh}
      status={
        existing ? (
          <Badge color={existing.isActive ? 'success' : 'neutral'} variant="soft" size="sm">
            {existing.isActive ? 'In use' : 'Off'}
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
          {isNew ? 'Create' : 'Save'}
        </Button>
      }
    />
  );
}

/** What is filed here, and anything the last save refused. */
export function EditorHeader({
  existing,
  saveError,
}: {
  existing: BusinessLocation | null;
  saveError: string | null;
}) {
  return (
    <>
      {existing ? (
        <Text className="text-sm">
          {existing.counts.resources} people &amp; things · {existing.counts.services} services ·{' '}
          {existing.counts.bookings} bookings
        </Text>
      ) : null}
      <SaveFailure title="Could not save this" message={saveError} />
    </>
  );
}
