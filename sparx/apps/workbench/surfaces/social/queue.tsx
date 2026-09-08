'use client';

// Posts — the library: everything drafted, scheduled, and sent, grouped by where it is
// in its life (needs a look → scheduled → drafts → posted) and laid out as a grid of
// preview tiles, each led by its picture and the accounts it lands on. This is the
// search-and-triage lens; the Calendar (its own top-level panel, and the module's
// landing) is the day-to-day one.
//
// PREVIEW TILES, not rows and not full-size cards. Social is a visual medium, so a table
// row is the wrong instrument — it spends its width on one line of text and crops the
// picture to a 64px chip, leaving a screen of posts reading as a spreadsheet in which no
// two posts are distinguishable at a glance. But a tile is not a rendition of the post
// either: this surface is for scanning MANY posts and deciding which to open, so a tile
// carries the picture, a hint of the words, and the two facts that drive that decision.
// Every cover is forced to the same shape (PostCover owns the ratio) so the grid reads as
// a grid rather than a ragged column of different-sized pictures.
//
// A pipeline strip across the top is both the glance (how much is where) and the filter
// (tap a stage to see just those).

import { useMemo, useState } from 'react';
import { Badge, Button, EmptyState, Heading, SearchInput, Text } from '@wizeworks/silicaui-react';
import { Plus, Send, ServerCrash } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import type { MediaAsset } from '../cms/media';
import { postStatusMeta, socialErrorMessage, type CatalogEntry, type Post } from './data';
import { DestinationAvatars, PostCover, excerpt, whenLine } from './post-visuals';
import { GROUPS, useSocialBoard } from './board';
import { RowOpenHint } from '../../components/row-open-hint';
import { PaneLoadError } from '../../components/pane-load-error';

/* ── One post, as a preview tile ──────────────────────────────────────────── */

/**
 * A post as a PREVIEW tile — enough to recognise it and decide whether to open it, and
 * deliberately not a reproduction of the post itself.
 *
 * It began as a table-style row, which is the wrong instrument for a visual medium: a row
 * spends its width on one line of text and crops the picture to a 64px chip, so a screen
 * of posts reads as a spreadsheet and two posts are indistinguishable at a glance.
 *
 * The first pass then overcorrected into a full-size card — three lines of body, the
 * timestamp, and every live link — which made each one a small rendition of the post and
 * fitted four to a pane. The job here is scanning MANY posts, so the tile is sized to be
 * recognised, not read: picture, a two-line hint of the words, and the two facts that
 * decide whether you open it (what state it is in, where it went). Everything else lives
 * on the post, one click away.
 *
 * The per-destination "View on …" links went with that. They wrapped onto two lines at
 * this width and are already on the post detail (composer.tsx), where you are when you
 * actually want to go look at the live thing.
 */
