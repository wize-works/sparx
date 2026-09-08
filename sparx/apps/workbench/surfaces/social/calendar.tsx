'use client';

// The calendar — the view a social tool lives or dies on. Everything scheduled and
// everything already posted, laid out on the month it belongs to, so an operator sees
// the shape of their week at a glance: where the gaps are, what clusters, what is due
// tomorrow.
//
// The month grid is ALWAYS the view — this is the one place a social manager lives, so
// it never degrades into a list. When the pane is too narrow for seven legible columns
// the grid scrolls sideways rather than collapsing. Any day is a click target: click
// the empty space (or the date) to start a post already dated to it. Drafts have no
// date, so they sit in a tray beneath — picked up and opened, not lost.

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Button, Heading, Text, ToggleGroup, ToggleGroupItem } from '@wizeworks/silicaui-react';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, ServerCrash } from 'lucide-react';
import { slotOccurrences } from '@wizeworks/social/cadence';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import type { MediaAsset } from '../cms/media';
import { PostThumb, excerpt, formatTime, postDate } from './post-visuals';
import { useSocialBoard } from './board';
import { isEditablePost, postStatusMeta, socialErrorMessage, type Post } from './data';
import { usePostingSlots, type PostingSlot } from './planning-data';
import { PaneLoadError } from '../../components/pane-load-error';

interface OpenEvent {
  shiftKey: boolean;
  altKey: boolean;
}

interface CalendarProps {
  posts: Post[];
  assetsById: Map<string, MediaAsset>;
  /** The business's standing posting times, drawn as gaps where nothing is planned. */
  slots: PostingSlot[];
  canWrite: boolean;
  onOpenPost: (post: Post, event: OpenEvent) => void;
  onNewOnDay: (day: Date) => void;
  /** Start a post at an exact moment — clicking an empty posting time. */
  onNewAt: (at: Date) => void;
  /** Drop a post onto a day → (re)schedule it there. Only fired for editable posts
   *  (a published one is pinned to when it went out). */
  onReschedule: (post: Post, day: Date) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Status → a decorative dot color (not text, so a tone class is fine here). */
const TONE_DOT: Record<string, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  neutral: 'bg-base-content/40',
};

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

/** `2026-07-24` → a local Date at midnight — the inverse of dayKey, for turning a
 *  drop target's id back into the day the post was dropped on. */
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** The Sunday on or before `date` — the week a day belongs to. */
function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

