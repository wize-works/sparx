'use client';

// The composer — write one post, pick where it goes, see how it will read on each
// platform before it leaves, then save / schedule / send it.
//
// Writing a new post and editing a saved one are the SAME surface: `{id:'new'}`
// is the blank compose form, `{id}` is the post it becomes once saved. So this is
// a pane, not a modal — there is a durable draft to return to, and the whole
// point (the words, the destinations, the per-platform preview) fails the modal
// test outright.
//
// Everything about a post stays editable until it actually sends: the words, the
// pictures, WHERE it goes, the wording written for one account, that account's own
// send time. An earlier version froze the destinations at creation — the only call
// that accepted them was create — which turned an almost-right post into a rebuild,
// and left an approver able to reject an automation's draft but never to correct it.
// Now the same picker serves both states.
//
// The audience owns a business, not a social console. A "destination" is a page
// or profile a post lands on; a platform's limit is "24 characters over — it will
// be cut short here", never a raw error.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import Image from 'next/image';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  faArrowUpRightFromSquare,
  faArrowsRotate,
  faCalendarClock,
  faCheck,
  faClone,
  faFloppyDisk,
  faImage,
  faPaperPlane,
  faRepeat,
  faShieldCheck,
  faTrashCan,
  faXmark,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useViewer } from '../../lib/api/shell-data';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { MediaPickerProvider, AssetField } from '../cms/media-picker';
import { useMediaAssets, type MediaAsset } from '../cms/media';
import { PostPreview } from './post-preview';
import { AccountAvatar } from './post-visuals';
import {
  canApprove,
  canCompose,
  catalogByPlatform,
  evaluateTarget,
  isEditablePost,
  platformName,
  postStatusMeta,
  socialErrorMessage,
  targetStatusMeta,
  useApprovePost,
  useComposePost,
  useDeletePost,
  useDuplicatePost,
  usePostMetrics,
  usePublishPost,
  useRefreshPostMetrics,
  useRejectPost,
  useRetryPostTarget,
  useSchedulePost,
  useSetPostEvergreen,
  useSocialOverview,
  useSocialPost,
  useSubmitPost,
  useUpdatePost,
  useUpdatePostTargets,
  type CatalogEntry,
  type ComposeAction,
  type ComposeTarget,
  type Post,
  type PostTarget,
  type SocialPlatform,
} from './data';
import { tagsToText, useComposeSeed, useHashtagSets, type HashtagSet } from './planning-data';
import { productCopy } from '../../lib/product';
import { SaveFailure } from '@/components/save-failure';

/** A chooseable destination, flattened from the connected accounts. */
interface Destination {
  targetId: string;
  name: string;
  platform: SocialPlatform;
  accountName: string;
  /** The page/profile picture, so a preview reads as that account at a glance. */
  avatarUrl: string | null;
}

/** Flatten the connected accounts into the destinations a post can go to — active
 *  connections, enabled targets. Shared by both composer states so "where can this go"
 *  is answered the same way whether the post exists yet or not. */
function useDestinations(
  overview: ReturnType<typeof useSocialOverview>,
  catalogMap: Map<SocialPlatform, CatalogEntry>
): Destination[] {
  return useMemo<Destination[]>(() => {
    const out: Destination[] = [];
    for (const connection of overview.data?.connections ?? []) {
      if (connection.status !== 'active') continue;
      const accountName = connection.displayName ?? platformName(connection.platform, catalogMap);
      for (const target of connection.targets) {
        if (!target.enabled) continue;
        out.push({
          targetId: target.id,
          name: target.name,
          platform: connection.platform,
          accountName,
          avatarUrl: target.avatarUrl ?? connection.avatarUrl,
        });
      }
    }
    return out;
  }, [overview.data, catalogMap]);
}

/* ── Picking where a post goes ────────────────────────────────────────────── */

/**
 * The destination picker — one card per connected page or profile, the whole identity
 * row toggling it, with a live note on how the post reads there.
 *
 * Extracted so the SAME control serves a brand-new post and a saved one. It used to
 * exist only in the new-post branch, which is precisely why destinations were frozen
 * after creation: there was no second copy to edit them with.
 */
