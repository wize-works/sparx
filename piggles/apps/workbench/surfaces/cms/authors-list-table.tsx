'use client';

// The authors table — a face, a name, and where that name appears.
//
// Split out of authors-list.tsx when the shared-byline marker pushed it past the
// size rule, matching the collections and categories lists. The pane owns
// loading and searching; this owns the rows.

import Image from 'next/image';
import { faUser } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { Table } from '../../components/table';
// Read-only import: resolves avatar asset ids to real thumbnail URLs, the same
// way the content editor's asset fields do.
import type { MediaAsset } from './media';
import { authorName, type Author } from './authors-data';

/** The author's photo, or a person glyph when there isn't one. */
function AuthorPhoto({ asset }: { asset: MediaAsset | undefined }) {
  return (
    <span className="border-base-300 bg-base-200 relative size-11 shrink-0 overflow-hidden rounded-full border">
      {asset?.url ? (
        <Image
          src={asset.url}
          alt=""
          fill
          sizes="44px"
          className="object-cover"
          // Unoptimized: cross-origin tenant media whose host is not on the image
          // optimizer's allow-list — a broken tile plus a console error is worse
          // than the browser scaling an already-small file. Same call the media
          // picker makes.
          unoptimized
        />
      ) : (
        <span className="flex h-full items-center justify-center">
          <Icon glyph={faUser} className="size-5" aria-hidden />
        </span>
      )}
    </span>
  );
}

function AuthorRow({
  author,
  asset,
  showShared,
  onOpen,
}: {
  author: Author;
  asset: MediaAsset | undefined;
  /** Only a business with more than one site has a distinction to draw. On a
   *  single-site business every byline is shared by definition, and saying so on
   *  every row is noise about a choice that does not exist. */
  showShared: boolean;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(event);
      }}
    >
      <td>
        <span className="flex min-w-0 items-center gap-3">
          <AuthorPhoto asset={asset} />
          <span className="flex min-w-0 flex-col">
            {/* The name is the content of the row — everything else is a note about
                it, so nothing else gets to be the same size. */}
            <span className="max-w-72 truncate text-base font-medium">{authorName(author)}</span>
            {/* Same note, same words, as a shared redirect rule carries. */}
            {showShared && author.property_id === null ? (
              <span className="text-sm">Shared across all your sites</span>
            ) : null}
          </span>
        </span>
      </td>
      <td className="hidden max-w-72 truncate font-mono text-sm @xl:table-cell">/{author.slug}</td>
    </tr>
  );
}

export function AuthorsTable({
  authors,
  assetById,
  showShared,
  onOpen,
}: {
  authors: readonly Author[];
  assetById: Map<string, MediaAsset>;
  showShared: boolean;
  onOpen: (author: Author, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <Table size="sm" hover>
      <thead>
        <tr>
          <th>Author</th>
          <th className="hidden @xl:table-cell">Web address</th>
        </tr>
      </thead>
      <tbody>
        {authors.map((author) => (
          <AuthorRow
            key={author.id}
            author={author}
            asset={author.avatar_asset_id ? assetById.get(author.avatar_asset_id) : undefined}
            showShared={showShared}
            onOpen={(event) => {
              onOpen(author, event);
            }}
          />
        ))}
      </tbody>
    </Table>
  );
}