/** The seven days of the week `cursor` starts. */
function buildWeek(cursor: Date): Date[] {
  const start = startOfWeek(cursor);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

/** How close a post has to be to a posting time to count as filling it. Matches the
 *  server-side filler exactly, so a slot the calendar draws as free is precisely one the
 *  evergreen filler would claim. */
const OCCUPIED_WINDOW_MS = 90 * 60_000;

/** The 42 cells (6 stable weeks) of the month around `cursor`, Sunday-first. */
function buildGrid(cursor: Date): Date[] {
  const first = startOfMonth(cursor);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

/* ── One post, as a calendar chip ─────────────────────────────────────────── */

function DayChip({
  post,
  assetsById,
  canWrite,
  onOpen,
}: {
  post: Post;
  assetsById: Map<string, MediaAsset>;
  canWrite: boolean;
  onOpen: (event: OpenEvent) => void;
}) {
  const meta = postStatusMeta(post.status);
  const iso = post.publishedAt ?? post.scheduledAt;
  // A published post is pinned to when it went out; everything still in flight can be
  // dragged to another day (by someone who may schedule). A 6px activation distance (on
  // the context's sensor) keeps a click-to-open distinct from a drag-to-reschedule.
  const movable = canWrite && isEditablePost(post.status);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    disabled: !movable,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      title={`${excerpt(post.body, 80)} — ${meta.label}${movable ? ' · drag to reschedule' : ''}`}
      className={`hover:bg-base-300 bg-base-200 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left ${
        movable ? 'cursor-grab' : 'cursor-pointer'
      } ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden />
      <PostThumb post={post} assetsById={assetsById} size="xs" />
      <span className="min-w-0 flex-1 truncate text-xs">
        {iso ? <span className="font-semibold">{formatTime(iso)} </span> : null}
        {excerpt(post.body, 32)}
      </span>
    </button>
  );
}

/* ── The month grid ───────────────────────────────────────────────────────── */

/**
 * A posting time this day was meant to have, with nothing in it.
 *
 * This is what turns a cadence from a note in a settings screen into something you can
 * see. "We post Tuesdays at 9" is only useful if an empty Tuesday LOOKS empty — otherwise
 * a quiet month reads as blank space and nobody notices until engagement drops. Clicking
 * one starts a post already dated to that exact slot.
 */
function EmptySlotChip({
  at,
  canWrite,
  onFill,
}: {
  at: Date;
  canWrite: boolean;
  onFill: () => void;
}) {
  const label = `${formatTime(at.toISOString())} — nothing planned`;
  return (
    <button
      type="button"
      disabled={!canWrite}
      title={canWrite ? `Write a post for ${formatTime(at.toISOString())}` : label}
      aria-label={label}
      onClick={onFill}
      className={`border-module/50 text-module flex w-full min-w-0 items-center gap-1.5 rounded-md border border-dashed px-1 py-1 text-left ${
        canWrite ? 'hover:bg-module hover:bg-soft cursor-pointer' : 'cursor-default'
      }`}
    >
      <CalendarPlus className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-xs">
        <span className="font-semibold">{formatTime(at.toISOString())}</span> free
      </span>
    </button>
  );
}

function DayCell({
  day,
  inMonth,
  isToday,
  dayPosts,
  openSlots,
  assetsById,
  canWrite,
  onOpenPost,
  onNewOnDay,
  onNewAt,
}: {
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  dayPosts: Post[];
  /** Posting times on this day with nothing scheduled in them. */
  openSlots: Date[];
  assetsById: Map<string, MediaAsset>;
  canWrite: boolean;
  onOpenPost: (post: Post, event: OpenEvent) => void;
  onNewOnDay: (day: Date) => void;
  onNewAt: (at: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  const shown = dayPosts.slice(0, 3);
  const overflow = dayPosts.length - shown.length;
  const dayLabel = day.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      ref={setNodeRef}
      className={`group/day relative flex min-h-28 flex-col gap-1 border-r border-b p-1.5 ${
        isOver
          ? 'border-module bg-module bg-soft'
          : `border-base-300 ${inMonth ? 'bg-base-100' : 'bg-base-200/50'}`
      }`}
    >
      {/* The whole cell is the "write a post on this day" target — the click surface a
          calendar operator expects. It sits BEHIND the date + chips (which re-enable
          their own pointer events), so tapping any empty space, the date, or the "+N
          more" line starts a dated post, while a chip still opens its post. */}
      {canWrite ? (
        <button
          type="button"
          aria-label={`New post on ${dayLabel}`}
          title="Write a post on this day"
          onClick={() => {
            onNewOnDay(day);
          }}
          className="hover:bg-module hover:bg-soft focus-visible:bg-module focus-visible:bg-soft absolute inset-0 cursor-pointer"
        />
      ) : null}

      <div className="pointer-events-none relative flex min-h-0 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span
            className={
              isToday
                ? 'bg-module text-module-content grid size-6 place-items-center rounded-full text-sm font-semibold'
                : 'grid size-6 place-items-center text-sm font-medium'
            }
          >
            {day.getDate()}
          </span>
          {canWrite ? (
            <span
              className="text-module opacity-0 transition-opacity group-hover/day:opacity-100"
              aria-hidden
            >
              <Plus className="size-4" />
            </span>
          ) : null}
        </div>
        {shown.map((post) => (
          <div key={post.id} className="pointer-events-auto">
            <DayChip
              post={post}
              assetsById={assetsById}
              canWrite={canWrite}
              onOpen={(event) => {
                onOpenPost(post, event);
              }}
            />
          </div>
        ))}
        {/* Only when the day has room to show them — a busy day's real posts matter
            more than the gaps between them. */}
        {shown.length < 3
          ? openSlots.slice(0, 3 - shown.length).map((at) => (
              <div key={at.toISOString()} className="pointer-events-auto">
                <EmptySlotChip
                  at={at}
                  canWrite={canWrite}
                  onFill={() => {
                    onNewAt(at);
                  }}
                />
              </div>
            ))
          : null}
        {overflow > 0 ? <span className="px-1 text-xs font-medium">+{overflow} more</span> : null}
      </div>
    </div>
  );
}

/**
 * The grid, month or week.
 *
 * One component for both, because a week IS seven day cells — the same cell, the same
 * drop target, the same chips. The only differences are which days are in the list and
 * how tall a row gets to be, and a second component would mean every future change to a
 * day cell having to be made twice.
 */
function CalendarGrid({
  days,
  month,
  postsByDay,
  openSlotsByDay,
  assetsById,
  canWrite,
  tall,
  onOpenPost,
  onNewOnDay,
  onNewAt,
}: {
  days: Date[];
  /** Which month counts as "this one", for dimming the spill-over days. */
  month: number | null;
  postsByDay: Map<string, Post[]>;
  openSlotsByDay: Map<string, Date[]>;
  assetsById: Map<string, MediaAsset>;
  canWrite: boolean;
  /** A week has one row, so its cells can afford real height. */
  tall?: boolean;
  onOpenPost: (post: Post, event: OpenEvent) => void;
  onNewOnDay: (day: Date) => void;
  onNewAt: (at: Date) => void;
}) {
  const todayKey = dayKey(new Date());

  return (
    // `flex-1`, NOT `h-full`. This card is a flex ITEM of a column flex parent, and
    // `height: 100%` there resolves against a containing block that flex sizing does
    // not make definite — so it silently falls back to CONTENT height and the card
    // stops partway down the pane however much room it is given. Measured: with the
    // parent at 1402px the `h-full` card stayed 706px; as `flex-1` it takes all 1402.
    // Growing into a flex parent is always `flex-1`; a percentage is the bug.
    <div className="border-base-300 flex flex-1 flex-col overflow-hidden rounded-xl border">
      <div className="border-base-300 grid shrink-0 grid-cols-7 border-b">
        {WEEKDAYS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-semibold">
            {label}
          </div>
        ))}
      </div>
      {/* `minmax(<floor>, 1fr)` per row, not `grid-rows-6`/`auto`.
          `auto` was why the card stopped partway down the pane: rows took only the
          height their chips needed and the rest of the pane went to waste.
          Tailwind's `grid-rows-6` is `repeat(6, minmax(0, 1fr))`, which fixes that but
          swaps in a worse bug — a 0 floor lets a short pane squeeze rows below the
          cell's own `min-h-28`, and the cells then spill over each other.
          Spelling the floor into the track keeps both properties: share the surplus
          when there is room, refuse to go below a legible row when there is not, and
          let the pane scroll at that point. The floors match DayCell's min-h-28 and
          the week view's taller cell. */}
      <div
        className={`grid flex-1 grid-cols-7 ${
          tall
            ? '[grid-template-rows:minmax(16rem,1fr)]'
            : '[grid-template-rows:repeat(6,minmax(7rem,1fr))]'
        }`}
      >
        {days.map((day) => {
          const key = dayKey(day);
          return (
            <DayCell
              key={key}
              day={day}
              inMonth={month === null || day.getMonth() === month}
              isToday={key === todayKey}
              dayPosts={postsByDay.get(key) ?? []}
              openSlots={openSlotsByDay.get(key) ?? []}
              assetsById={assetsById}
              canWrite={canWrite}
              onOpenPost={onOpenPost}
              onNewOnDay={onNewOnDay}
              onNewAt={onNewAt}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── Unscheduled drafts tray ──────────────────────────────────────────────── */

function DraftCard({
  post,
  assetsById,
  canWrite,
  onOpen,
}: {
  post: Post;
  assetsById: Map<string, MediaAsset>;
  canWrite: boolean;
  onOpen: (event: OpenEvent) => void;
}) {
  // A draft has no date; drag one onto a day to schedule it there.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
    disabled: !canWrite,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      title={
        canWrite
          ? `${excerpt(post.body, 120)} · drag onto a day to schedule`
          : excerpt(post.body, 120)
      }
      className={`border-base-300 hover:bg-base-200 flex w-44 shrink-0 items-center gap-2 rounded-lg border p-2 text-left ${
        canWrite ? 'cursor-grab' : 'cursor-pointer'
      } ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
    >
      <PostThumb post={post} assetsById={assetsById} size="sm" />
      <span className="min-w-0 flex-1 text-sm break-words">{excerpt(post.body, 40)}</span>
    </button>
  );
}

function DraftsTray({
  drafts,
  assetsById,
  canWrite,
  onOpenPost,
}: {
  drafts: Post[];
  assetsById: Map<string, MediaAsset>;
  canWrite: boolean;
  onOpenPost: (post: Post, event: OpenEvent) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Heading level={3} className="text-sm font-semibold">
          Unscheduled drafts
        </Heading>
        <Text className="text-sm">{drafts.length}</Text>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {drafts.map((post) => (
          <DraftCard
            key={post.id}
            post={post}
            assetsById={assetsById}
            canWrite={canWrite}
            onOpen={(event) => {
              onOpenPost(post, event);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function PostsCalendar({
  posts,
  assetsById,
  slots,
  canWrite,
  onOpenPost,
  onNewOnDay,
  onNewAt,
  onReschedule,
}: CalendarProps) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [activeId, setActiveId] = useState<string | null>(null);

  // The cursor means "the month" or "the start of the week" depending on the view, so
  // switching views has to re-anchor it — otherwise Week opens on the 1st of a month
  // that may be four weeks from where the person was looking.
  const changeView = (next: 'month' | 'week') => {
    setCursor((c) => (next === 'week' ? startOfWeek(c) : startOfMonth(c)));
    setView(next);
  };

  const step = (from: Date, direction: number): Date =>
    view === 'month'
      ? new Date(from.getFullYear(), from.getMonth() + direction, 1)
      : new Date(from.getFullYear(), from.getMonth(), from.getDate() + direction * 7);

  // 6px before a drag begins, so a tap still opens the post (matches the workbench's
  // other drag surfaces). Pointer-only: the equivalent keyboard path is opening the
  // post and using its schedule field.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activePost = activeId ? (posts.find((p) => p.id === activeId) ?? null) : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const post = posts.find((p) => p.id === String(active.id));
    if (!post) return;
    const day = parseDayKey(String(over.id));
    onReschedule(post, day);
  };

  const postsByDay = useMemo(() => {
    const byDay = new Map<string, Post[]>();
    for (const post of posts) {
      const date = postDate(post);
      if (!date) continue;
      const key = dayKey(date);
      const list = byDay.get(key);
      if (list) list.push(post);
      else byDay.set(key, [post]);
    }
    // Within a day, order by the moment it goes out / went out.
    for (const list of byDay.values()) {
      list.sort((a, b) => {
        const at = a.publishedAt ?? a.scheduledAt ?? '';
        const bt = b.publishedAt ?? b.scheduledAt ?? '';
        return at.localeCompare(bt);
      });
    }
    return byDay;
  }, [posts]);

  const drafts = useMemo(
    () => posts.filter((post) => post.status === 'draft' && !post.scheduledAt),
    [posts]
  );

  const days = useMemo(
    () => (view === 'month' ? buildGrid(cursor) : buildWeek(cursor)),
    [view, cursor]
  );

  /**
   * The posting times on screen that have nothing in them.
   *
   * A slot counts as filled by anything within an hour and a half of it — a rhythm, not
   * a stopwatch, and the same window the server-side filler uses, so what the calendar
   * shows as free is exactly what would be filled.
   */
  const openSlotsByDay = useMemo(() => {
    const out = new Map<string, Date[]>();
    if (days.length === 0 || slots.length === 0) return out;

    const from = new Date(days[0]!.getTime() - 1);
    const spanDays = days.length;
    const scheduled = posts
      .map((p) => postDate(p))
      .filter((d): d is Date => d !== null)
      .map((d) => d.getTime());

    for (const slot of slots) {
      if (!slot.enabled) continue;
      for (const at of slotOccurrences(
        { weekday: slot.weekday, minuteOfDay: slot.minuteOfDay, timezone: slot.timezone },
        from,
        spanDays
      )) {
        const taken = scheduled.some((t) => Math.abs(t - at.getTime()) <= OCCUPIED_WINDOW_MS);
        if (taken) continue;
        const key = dayKey(at);
        const list = out.get(key);
        if (list) list.push(at);
        else out.set(key, [at]);
      }
    }
    for (const list of out.values()) list.sort((a, b) => a.getTime() - b.getTime());
    return out;
  }, [days, slots, posts]);

  const rangeLabel =
    view === 'month'
      ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + 6
        ).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event: DragStartEvent) => {
        setActiveId(String(event.active.id));
      }}
      onDragCancel={() => {
        setActiveId(null);
      }}
      onDragEnd={handleDragEnd}
    >
      {/* Full width, not a centred reading column. A calendar is a GRID, and a capped
          column spent the pane's width on empty gutters while squeezing seven day cells
          into 72rem — the wider the pane, the more each day gets, which is the whole
          reason someone docks this one wide. `flex-1` + `min-h-0` so the grid inside can
          claim the leftover height rather than sitting in a short card. */}
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Heading level={2} className="text-lg font-semibold">
            {rangeLabel}
          </Heading>
          <div className="flex-1" />
          {/* Month plans, week works. A social manager checks the shape of the month
              and then lives in this week — the same grid, seven cells, room to see what
              is actually in each day. */}
          <ToggleGroup
            color="module"
            size="sm"
            value={[view]}
            aria-label="How much to show"
            onValueChange={(value: string[]) => {
              const next = value[value.length - 1];
              if (next === 'month' || next === 'week') changeView(next);
            }}
          >
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
          </ToggleGroup>
          <Button
            size="sm"
            variant="ghost"
            aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
            onClick={() => {
              setCursor((c) => step(c, -1));
            }}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCursor(view === 'month' ? startOfMonth(new Date()) : startOfWeek(new Date()));
            }}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={view === 'month' ? 'Next month' : 'Next week'}
            onClick={() => {
              setCursor((c) => step(c, 1));
            }}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        {canWrite ? (
          <Text className="shrink-0 text-sm">
            {posts.length === 0
              ? 'No posts yet — click any day to write your first one.'
              : 'Click any day to write a post dated to it. Drag a post to another day to reschedule it — or drag a draft up from below onto a day to schedule it.'}
          </Text>
        ) : null}

        {/* A grid is always the view — it never degrades into a list. On a pane too
            narrow for seven legible columns it scrolls sideways instead. */}
        <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-x-auto px-1">
          <div className="flex min-w-[44rem] flex-1 flex-col">
            <CalendarGrid
              days={days}
              month={view === 'month' ? cursor.getMonth() : null}
              postsByDay={postsByDay}
              openSlotsByDay={openSlotsByDay}
              assetsById={assetsById}
              canWrite={canWrite}
              tall={view === 'week'}
              onOpenPost={onOpenPost}
              onNewOnDay={onNewOnDay}
              onNewAt={onNewAt}
            />
          </div>
        </div>

        <DraftsTray
          drafts={drafts}
          assetsById={assetsById}
          canWrite={canWrite}
          onOpenPost={onOpenPost}
        />
      </div>

      {/* The lifted post follows the pointer; a portal keeps it above the grid. */}
      <DragOverlay dropAnimation={null}>
        {activePost ? (
          <div className="border-module bg-base-100 flex w-52 items-center gap-2 rounded-lg border p-2">
            <PostThumb post={activePost} assetsById={assetsById} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {excerpt(activePost.body, 40)}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SURFACE — the module's default landing. A social manager opens the app
   to this: the month laid out, drag to reschedule, tap a day to write.
   ══════════════════════════════════════════════════════════════════════════ */

export function SocialCalendarSurface({ ctx }: { ctx: SurfaceContext }) {
  const board = useSocialBoard(ctx);
  const { posts, canWrite, all } = board;
  // The standing posting times, so an empty Tuesday LOOKS empty rather than blank.
  const slots = usePostingSlots();

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
        label="Calendar controls"
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
        ) : (
          // The calendar is ALWAYS the view — an empty month is still a calendar you
          // click into to write your first post. The zero-posts guidance rides inside
          // it as a hint, not a screen that replaces the grid.
          //
          // `min-h-full` rather than `h-full`: the grid takes every pixel the pane has
          // when there is room, and grows past it (letting this container scroll) when
          // the pane is too short for six legible rows. `h-full` would cap it and crush
          // the rows instead.
          <div className="flex min-h-full flex-col p-4">
            <PostsCalendar
              posts={all}
              assetsById={board.assetsById}
              slots={slots.data ?? []}
              canWrite={canWrite}
              onOpenPost={board.openPost}
              onNewOnDay={board.newOnDay}
              onNewAt={board.newAt}
              onReschedule={board.onReschedule}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default SocialCalendarSurface;