function DestinationPicker({
  destinations,
  selected,
  catalogMap,
  body,
  overrides,
  mediaCount,
  disabledIds,
  onToggle,
}: {
  destinations: Destination[];
  selected: Set<string>;
  catalogMap: Map<SocialPlatform, CatalogEntry>;
  body: string;
  overrides: Record<string, { textOverride: string; firstComment: string }>;
  mediaCount: number;
  /** Destinations that can no longer be turned off — one already posted to. */
  disabledIds?: Set<string>;
  onToggle: (targetId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2">
      {destinations.map((dest) => {
        const on = selected.has(dest.targetId);
        const locked = disabledIds?.has(dest.targetId) ?? false;
        const constraints = catalogMap.get(dest.platform)?.constraints;
        const text = effectiveText(overrides[dest.targetId]?.textOverride, body);
        return (
          <div
            key={dest.targetId}
            className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
              on ? 'border-module bg-module bg-soft' : 'border-base-300 hover:border-module'
            }`}
          >
            <button
              type="button"
              aria-pressed={on}
              disabled={locked}
              aria-label={
                locked
                  ? `${dest.name} has already been posted to`
                  : on
                    ? `Stop posting to ${dest.name}`
                    : `Post to ${dest.name}`
              }
              onClick={() => {
                onToggle(dest.targetId);
              }}
              className={`flex w-full items-center gap-3 text-left ${
                locked ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              <AccountAvatar
                platform={dest.platform}
                name={dest.name}
                src={dest.avatarUrl}
                title={dest.accountName}
                size="sm"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{dest.name}</span>
                <span className="text-sm">
                  {locked ? 'Already posted here' : platformName(dest.platform, catalogMap)}
                </span>
              </span>
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                  on ? 'border-module bg-module text-module-content' : 'border-base-300'
                }`}
                aria-hidden
              >
                {on ? <Icon glyph={faCheck} className="size-3.5" /> : null}
              </span>
            </button>
            {on && body.trim() !== '' ? (
              <div className="pl-11">
                <PreviewNotes constraints={constraints} text={text} mediaCount={mediaCount} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ── Per-destination tuning ───────────────────────────────────────────────── */

/**
 * The per-destination panel: different wording, a first comment (where the hashtags
 * usually go), and this destination's own send time.
 *
 * The saved hashtag sets appear here rather than in the shared body, because that is
 * where they belong on the platforms that matter — a block of tags in an Instagram
 * caption reads as spam; in the first comment it reads as filing.
 */
function DestinationTuning({
  dest,
  override,
  hashtagSets,
  onChange,
}: {
  dest: { targetId: string; name: string };
  override: { textOverride: string; firstComment: string; scheduledAt?: string };
  hashtagSets: HashtagSet[];
  onChange: (next: { textOverride: string; firstComment: string; scheduledAt?: string }) => void;
}) {
  return (
    <div className="border-base-300 flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <Text className="text-sm font-semibold">{dest.name}</Text>
      <Textarea
        color="module"
        rows={2}
        value={override.textOverride}
        placeholder="Different wording just for this account…"
        aria-label={`Different wording for ${dest.name}`}
        onChange={(event) => {
          onChange({ ...override, textOverride: event.target.value });
        }}
      />
      <Input
        color="module"
        value={override.firstComment}
        placeholder="First comment (e.g. your hashtags)…"
        aria-label={`First comment for ${dest.name}`}
        onChange={(event) => {
          onChange({ ...override, firstComment: event.target.value });
        }}
      />
      {hashtagSets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Text className="text-sm">Add saved hashtags:</Text>
          {hashtagSets.map((set) => (
            <Button
              key={set.id}
              size="xs"
              variant="outline"
              color="module"
              onClick={() => {
                const addition = tagsToText(set.tags);
                const current = override.firstComment.trim();
                onChange({
                  ...override,
                  firstComment: current ? `${current} ${addition}` : addition,
                });
              }}
            >
              {set.name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** "Instagram", "Instagram and TikTok", "Instagram, TikTok and Pinterest" — a plain
 *  sentence-ready list, because a business owner reads prose, not an array. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** An ISO instant → the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants, in the
 *  reader's own zone. The inverse of {@link fromLocalInput}. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The wording that actually reaches a destination: its per-destination override
 *  when it has one, else the shared body. An EMPTY override falls through to the
 *  body, which is why this cannot be a `??`. */
function effectiveText(override: string | undefined, base: string): string {
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : base;
}

/** A post's opening words, for the pane's tab title. */
function titleFor(body: string): string {
  const line = body.trim().split('\n')[0]?.slice(0, 40).trim();
  return line && line.length > 0 ? line : 'Post';
}

/* ── Per-destination preview note ─────────────────────────────────────────── */

function PreviewNotes({
  constraints,
  text,
  mediaCount,
}: {
  constraints: CatalogEntry['constraints'] | undefined;
  text: string;
  mediaCount: number;
}) {
  const preview = evaluateTarget(constraints, text, mediaCount);
  if (preview.notes.length === 0) {
    return (
      <span className="text-success inline-flex items-center gap-1 text-sm">
        <Icon glyph={faCheck} className="size-3.5" aria-hidden />
        Reads fine here.
      </span>
    );
  }
  const tone = preview.level === 'block' ? 'text-error' : 'text-warning';
  return (
    <ul className={`flex flex-col gap-0.5 text-sm ${tone}`}>
      {preview.notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

/* ── Read-only media thumbnails (for a saved/sent post) ───────────────────── */

function MediaThumbs({ ids }: { ids: string[] }) {
  const assets = useMediaAssets(ids);
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const asset = assets.data?.find((a) => a.id === id);
        return (
          <div
            key={id}
            className="border-base-300 bg-base-200 relative size-20 shrink-0 overflow-hidden rounded-lg border"
          >
            {asset?.url ? (
              <Image
                src={asset.url}
                alt={asset.filename}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-full items-center justify-center">
                <Icon glyph={faImage} className="size-5" aria-hidden />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Per-destination result (read-only, for a saved/sent post) ────────────── */

/**
 * How each destination did, with a retry on the ones that failed.
 *
 * The retry is the point. A post reaching three of four accounts is the most common real
 * failure, and it used to be a dead end: `partially_published` sat outside the editable
 * lifecycle, so the entire actions section was hidden and the only thing on offer was
 * delete. Retrying one destination leaves its siblings — including the ones that already
 * went out — completely alone.
 */
function TargetResults({
  targets,
  avatarByTargetId,
  canRetry = false,
  retrying = null,
  onRetry,
}: {
  targets: PostTarget[];
  /** {socialTargetId → picture}; the post row stores only the name. */
  avatarByTargetId: Map<string, string | null>;
  canRetry?: boolean;
  /** The post-target id currently being retried, for its button's spinner. */
  retrying?: string | null;
  onRetry?: (postTargetId: string, name: string) => void;
}) {
  if (targets.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {targets.map((target) => {
        const meta = targetStatusMeta(target.status);
        const retryable = canRetry && onRetry && target.status === 'failed';
        return (
          <div
            key={target.id}
            className="border-base-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0"
          >
            <AccountAvatar
              platform={target.platform}
              name={target.targetName}
              src={avatarByTargetId.get(target.socialTargetId)}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate font-medium">{target.targetName}</span>
            <Badge color={meta.tone} variant="soft" size="sm">
              {meta.label}
            </Badge>
            {target.permalink ? (
              <a
                href={target.permalink}
                target="_blank"
                rel="noreferrer noopener"
                className="text-module inline-flex items-center gap-0.5 text-sm underline"
              >
                View
                <Icon glyph={faArrowUpRightFromSquare} className="size-3.5" aria-hidden />
              </a>
            ) : null}
            {retryable ? (
              <Button
                size="xs"
                variant="outline"
                color="module"
                loading={retrying === target.id}
                onClick={() => {
                  onRetry(target.id, target.targetName);
                }}
              >
                <Icon glyph={faArrowsRotate} className="size-3.5" aria-hidden />
                Try {target.targetName} again
              </Button>
            ) : null}
            {target.status === 'failed' && target.error ? (
              <Text className="text-error w-full text-sm">{target.error}</Text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ── Per-destination tuning on a SAVED post ───────────────────────────────── */

/**
 * The same three controls as the new-post version, but editing a row that already
 * exists — so they save on blur rather than being staged into a create call.
 *
 * Local state with a blur-commit rather than a keystroke-commit: sending a PATCH per
 * character would be absurd, and a Save button for one textarea would be worse.
 */
function SavedDestinationTuning({
  target,
  hashtagSets,
  saving,
  onSave,
}: {
  target: PostTarget;
  hashtagSets: HashtagSet[];
  saving: boolean;
  onSave: (next: { textOverride: string; firstComment: string; scheduledAt?: string }) => void;
}) {
  const [textOverride, setTextOverride] = useState(target.textOverride ?? '');
  const [firstComment, setFirstComment] = useState(target.firstComment ?? '');
  const [ownTime, setOwnTime] = useState(toLocalInput(target.scheduledAt));

  const commit = () => {
    onSave({ textOverride, firstComment, scheduledAt: ownTime });
  };

  return (
    <div className="border-base-300 flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <Text className="text-sm font-semibold">{target.targetName}</Text>
      <Textarea
        color="module"
        rows={2}
        value={textOverride}
        placeholder="Different wording just for this account…"
        aria-label={`Different wording for ${target.targetName}`}
        onChange={(event) => {
          setTextOverride(event.target.value);
        }}
        onBlur={commit}
      />
      <Input
        color="module"
        value={firstComment}
        placeholder="First comment (e.g. your hashtags)…"
        aria-label={`First comment for ${target.targetName}`}
        onChange={(event) => {
          setFirstComment(event.target.value);
        }}
        onBlur={commit}
      />
      {hashtagSets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Text className="text-sm">Add saved hashtags:</Text>
          {hashtagSets.map((set) => (
            <Button
              key={set.id}
              size="xs"
              variant="outline"
              color="module"
              disabled={saving}
              onClick={() => {
                const addition = tagsToText(set.tags);
                const next = firstComment.trim() ? `${firstComment.trim()} ${addition}` : addition;
                setFirstComment(next);
                onSave({ textOverride, firstComment: next, scheduledAt: ownTime });
              }}
            >
              {set.name}
            </Button>
          ))}
        </div>
      ) : null}
      <Field>
        <FieldLabel>Send to this account at its own time (optional)</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              type="datetime-local"
              className="max-w-xs"
              value={ownTime}
              aria-label={`Own send time for ${target.targetName}`}
              onChange={(event) => {
                setOwnTime(event.target.value);
              }}
              onBlur={commit}
            />
          }
        />
        <FieldDescription>
          Leave this blank and it goes when the rest of the post does. Set it when this audience is
          awake at a different hour.
        </FieldDescription>
      </Field>
    </div>
  );
}

/* ── How it did: the live numbers for a sent post (read-only) ─────────────── */

/**
 * One labelled number in the metrics row — a dash where the platform reported nothing,
 * never a fabricated zero.
 *
 * `since` is the same number at the FIRST reading, so the row can show which way it is
 * moving. That is the difference between a report and a scoreboard: 340 likes means
 * nothing on its own, "340, up 60 since we first looked" means the post is still
 * working. Shown only when it actually moved — "+0" is noise.
 */
function MetricNumber({
  label,
  value,
  since,
}: {
  label: string;
  value: number | null;
  since?: number | null;
}) {
  const delta = value !== null && since !== null && since !== undefined ? value - since : null;
  return (
    <div className="flex min-w-[3.5rem] flex-col items-end">
      <span className="text-lg font-semibold tabular-nums">
        {value === null ? '—' : value.toLocaleString()}
      </span>
      <span className="text-sm">
        {label}
        {delta !== null && delta > 0 ? (
          <span className="text-success"> +{delta.toLocaleString()}</span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The performance panel a sent post grows once it is live: the latest numbers for
 * each destination, a button to pull fresh ones, and a note on when they were last
 * checked. Read-only — this is a report, not a form. Reach and views are nullable
 * (a platform without the insights scope never reports them), so they show a dash.
 */
function PostMetricsSection({
  postId,
  avatarByTargetId,
  catalogMap,
}: {
  postId: string;
  avatarByTargetId: Map<string, string | null>;
  catalogMap: Map<SocialPlatform, CatalogEntry>;
}) {
  const toast = useToast();
  const refresh = useRefreshPostMetrics();

  // Asking for numbers only queues the platform round-trip, so the answer lands
  // seconds later on a background worker — not in the button's own response. We
  // keep re-reading until a newer snapshot shows up, and give up after a minute
  // rather than polling a post whose platform is never going to answer.
  const [collecting, setCollecting] = useState(false);
  const metrics = usePostMetrics(postId, collecting);

  const targets = useMemo(() => metrics.data?.targets ?? [], [metrics.data]);
  const hasAny = targets.some((t) => t.latest !== null);
  const missingScope = targets.some(
    (t) => t.latest !== null && (t.latest.reach === null || t.latest.impressions === null)
  );

  // The newest reading across every destination — the thing that has to MOVE for
  // a collection to count as landed.
  const newestReading = useMemo(
    () =>
      targets.reduce<string>(
        (max, t) => (t.latest && t.latest.collectedAt > max ? t.latest.collectedAt : max),
        ''
      ),
    [targets]
  );
  const readingAtRequest = useRef<string>('');

  useEffect(() => {
    if (!collecting) return;
    if (newestReading !== readingAtRequest.current) {
      setCollecting(false);
      return;
    }
    const giveUp = setTimeout(() => {
      setCollecting(false);
    }, 60_000);
    return () => {
      clearTimeout(giveUp);
    };
  }, [collecting, newestReading]);

  const doRefresh = () => {
    readingAtRequest.current = newestReading;
    refresh.mutate(postId, {
      onSuccess: () => {
        setCollecting(true);
        toast.add({ title: 'Checking with your accounts', type: 'info' });
      },
    });
  };

  return (
    <FormSection
      title="How it did"
      description="How this post is doing on each account. Numbers can take a little while to appear after it goes out."
      action={
        <Button
          size="sm"
          variant="outline"
          color="module"
          loading={refresh.isPending || collecting}
          onClick={doRefresh}
        >
          <Icon glyph={faArrowsRotate} className="size-4" aria-hidden />
          Refresh numbers
        </Button>
      }
    >
      {metrics.isPending ? (
        <Text className="text-sm">Loading…</Text>
      ) : metrics.isError ? (
        <Text className="text-error text-sm">
          {socialErrorMessage(
            metrics.error,
            'Could not load these numbers. Try Refresh in a moment.'
          )}
        </Text>
      ) : targets.length === 0 ? (
        <Text className="text-sm">This post has no destinations.</Text>
      ) : (
        <div className="flex flex-col gap-2">
          {targets.map((target) => {
            const s = target.latest;
            // The OLDEST reading, so "up N" means "since we first looked", not "since
            // the last refresh" (which would be near-zero and read as a dead post).
            // Only meaningful once there is more than one — a single snapshot has
            // nothing to compare against.
            const first = target.history.length > 1 ? target.history[0] : undefined;
            return (
              <div
                key={target.postTargetId}
                className="border-base-300 flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0"
              >
                <Avatar
                  size="sm"
                  src={avatarByTargetId.get(target.socialTargetId) ?? undefined}
                  alt={target.targetName}
                >
                  {target.targetName.replace(/^@/, '').charAt(0).toUpperCase()}
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{target.targetName}</span>
                  <span className="text-sm">{platformName(target.platform, catalogMap)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <MetricNumber label="Likes" value={s?.likes ?? null} since={first?.likes} />
                  <MetricNumber
                    label="Comments"
                    value={s?.comments ?? null}
                    since={first?.comments}
                  />
                  <MetricNumber label="Shares" value={s?.shares ?? null} since={first?.shares} />
                  <MetricNumber
                    label="Views"
                    value={s?.impressions ?? null}
                    since={first?.impressions}
                  />
                  <MetricNumber label="Reach" value={s?.reach ?? null} since={first?.reach} />
                </div>
                <span className="w-full text-sm">
                  {s
                    ? `Last checked ${formatWhen(s.collectedAt)}`
                    : 'No numbers yet for this account.'}
                </span>
              </div>
            );
          })}
          {/* The destinations render whether or not anything has come back yet — every
              account is listed, with a dash where a number is missing. This used to
              collapse the whole grid to a single "no numbers yet" sentence the moment no
              destination had a snapshot, which is the state a post is in for its first
              hour and the state it stays in permanently whenever collection is failing.
              Hiding the accounts hid the failure with them: there was nothing on screen
              to be suspicious about, so metrics stopping looked identical to metrics
              being new. A dash is a reading; an absent row is not. */}
          {!hasAny ? (
            <Text className="text-sm">
              {collecting
                ? 'Checking with your accounts — this takes a few seconds.'
                : productCopy(
                    'social.metrics.pending',
                    'Nothing reported back yet. Accounts answer on their own schedule, usually within a few hours of a post going out, and Piggles keeps re-checking. Refresh numbers asks now.'
                  )}
            </Text>
          ) : null}
          {missingScope ? (
            <Text className="text-sm">
              Reach and views need extra permissions from the platform.
            </Text>
          ) : null}
        </div>
      )}
    </FormSection>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WRITE A NEW POST
   ══════════════════════════════════════════════════════════════════════════ */

function ComposeNew({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const viewer = useViewer();
  const overview = useSocialOverview();
  const compose = useComposePost();

  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<
    Record<string, { textOverride: string; firstComment: string }>
  >({});
  // Seeded when the composer is opened from a calendar day (id:'new' + a schedule).
  const seedSchedule = typeof ctx.params.schedule === 'string' ? ctx.params.schedule : '';
  const [scheduleLocal, setScheduleLocal] = useState(seedSchedule);

  useEffect(() => {
    ctx.setTitle('New post');
  }, [ctx]);

  const isAdmin = canApprove(viewer.data?.role);
  const requireApproval = overview.data?.settings.requireApproval ?? true;
  const catalogMap = useMemo(
    () => catalogByPlatform(overview.data?.catalog ?? []),
    [overview.data]
  );

  const destinations = useDestinations(overview, catalogMap);
  const hashtagSets = useHashtagSets();

  // "Share this" from a product, collection or article — the composer opens pre-filled
  // instead of blank, which is the whole point of clicking it there rather than here.
  const seedType = typeof ctx.params.seedType === 'string' ? ctx.params.seedType : undefined;
  const seedId = typeof ctx.params.seedId === 'string' ? ctx.params.seedId : undefined;
  const seed = useComposeSeed(seedType, seedId);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    // Once only: after this the fields are the person's, and re-applying the suggestion
    // would overwrite their edits on any refetch.
    if (seeded || !seed.data) return;
    setSeeded(true);
    setBody(seed.data.body);
    setLink(seed.data.link ?? '');
    setMediaIds(seed.data.mediaAssetIds);
  }, [seed.data, seeded]);

  const dirty =
    body.trim() !== '' || link.trim() !== '' || mediaIds.length > 0 || selected.size > 0;
  useDirtySource(dirty && !compose.isSuccess, 'This post has not been saved yet. Close anyway?');

  // Resolve the picked media so the previews can render the REAL image, cropped to each
  // platform's shape. Kept in the author's chosen order (the query returns whatever
  // order it likes; order decides which image leads a carousel).
  const mediaAssets = useMediaAssets(mediaIds);
  const orderedAssets = useMemo<MediaAsset[]>(() => {
    const byId = new Map((mediaAssets.data ?? []).map((a) => [a.id, a]));
    return mediaIds.map((id) => byId.get(id)).filter((a): a is MediaAsset => a !== undefined);
  }, [mediaIds, mediaAssets.data]);

  const selectedDestinations = destinations.filter((d) => selected.has(d.targetId));
  const previews = selectedDestinations.map((dest) => {
    const constraints = catalogMap.get(dest.platform)?.constraints;
    const text = effectiveText(overrides[dest.targetId]?.textOverride, body);
    return { dest, preview: evaluateTarget(constraints, text, mediaIds.length) };
  });
  const hasBlock = previews.some((p) => p.preview.level === 'block');

  const composeTargets: ComposeTarget[] = selectedDestinations.map((dest) => {
    const ov = overrides[dest.targetId];
    return {
      targetId: dest.targetId,
      ...(ov?.textOverride.trim() ? { textOverride: ov.textOverride.trim() } : {}),
      ...(ov?.firstComment.trim() ? { firstComment: ov.firstComment.trim() } : {}),
    };
  });

  const canSaveDraft = body.trim() !== '' && selected.size > 0 && !compose.isPending;
  const scheduleIso = fromLocalInput(scheduleLocal);
  const scheduleValid = scheduleIso !== null && new Date(scheduleIso).getTime() > Date.now();

  const toggle = (targetId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  };

  const run = (action: ComposeAction) => {
    if (!canSaveDraft) return;
    compose.mutate(
      {
        input: {
          body: body.trim(),
          link: link.trim() ? link.trim() : null,
          mediaAssetIds: mediaIds,
          source: 'manual',
          targets: composeTargets,
        },
        action,
        ...(action === 'schedule' && scheduleIso ? { scheduledAt: scheduleIso } : {}),
      },
      {
        onSuccess: (post) => {
          ctx.open('social.composer', { id: post.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title:
                action === 'draft'
                  ? 'Draft saved'
                  : action === 'submit'
                    ? 'Sent for approval'
                    : action === 'schedule'
                      ? 'Post scheduled'
                      : 'Publishing now',
              type: 'success',
            });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  const failure = compose.isError
    ? socialErrorMessage(compose.error, 'Nothing was saved. Please try again.')
    : null;

  if (!canCompose(viewer.data?.role)) {
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            title="You cannot write posts"
            description="Writing and scheduling posts needs an editor or admin role. Ask a teammate with those permissions."
          />
        </Card>
      </div>
    );
  }

  // Media is REQUIRED the moment a destination that demands it is selected. The label
  // has to say so — calling it "optional" and letting the post fail later is the bug.
  const mediaRequiredBy = selectedDestinations.filter(
    (d) => catalogMap.get(d.platform)?.constraints.requiresMedia
  );
  const mediaMissing = mediaIds.length === 0 && mediaRequiredBy.length > 0;

  // Nowhere to post yet. NOT a banner above a form that cannot be submitted — the one
  // thing to do IS connecting an account, so it is the whole screen.
  if (overview.isSuccess && destinations.length === 0) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-start gap-4">
            <Heading level={1} className="text-2xl font-semibold">
              Connect an account to start posting
            </Heading>
            <Text>
              There is nowhere for a post to go yet. Connect a page or profile — your Facebook Page,
              Instagram, Google Business listing — and it shows up here as a destination you can
              write to.
            </Text>
            <Button
              color="module"
              onClick={() => {
                ctx.open('social.connections');
              }}
            >
              Connect an account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New post actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={compose.isPending && compose.variables?.action === 'draft'}
            disabled={!canSaveDraft}
            onClick={() => {
              run('draft');
            }}
          >
            <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
            Save draft
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Split studio: compose on the left, what it will ACTUALLY look like on the
            right. Stacks to one column below lg so the composer works on a phone. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Text>
              Write it once, choose where it goes, and see exactly how it lands on each account
              before it leaves.
            </Text>

            <SaveFailure title="Could not save this post" message={failure} />

            {/* MEDIA FIRST. Most of these platforms are pictures-and-video first, and four
              of them refuse a post without one — so this leads, and its label reflects
              the CURRENT selection instead of always saying "optional". */}
            <FormSection title="Pictures and video">
              <Field>
                <FieldLabel>
                  {mediaRequiredBy.length > 0 ? 'Required for this post' : 'Add a picture or video'}
                </FieldLabel>
                <AssetField
                  multiple
                  value={mediaIds}
                  onChange={(next) => {
                    setMediaIds(Array.isArray(next) ? (next as string[]) : []);
                  }}
                />
                <FieldDescription>
                  {mediaMissing ? (
                    <span className="text-error font-medium">
                      {listNames(mediaRequiredBy.map((d) => platformName(d.platform, catalogMap)))}{' '}
                      will not post without one.
                    </span>
                  ) : mediaRequiredBy.length > 0 ? (
                    <>
                      Needed by{' '}
                      {listNames(mediaRequiredBy.map((d) => platformName(d.platform, catalogMap)))}{' '}
                      — the preview shows how each one crops it.
                    </>
                  ) : (
                    <>
                      Optional for the accounts you have picked, but a picture is what gets a post
                      seen. The preview shows how each account crops it.
                    </>
                  )}
                </FieldDescription>
              </Field>
            </FormSection>

            <FormSection title="Your words">
              <Field>
                <FieldLabel>What do you want to say?</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={5}
                      value={body}
                      placeholder="Share news, an offer, or what you are up to…"
                      onChange={(event) => {
                        setBody(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  {body.length.toLocaleString()} {body.length === 1 ? 'character' : 'characters'} ·
                  the preview shows anything an account will cut.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Add a link (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={link}
                      placeholder="https://yourbusiness.com/news"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setLink(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  A page you want people to visit. Each account treats a link differently — the
                  preview shows which.
                </FieldDescription>
              </Field>
            </FormSection>

            {destinations.length > 0 ? (
              <FormSection
                title="Where it goes"
                description="Pick the pages and profiles this post should land on. Each shows how it will read there."
              >
                <DestinationPicker
                  destinations={destinations}
                  selected={selected}
                  catalogMap={catalogMap}
                  body={body}
                  overrides={overrides}
                  mediaCount={mediaIds.length}
                  onToggle={toggle}
                />
              </FormSection>
            ) : null}

            {selectedDestinations.length > 0 ? (
              <FormSection
                title="Fine-tune per destination (optional)"
                description="Leave these blank to use the same words everywhere. Set them only where one account needs something different."
              >
                <div className="flex flex-col gap-4">
                  {selectedDestinations.map((dest) => (
                    <DestinationTuning
                      key={dest.targetId}
                      dest={dest}
                      override={overrides[dest.targetId] ?? { textOverride: '', firstComment: '' }}
                      hashtagSets={hashtagSets.data ?? []}
                      onChange={(next) => {
                        setOverrides((current) => ({ ...current, [dest.targetId]: next }));
                      }}
                    />
                  ))}
                </div>
              </FormSection>
            ) : null}

            <FormSection title="Ready to send?">
              {selected.size === 0 ? (
                <Text className="text-sm">Pick at least one destination above first.</Text>
              ) : (
                <div className="flex flex-col gap-4">
                  {hasBlock ? (
                    <Alert color="warning">
                      <AlertContent>
                        <AlertTitle>One destination needs a fix first</AlertTitle>
                        <AlertDescription>
                          A destination above cannot post as things stand — add what it needs, or
                          turn it off for this post. You can still save a draft.
                        </AlertDescription>
                      </AlertContent>
                    </Alert>
                  ) : null}

                  {requireApproval ? (
                    <div className="flex items-start gap-2">
                      <Icon glyph={faShieldCheck} className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <Text className="text-sm">
                        Approval is on, so a post you schedule or submit waits for an admin before
                        it goes live.
                      </Text>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <Field className="min-w-0">
                        <FieldLabel>Schedule for later</FieldLabel>
                        <FieldControl
                          render={
                            <Input
                              color="module"
                              type="datetime-local"
                              className="max-w-xs"
                              value={scheduleLocal}
                              onChange={(event) => {
                                setScheduleLocal(event.target.value);
                              }}
                            />
                          }
                        />
                      </Field>
                      <Button
                        size="sm"
                        variant="outline"
                        color="module"
                        loading={compose.isPending && compose.variables?.action === 'schedule'}
                        disabled={!canSaveDraft || !scheduleValid || hasBlock}
                        onClick={() => {
                          run('schedule');
                        }}
                      >
                        <Icon glyph={faCalendarClock} className="size-4" aria-hidden />
                        Schedule
                      </Button>
                    </div>

                    <div className="border-base-300 flex flex-wrap items-center gap-2 border-t pt-3">
                      <Button
                        size="sm"
                        color="module"
                        variant="outline"
                        loading={compose.isPending && compose.variables?.action === 'submit'}
                        disabled={!canSaveDraft || hasBlock}
                        onClick={() => {
                          run('submit');
                        }}
                      >
                        <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
                        Submit for approval
                      </Button>
                      {isAdmin ? (
                        <Button
                          size="sm"
                          color="module"
                          loading={compose.isPending && compose.variables?.action === 'publish'}
                          disabled={!canSaveDraft || hasBlock}
                          onClick={() => {
                            run('publish');
                          }}
                        >
                          <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
                          Publish now
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </FormSection>
          </div>

          {/* The payoff: the real thing, per account, as you type. Sticky on desktop so
              it stays in view while the words change; just follows the flow on mobile. */}
          <aside className="flex w-full flex-col gap-3 lg:sticky lg:top-4 lg:w-[400px] lg:shrink-0">
            <div className="flex flex-col gap-1">
              <Heading level={2} className="text-base font-semibold">
                How it will look
              </Heading>
              <Text className="text-sm">
                {selectedDestinations.length === 0
                  ? 'Pick a destination and its preview appears here.'
                  : 'Cropped to each account’s shape, cut to its limit.'}
              </Text>
            </div>

            {selectedDestinations.length === 0 ? (
              <div className="border-base-300 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
                <Icon glyph={faImage} className="size-6" aria-hidden />
                <Text className="text-sm">No destinations picked yet.</Text>
              </div>
            ) : (
              selectedDestinations.map((dest) => {
                const ov = overrides[dest.targetId];
                return (
                  <PostPreview
                    key={dest.targetId}
                    platform={dest.platform}
                    platformLabel={platformName(dest.platform, catalogMap)}
                    destinationName={dest.name}
                    avatarUrl={dest.avatarUrl}
                    constraints={catalogMap.get(dest.platform)?.constraints}
                    text={effectiveText(ov?.textOverride, body)}
                    link={link.trim() || undefined}
                    firstComment={ov?.firstComment}
                    media={orderedAssets}
                  />
                );
              })
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MANAGE A SAVED POST
   ══════════════════════════════════════════════════════════════════════════ */

function ComposeManage({
  ctx,
  post,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  post: Post;
  isFetching: boolean;
  updatedAt: number | undefined;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const viewer = useViewer();
  const overview = useSocialOverview();
  const id = post.id;

  const update = useUpdatePost(id);
  const submit = useSubmitPost(id);
  const schedule = useSchedulePost(id);
  const approve = useApprovePost(id);
  const reject = useRejectPost(id);
  const publish = usePublishPost(id);
  const remove = useDeletePost(id);

  const updateTargets = useUpdatePostTargets(id);
  const retryTarget = useRetryPostTarget(id);
  const duplicate = useDuplicatePost();
  const setEvergreen = useSetPostEvergreen(id);
  const hashtagSets = useHashtagSets();

  const [body, setBody] = useState(post.body);
  const [link, setLink] = useState(post.link ?? '');
  const [mediaIds, setMediaIds] = useState<string[]>(post.mediaAssetIds);
  const [scheduleLocal, setScheduleLocal] = useState('');

  const isAdmin = canApprove(viewer.data?.role);
  const canWrite = canCompose(viewer.data?.role);
  const editable = isEditablePost(post.status);
  const meta = postStatusMeta(post.status);
  const catalogMap = useMemo(
    () => catalogByPlatform(overview.data?.catalog ?? []),
    [overview.data]
  );
  const destinations = useDestinations(overview, catalogMap);

  // Which destinations this post currently has, and which of those can no longer be
  // removed because they already went out — taking that row away would erase the
  // permalink of something live on someone's page.
  const selectedTargetIds = useMemo(
    () => new Set(post.targets.map((t) => t.socialTargetId)),
    [post.targets]
  );
  const lockedTargetIds = useMemo(
    () =>
      new Set(post.targets.filter((t) => t.status === 'published').map((t) => t.socialTargetId)),
    [post.targets]
  );
  const postTargetBySocialId = useMemo(
    () => new Map(post.targets.map((t) => [t.socialTargetId, t])),
    [post.targets]
  );
  const overridesFromPost = useMemo(() => {
    const out: Record<string, { textOverride: string; firstComment: string }> = {};
    for (const target of post.targets) {
      out[target.socialTargetId] = {
        textOverride: target.textOverride ?? '',
        firstComment: target.firstComment ?? '',
      };
    }
    return out;
  }, [post.targets]);

  // Resolve the picked media so this saved post shows the SAME visual preview the
  // composer does — cropped to each account's shape (docs/133). Polls while a fresh
  // upload is still transcoding, so the image appears on its own once its crops land.
  const mediaAssets = useMediaAssets(mediaIds);
  const orderedAssets = useMemo<MediaAsset[]>(() => {
    const byId = new Map((mediaAssets.data ?? []).map((a) => [a.id, a]));
    return mediaIds.map((id) => byId.get(id)).filter((a): a is MediaAsset => a !== undefined);
  }, [mediaIds, mediaAssets.data]);

  // A target's avatar isn't on the post row — look it up from the live connections
  // so the preview header shows the real account picture (null → initials).
  const avatarByTargetId = useMemo(() => {
    const out = new Map<string, string | null>();
    for (const connection of overview.data?.connections ?? []) {
      for (const t of connection.targets) out.set(t.id, t.avatarUrl ?? connection.avatarUrl);
    }
    return out;
  }, [overview.data]);

  useEffect(() => {
    ctx.setTitle(titleFor(post.body));
  }, [ctx, post.body]);

  const changed =
    body !== post.body ||
    link !== (post.link ?? '') ||
    mediaIds.join(',') !== post.mediaAssetIds.join(',');
  useDirtySource(editable && changed, 'This post has unsaved changes. Close anyway?');

  const scheduleIso = fromLocalInput(scheduleLocal);
  const scheduleValid = scheduleIso !== null && new Date(scheduleIso).getTime() > Date.now();

  const actionError = useMemo(() => {
    const failed = [update, submit, schedule, approve, reject, publish, remove].find(
      (m) => m.isError
    );
    if (!failed) return null;
    return socialErrorMessage(failed.error, 'That did not go through. Nothing was changed.');
  }, [update, submit, schedule, approve, reject, publish, remove]);

  const saveChanges = () => {
    if (!changed) return;
    update.mutate(
      { body: body.trim(), link: link.trim() ? link.trim() : null, mediaAssetIds: mediaIds },
      {
        onSuccess: () => {
          toast.add({ title: 'Changes saved', type: 'success' });
        },
      }
    );
  };

  const doSubmit = () => {
    submit.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: 'Sent for approval', type: 'success' });
      },
    });
  };

  const doSchedule = () => {
    if (!scheduleIso || !scheduleValid) return;
    schedule.mutate(scheduleIso, {
      onSuccess: (updated) => {
        toast.add({
          title: updated.status === 'scheduled' ? 'Scheduled' : 'Scheduled, awaiting approval',
          description: updated.scheduledAt
            ? `Goes out ${formatWhen(updated.scheduledAt)}.`
            : undefined,
          type: 'success',
        });
      },
    });
  };

  const doApprove = () => {
    approve.mutate(undefined, {
      onSuccess: (updated) => {
        toast.add({
          title: updated.status === 'scheduled' ? 'Approved and scheduled' : 'Approved — going out',
          type: 'success',
        });
      },
    });
  };

  const doReject = () => {
    void (async () => {
      const ok = await confirm({
        title: 'Send this post back?',
        description:
          'It goes back to a draft so it can be changed and submitted again. Nothing is posted.',
        confirmLabel: 'Send it back',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      reject.mutate(undefined, {
        onSuccess: () => {
          toast.add({ title: 'Sent back to draft', type: 'success' });
        },
      });
    })();
  };

  const doPublish = () => {
    publish.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: 'Publishing now', type: 'success' });
      },
    });
  };

  /** Turn a destination on or off on a saved post. Immediate, not a staged edit: the
   *  destination list is a decision, not text being drafted, and a Save button for it
   *  would make "did that take?" a question. */
  const toggleDestination = (socialTargetId: string) => {
    const existing = postTargetBySocialId.get(socialTargetId);
    const input = existing ? { remove: [existing.id] } : { add: [{ targetId: socialTargetId }] };
    updateTargets.mutate(input, {
      onError: (error) => {
        toast.add({
          title: 'Could not change where this goes',
          description: socialErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const saveTuning = (
    postTargetId: string,
    next: { textOverride: string; firstComment: string; scheduledAt?: string }
  ) => {
    updateTargets.mutate({
      update: [
        {
          id: postTargetId,
          textOverride: next.textOverride.trim() || null,
          firstComment: next.firstComment.trim() || null,
          ...(next.scheduledAt !== undefined
            ? { scheduledAt: next.scheduledAt ? fromLocalInput(next.scheduledAt) : null }
            : {}),
        },
      ],
    });
  };

  const doRetryTarget = (postTargetId: string, name: string) => {
    retryTarget.mutate(postTargetId, {
      onSuccess: () => {
        toast.add({ title: `Sending to ${name} again`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not send that again',
          description: socialErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const doDuplicate = () => {
    duplicate.mutate(post.id, {
      onSuccess: (copy) => {
        ctx.open('social.composer', { id: copy.id });
        afterPaneChange(() => {
          toast.add({
            title: 'Copied to a new draft',
            description: 'Same words, pictures and accounts — edit it however you like.',
            type: 'success',
          });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not copy this post',
          description: socialErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const doDelete = () => {
    void (async () => {
      const ok = await confirm({
        title: 'Delete this post?',
        description:
          'This removes the post and its schedule for good. Anything already posted to your accounts stays live there. This cannot be undone.',
        confirmLabel: 'Delete it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      remove.mutate(undefined, {
        onSuccess: () => {
          ctx.close();
          afterPaneChange(() => {
            toast.add({ title: 'Post deleted', type: 'success' });
          });
        },
      });
    })();
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Post actions"
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={updatedAt} onRefresh={onRefresh} />
        }
        status={
          <>
            <Badge color={meta.tone} variant="soft" size="sm">
              {meta.label}
            </Badge>
            <div className="flex-1" />
          </>
        }
        // Save is `primary`, never `controls`: `controls` relocates into the
        // overflow popover under 672px, and a commit action must be reachable
        // at every width. Enforced by scripts/check-toolbar-primary.mjs.
        primary={
          editable && canWrite ? (
            <Button
              color="module"
              size="sm"
              disabled={!changed || update.isPending}
              loading={update.isPending}
              onClick={saveChanges}
            >
              <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
              Save changes
            </Button>
          ) : null
        }
        controls={
          <>
            {/* Post it again — the cheapest real leverage in the module. Available on
            anything that has actually gone out. */}
            {canWrite && (post.status === 'published' || post.status === 'partially_published') ? (
              <Button
                size="sm"
                variant="outline"
                color="module"
                loading={duplicate.isPending}
                onClick={doDuplicate}
              >
                <Icon glyph={faClone} className="size-4" aria-hidden />
                Post this again
              </Button>
            ) : null}
            {/* Delete is a lifecycle action on the whole post, so it rides the frame
            header with the rest of them — icon-only, because a destructive verb
            spelled out next to Save is the one pair worth keeping visually
            unalike. The confirm names what is lost before anything happens. */}
            {isAdmin && post.status !== 'publishing' ? (
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                shape="square"
                aria-label="Delete this post"
                title="Delete this post"
                loading={remove.isPending}
                onClick={doDelete}
              >
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Same split studio as writing a new post: the post on the left, the real
            per-account preview pinned on the right so it stays in view while the
            words change. Stacks to one column below lg for a phone. */}
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                {post.status === 'draft' ? 'Draft post' : 'Post'}
              </Heading>
              <Text className="text-sm">{meta.detail}</Text>
            </div>

            <SaveFailure title="That did not go through" message={actionError} />

            {/* Why it came back. Without this a rejection is a silent state change and
                the author has to go and ask what was wrong with it. */}
            {post.reviewNote && post.status === 'draft' ? (
              <Alert color="warning">
                <AlertContent>
                  <AlertTitle>Sent back for a change</AlertTitle>
                  <AlertDescription>{post.reviewNote}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {editable && canWrite ? (
              <FormSection title="Your post">
                <Field>
                  <FieldLabel>What do you want to say?</FieldLabel>
                  <FieldControl
                    render={
                      <Textarea
                        color="module"
                        rows={5}
                        value={body}
                        onChange={(event) => {
                          setBody(event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    {body.length.toLocaleString()} {body.length === 1 ? 'character' : 'characters'}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Link (optional)</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        value={link}
                        placeholder="https://yourbusiness.com/news"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => {
                          setLink(event.target.value);
                        }}
                      />
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>Pictures or video (optional)</FieldLabel>
                  <AssetField
                    multiple
                    value={mediaIds}
                    onChange={(next) => {
                      setMediaIds(Array.isArray(next) ? (next as string[]) : []);
                    }}
                  />
                </Field>
              </FormSection>
            ) : (
              <FormSection title="Your post">
                <Text className="whitespace-pre-wrap">{post.body}</Text>
                {post.link ? (
                  <a
                    href={post.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-module inline-flex items-center gap-0.5 text-sm underline"
                  >
                    {post.link}
                    <Icon glyph={faArrowUpRightFromSquare} className="size-3.5" aria-hidden />
                  </a>
                ) : null}
                <MediaThumbs ids={post.mediaAssetIds} />
              </FormSection>
            )}

            <FormSection
              title="Where it goes"
              description={
                editable && canWrite
                  ? 'Turn accounts on or off — you can change this right up until it sends.'
                  : 'The accounts this post was set up to reach, and how each is doing.'
              }
            >
              {editable && canWrite && destinations.length > 0 ? (
                <DestinationPicker
                  destinations={destinations}
                  selected={selectedTargetIds}
                  catalogMap={catalogMap}
                  body={body}
                  overrides={overridesFromPost}
                  mediaCount={mediaIds.length}
                  disabledIds={lockedTargetIds}
                  onToggle={toggleDestination}
                />
              ) : post.targets.length === 0 ? (
                <Text className="text-sm">This post has no destinations.</Text>
              ) : (
                <TargetResults
                  targets={post.targets}
                  avatarByTargetId={avatarByTargetId}
                  canRetry={isAdmin}
                  retrying={retryTarget.isPending ? (retryTarget.variables ?? null) : null}
                  onRetry={doRetryTarget}
                />
              )}
            </FormSection>

            {/* How it did — the live numbers, once the post is actually out. Sits with
                the rest of the post's story in the left column (it is a section like
                any other, not a full-width band under the studio), directly after the
                destinations it reports on. */}
            {post.status === 'published' || post.status === 'partially_published' ? (
              <PostMetricsSection
                postId={post.id}
                avatarByTargetId={avatarByTargetId}
                catalogMap={catalogMap}
              />
            ) : null}

            {/* Per-destination tuning, on a SAVED post — different wording, the first
                comment where the hashtags live, and this destination's own send time.
                Each field saves on blur, so nothing here needs its own Save button. */}
            {editable && canWrite && post.targets.length > 0 ? (
              <FormSection
                title="Fine-tune per destination (optional)"
                description="Leave these blank to use the same words everywhere, and the same time. Set them only where one account needs something different."
              >
                <div className="flex flex-col gap-4">
                  {post.targets.map((target) => (
                    <SavedDestinationTuning
                      key={target.id}
                      target={target}
                      hashtagSets={hashtagSets.data ?? []}
                      saving={updateTargets.isPending}
                      onSave={(next) => {
                        saveTuning(target.id, next);
                      }}
                    />
                  ))}
                </div>
              </FormSection>
            ) : null}

            {/* Lifecycle actions — only while the post can still move. */}
            {editable && canWrite ? (
              <FormSection title="Send">
                <div className="flex flex-col gap-4">
                  {post.status === 'pending_approval' && isAdmin ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        color="module"
                        loading={approve.isPending}
                        onClick={doApprove}
                      >
                        <Icon glyph={faCheck} className="size-4" aria-hidden />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        color="danger"
                        loading={reject.isPending}
                        onClick={doReject}
                      >
                        <Icon glyph={faXmark} className="size-4" aria-hidden />
                        Send back
                      </Button>
                    </div>
                  ) : null}

                  {post.status === 'draft' ? (
                    <Button
                      size="sm"
                      color="module"
                      variant="outline"
                      className="self-start"
                      loading={submit.isPending}
                      onClick={doSubmit}
                    >
                      <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
                      Submit for approval
                    </Button>
                  ) : null}

                  <div className="flex flex-wrap items-end gap-3">
                    <Field className="min-w-0">
                      <FieldLabel>
                        {post.scheduledAt ? 'Change the time' : 'Schedule for later'}
                      </FieldLabel>
                      <FieldControl
                        render={
                          <Input
                            color="module"
                            type="datetime-local"
                            className="max-w-xs"
                            value={scheduleLocal}
                            onChange={(event) => {
                              setScheduleLocal(event.target.value);
                            }}
                          />
                        }
                      />
                    </Field>
                    <Button
                      size="sm"
                      variant="outline"
                      color="module"
                      disabled={!scheduleValid || schedule.isPending}
                      loading={schedule.isPending}
                      onClick={doSchedule}
                    >
                      <Icon glyph={faCalendarClock} className="size-4" aria-hidden />
                      {post.scheduledAt ? 'Reschedule' : 'Schedule'}
                    </Button>
                  </div>
                  {post.scheduledAt ? (
                    <Text className="text-sm">
                      Currently set for {formatWhen(post.scheduledAt)}.
                    </Text>
                  ) : null}

                  {isAdmin ? (
                    <div className="border-base-300 border-t pt-3">
                      <Button
                        size="sm"
                        color="module"
                        loading={publish.isPending}
                        onClick={doPublish}
                      >
                        <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
                        {post.status === 'failed' ? 'Try publishing again' : 'Publish now'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </FormSection>
            ) : null}

            {/* Run it again, later. A post worth running twice is worth marking once —
                the posting cadence draws from this pool to fill the times a business
                said it wanted to post but has nothing planned for. */}
            {canWrite && (post.status === 'published' || post.status === 'partially_published') ? (
              <FormSection title="Keep this one around">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Icon glyph={faRepeat} className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <Text className="text-sm">
                      {productCopy(
                        'social.evergreen.explain',
                        'Add this to the posts you’re happy to run again. When a posting time on your calendar has nothing planned, Piggles can fill it from here — you still approve anything before it goes out.'
                      )}
                    </Text>
                  </div>
                  <Switch
                    color="module"
                    checked={post.evergreen}
                    disabled={setEvergreen.isPending}
                    aria-label="Run this post again in future"
                    onCheckedChange={(next: boolean) => {
                      setEvergreen.mutate(next, {
                        onSuccess: () => {
                          toast.add({
                            title: next
                              ? 'Added to your run-again posts'
                              : 'Removed from your run-again posts',
                            type: 'success',
                          });
                        },
                      });
                    }}
                  />
                </div>
              </FormSection>
            ) : null}
          </div>

          {/* The payoff, pinned: the real thing per account, so it stays in view
              while the words and pictures change. Follows the flow on mobile. */}
          <aside className="flex w-full flex-col gap-3 lg:sticky lg:top-4 lg:w-[400px] lg:shrink-0">
            <div className="flex flex-col gap-1">
              <Heading level={2} className="text-base font-semibold">
                How it will look
              </Heading>
              <Text className="text-sm">
                {post.targets.length === 0
                  ? 'This post has no destinations.'
                  : 'The real thing, per account — cropped to its shape, cut to its limit.'}
              </Text>
            </div>

            {post.targets.length === 0 ? (
              <div className="border-base-300 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
                <Icon glyph={faImage} className="size-6" aria-hidden />
                <Text className="text-sm">Nowhere to preview.</Text>
              </div>
            ) : (
              post.targets.map((target) => (
                <PostPreview
                  key={target.id}
                  platform={target.platform}
                  platformLabel={platformName(target.platform, catalogMap)}
                  destinationName={target.targetName}
                  avatarUrl={avatarByTargetId.get(target.socialTargetId) ?? null}
                  constraints={catalogMap.get(target.platform)?.constraints}
                  text={body}
                  link={link.trim() || undefined}
                  media={orderedAssets}
                />
              ))
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PANE
   ══════════════════════════════════════════════════════════════════════════ */

function ComposerInner({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const post = useSocialPost(id);

  if (id === 'new') return <ComposeNew ctx={ctx} />;

  if (post.isError) {
    const gone = post.error instanceof Error && 'status' in post.error && post.error.status === 404;
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            reason={gone ? 'missing' : 'unreachable'}
            title={gone ? 'This post no longer exists' : 'Could not load this post'}
            description={
              gone
                ? 'It may have been deleted. Nothing else is affected.'
                : 'This is a problem reaching the server. Nothing about the post has changed.'
            }
            onRetry={() => {
              void post.refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (post.isPending || !post.data) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting />
      </div>
    );
  }

  return (
    <ComposeManage
      key={post.data.id}
      ctx={ctx}
      post={post.data}
      isFetching={post.isFetching}
      updatedAt={post.dataUpdatedAt}
      onRefresh={() => {
        void post.refetch();
      }}
    />
  );
}

export function SocialComposerSurface({ ctx }: { ctx: SurfaceContext }) {
  // The media browser is mounted once here so the compose fields can open it.
  return (
    <MediaPickerProvider source="marketing">
      <ComposerInner ctx={ctx} />
    </MediaPickerProvider>
  );
}

export default SocialComposerSurface;