function PostTile({
  post,
  assetsById,
  avatarByTargetId,
  catalogMap,
  onOpen,
}: {
  post: Post;
  assetsById: Map<string, MediaAsset>;
  avatarByTargetId: Map<string, string | null>;
  catalogMap: Map<string, CatalogEntry>;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const meta = postStatusMeta(post.status);

  return (
    <li className="border-base-300 bg-base-100 hover:border-module flex flex-col overflow-hidden rounded-lg border transition-colors">
      <button
        type="button"
        className="flex flex-1 cursor-pointer flex-col text-left"
        onClick={onOpen}
        // The words in full, since the tile only shows the first two lines of them.
        title={excerpt(post.body, 300)}
      >
        <PostCover post={post} assetsById={assetsById} />

        <span className="flex flex-1 flex-col gap-1.5 p-2.5">
          {/* Still 16px — a tile is small, but this is the post's own words and the
              base font floor is not negotiable for something meant to be read. Two
              lines rather than three: cards in a row share the tallest one's height,
              so every extra line is paid for by all of them. */}
          <span className="line-clamp-2 text-base font-medium break-words">
            {excerpt(post.body, 120)}
          </span>

          <Text className="text-sm">{whenLine(post)}</Text>

          {/* `mt-auto` pins this to the bottom edge, so the state of every tile in a
              row lines up however long their words ran. */}
          <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge color={meta.tone} variant="soft" size="sm">
              {meta.label}
            </Badge>
            <DestinationAvatars
              targets={post.targets}
              avatarByTargetId={avatarByTargetId}
              catalogMap={catalogMap}
              max={3}
            />
          </span>
        </span>
      </button>
    </li>
  );
}

/* ── Pipeline overview strip (glance + filter) ────────────────────────────── */

function PipelineStrip({
  counts,
  activeFilter,
  onPick,
}: {
  counts: Record<string, number>;
  activeFilter: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
      {GROUPS.map((group) => {
        const count = counts[group.key] ?? 0;
        const active = activeFilter === group.key;
        // "Needs a look" earns a warning number when it is non-empty — the one stage
        // that wants attention. The rest carry their weight in scale, not color.
        const emphatic = group.key === 'review' && count > 0;
        return (
          <button
            key={group.key}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onPick(group.key);
            }}
            className={`flex flex-col gap-0.5 rounded-xl border p-3 text-left transition-colors ${
              active
                ? 'border-module bg-module bg-soft'
                : 'border-base-300 hover:border-module bg-base-100'
            }`}
          >
            <span
              className={`text-2xl font-semibold tabular-nums ${emphatic ? 'text-warning' : ''}`}
            >
              {count}
            </span>
            <span className="text-sm">{group.title}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function SocialQueueSurface({ ctx }: { ctx: SurfaceContext }) {
  const board = useSocialBoard(ctx);
  const { posts, canWrite, all, assetsById, avatarByTargetId, catalogMap, counts } = board;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? all.filter((post) => post.body.toLowerCase().includes(needle)) : all),
    [all, needle]
  );

  const grouped = useMemo(() => {
    return GROUPS.filter((group) => !filter || group.key === filter)
      .map((group) => ({
        group,
        posts: matches.filter((post) => group.statuses.includes(post.status)),
      }))
      .filter((section) => section.posts.length > 0);
  }, [matches, filter]);

  const pickFilter = (key: string) => {
    setFilter((current) => (current === key ? null : key));
  };

  if (posts.isError) {
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          icon={<ServerCrash className="size-6" aria-hidden />}
          title="Could not load your posts"
          description={socialErrorMessage(
            posts.error,
            'This is a problem reaching the server. Nothing about your posts has changed.'
          )}
          onRetry={() => {
            void posts.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Posts list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search posts"
              placeholder="Search posts…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        controls={
          <>
            {canWrite ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto shrink-0 whitespace-nowrap"
                title="Write a new post — hold Shift to open alongside, Alt for a new window"
                onClick={(event) => {
                  board.openNew(event);
                }}
              >
                <Plus className="size-4" aria-hidden />
                New post
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className={canWrite ? undefined : 'ml-auto'}
            isFetching={posts.isFetching}
            updatedAt={posts.data ? posts.dataUpdatedAt : undefined}
            onRefresh={() => {
              void posts.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {posts.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : all.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<Send className="size-6" aria-hidden />}
              title="No posts yet"
              description="Write a post once and send it to every account you have connected. Drafts, scheduled posts and everything you have already sent will show up here."
              actions={
                canWrite ? (
                  <Button
                    color="module"
                    size="sm"
                    onClick={(event) => {
                      board.openNew(event);
                    }}
                  >
                    <Plus className="size-4" aria-hidden />
                    New post
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          // Full width, not a centred reading column — same reasoning as the calendar.
          // A card grid earns every pixel by fitting another column; a 72rem cap spent
          // the rest of a wide pane on empty gutters.
          <div className="flex w-full flex-col gap-4 p-4">
            <PipelineStrip counts={counts} activeFilter={filter} onPick={pickFilter} />

            {matches.length === 0 ? (
              <EmptyState
                icon={<Send className="size-6" aria-hidden />}
                title="No posts match that"
                description="Try different words, or clear the search to see them all."
              />
            ) : grouped.length === 0 ? (
              <EmptyState
                icon={<Send className="size-6" aria-hidden />}
                title="Nothing in this stage"
                description="No posts are at this stage right now. Tap the stage again to see everything."
              />
            ) : (
              grouped.map(({ group, posts: groupPosts }) => (
                // The stage heading is a plain header now, not a card wrapping the
                // posts: cards inside a card gave every group a second border and made
                // the posts read as rows of a table again.
                <section key={group.key} className="flex flex-col gap-3">
                  <header className="flex items-center gap-2">
                    <Heading level={2} className="text-base font-semibold">
                      {group.title}
                    </Heading>
                    <div className="flex-1" />
                    <Text className="text-sm">{groupPosts.length}</Text>
                  </header>
                  {/* `auto-fill` + a minimum tile width, rather than a table of column
                      counts at container breakpoints. The grid then answers "how many
                      fit?" continuously at every pane width instead of at four chosen
                      ones, which is the right question for a gallery and means nothing
                      to re-tune when the tile size changes — and it needs no @container
                      breakpoints to do it.
                      `auto-fill` NOT `auto-fit`: auto-fit collapses the empty tracks and
                      stretches the survivors, so a stage holding two posts would show
                      two half-pane-wide tiles. Empty tracks are the correct look here.
                      `items-stretch` (the default) is load-bearing — it is what makes
                      every tile in a row share the tallest one's height. */}
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5">
                    {groupPosts.map((post) => (
                      <PostTile
                        key={post.id}
                        post={post}
                        assetsById={assetsById}
                        avatarByTargetId={avatarByTargetId}
                        catalogMap={catalogMap}
                        onOpen={(event) => {
                          board.openPost(post, event);
                        }}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      <RowOpenHint what="a post to open it" />
    </div>
  );
}

export default SocialQueueSurface;
