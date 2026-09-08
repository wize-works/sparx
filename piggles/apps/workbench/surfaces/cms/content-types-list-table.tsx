'use client';

// One group of content types as a table — "the ones you made" or "the built-in
// ones you can't change".
//
// Split out of content-types-list.tsx under the size rule, the same seam the
// authors and categories lists use. The pane owns loading, searching and
// filtering; this owns the rows and the two numbers in the Entries column.

import { Badge, Heading, Text } from '@wizeworks/silicaui-react';
// The house table wrapper, not silica's — the same one every other list in the
// app uses, so these rows sit at the same density as the ones beside them.
import { IDENTITY_CELL, Table } from '../../components/table';
import type { ContentType, EntryCounts } from './content-types-data';

function usageLabel(counts: EntryCounts | undefined): string {
  if (counts === undefined) return '';
  if (counts.here === 0) return 'No entries yet';
  return `${String(counts.here)} ${counts.here === 1 ? 'entry' : 'entries'}`;
}

/** How many of this type live on the business's OTHER websites, said out loud.
 *
 *  The column counts this site (issue 389). On a business running several sites
 *  that leaves a gap between what it shows and what a delete refuses, and an
 *  unexplained gap is how "No entries yet" ends up above a Delete that fails. */
function elsewhereLabel(counts: EntryCounts | undefined): string | null {
  if (!counts) return null;
  const elsewhere = counts.allSites - counts.here;
  if (elsewhere <= 0) return null;
  return `${String(elsewhere)} on your other sites`;
}

export interface TypeGroupProps {
  title: string;
  description: string;
  types: ContentType[];
  counts: Map<string, EntryCounts> | undefined;
  /** Shown instead of the rows when the group is empty; null hides the group. */
  emptyHint: string | null;
  onOpen: (type: ContentType, event: { shiftKey: boolean; altKey: boolean }) => void;
}

export function TypeGroup({
  title,
  description,
  types,
  counts,
  emptyHint,
  onOpen,
}: TypeGroupProps) {
  if (types.length === 0 && emptyHint === null) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <Heading level={2} className="text-lg font-semibold">
          {title}
        </Heading>
        <Text className="text-sm">{description}</Text>
      </div>

      {types.length === 0 ? (
        <Text className="px-1 text-sm">{emptyHint}</Text>
      ) : (
        <Table size="sm" hover>
          <thead>
            <tr>
              <th>Name</th>
              <th className="hidden @xl:table-cell">Key</th>
              <th className="hidden @2xl:table-cell">Entries</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const count = counts?.get(type.key);
              const usage = usageLabel(count);
              const elsewhere = elsewhereLabel(count);
              return (
                <tr
                  key={type.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    onOpen(type, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onOpen(type, event);
                  }}
                >
                  <td>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{type.name}</span>
                      {type.is_singleton ? (
                        <Badge color="info" variant="soft" size="sm">
                          Only one
                        </Badge>
                      ) : null}
                      {type.is_built_in ? (
                        <Badge color="info" variant="soft" size="sm">
                          View only
                        </Badge>
                      ) : null}
                    </span>
                    {/* The shared cap, not a number of its own. `max-w-96` was 384px
                        inside a 327px pane, so the table scrolled sideways by 89px on a
                        phone and the sentence was clipped mid-word with no ellipsis —
                        the very failure IDENTITY_CELL's own note describes one size
                        down (issue 390). */}
                    {type.description ? (
                      <span className={`mt-0.5 block truncate text-sm ${IDENTITY_CELL}`}>
                        {type.description}
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden font-mono text-sm @xl:table-cell">{type.key}</td>
                  <td className="hidden text-sm @2xl:table-cell">
                    <span className="flex flex-col">
                      <span className="whitespace-nowrap">{usage}</span>
                      {elsewhere ? <span className="whitespace-nowrap">{elsewhere}</span> : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </section>
  );
}
