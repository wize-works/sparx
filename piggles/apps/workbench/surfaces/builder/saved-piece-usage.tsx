'use client';

// Where a saved piece is used — the "change it once, it changes everywhere" half
// of the feature, made visible.
//
// Its own file because it answers its own question. The pane beside it edits the
// piece's identity from a draft the author saves explicitly; this reads a separate
// server answer, has its own loading and error states, and never writes anything.
// Two responsibilities, two files.
//
// Every row OPENS what it names. The card exists to say where the piece lives, and
// the only thing anyone does with that answer is go and look — so a row that names
// the page and cannot reach it is a dead end at the exact moment it became useful
// (issue 417).

import { Badge, Text } from '@wizeworks/silicaui-react';
import { faFileText, faTableLayout } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import type { PieceUsage } from './saved-pieces-data';

export function UsagePanel({
  ctx,
  usage,
  isPending,
  isError,
}: {
  ctx: SurfaceContext;
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
      description="Every page and layout this piece appears on. Click one to open it. Change it here or in the editor and all of these update together."
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
            <li key={`${row.kind}:${row.id}`} className="border-base-300 border-b last:border-b-0">
              <button
                type="button"
                onClick={(event) => {
                  // Same modifier contract as every list in the app: plain opens a
                  // tab, Shift docks it alongside, Alt tears it into its own window.
                  ctx.open(
                    row.kind === 'Page' ? 'builder.page' : 'builder.layout',
                    row.kind === 'Page' ? { pageId: row.id } : undefined,
                    { target: event.altKey ? 'window' : event.shiftKey ? 'beside' : 'tab' }
                  );
                }}
                className="hover:bg-base-200 flex w-full items-center gap-3 rounded px-1 py-2 text-left"
              >
                {row.kind === 'Page' ? (
                  <Icon glyph={faFileText} className="size-4 shrink-0" aria-hidden />
                ) : (
                  <Icon glyph={faTableLayout} className="size-4 shrink-0" aria-hidden />
                )}
                <Text className="min-w-0 flex-1 truncate font-medium">{row.name}</Text>
                {/* Colorless, not grey-by-name. "Page" and "Layout" are two kinds
                    of thing and `neutral` says neither of them; a bare badge takes
                    the surface's own ink and stays right in both themes. */}
                <Badge variant="soft" size="sm" className="shrink-0">
                  {row.kind}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}
