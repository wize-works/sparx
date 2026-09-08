'use client';

// One segment — create it, then manage it.
//
// Create and manage are the SAME surface: `{ id: 'new' }` builds a segment, `{ id }`
// manages one. The heart of it is the rule builder — a recursive tree of "include
// customers that match all/any of these conditions" that compiles to the exact
// predicate tree the server stores and evaluates. As the rules change, a live
// preview asks the server how many customers match right now, so an owner sees the
// audience take shape before saving. Identity (name, slug) is fields at the top,
// not a repeated heading; archiving is the one destructive act, behind a confirm.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useState } from 'react';
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
  FieldStatus,
  Input,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { faBoxArchive } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { ListMembership } from './list-membership';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useTeamRoster } from '../../lib/api/team';
import { customerName, customerTypeMeta } from './customer-display';
import { useAccounts } from './companies-data';
import {
  segmentErrorMessage,
  segmentMembership,
  useArchiveSegment,
  useCreateSegment,
  usePreviewCount,
  useSegment,
  useSegmentMemberCount,
  useRecomputeSegment,
  useSegmentMembers,
  useUpdateSegment,
  type Segment,
  type SegmentInput,
} from './segments-data';
import {
  emptyRoot,
  parseServerRule,
  serializeNode,
  SLUG_RE,
  slugify,
  type GroupNode,
  type SegmentRule,
} from './segment-rules';
import { RuleGroupEditor } from './segment-rule-builder';
import { SaveFailure } from '@/components/save-failure';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function SegmentDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <SegmentEditor ctx={ctx} id="new" /> : <SegmentLoader ctx={ctx} id={id} />;
}

function SegmentLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: segment,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useSegment(id);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="segment"
            title="Could not load this segment"
            description="This is a problem reaching the server, or the segment has been removed. Nothing has been changed."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !segment) {
    return <PaneWaiting />;
  }

  return (
    <SegmentEditor
      ctx={ctx}
      id={id}
      segment={segment}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

interface Identity {
  name: string;
  slug: string;
  description: string;
}

function SegmentEditor({
  ctx,
  id,
  segment,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  segment?: Segment;
  /** The loader's query, threaded down. Absent while creating — a segment that
   *  does not exist yet has nothing to re-read. */
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const recompute = useRecomputeSegment();
  const confirm = useConfirm();

  const create = useCreateSegment();
  const update = useUpdateSegment(id);
  const archive = useArchiveSegment(id);
  const memberCount = useSegmentMemberCount(id);
  const memberList = useSegmentMembers(id);
  const savedCount = memberCount.data;
  const members = memberList.data;
  const { members: roster } = useTeamRoster();
  const { data: accounts } = useAccounts();

  const savedIdentity = useMemo<Identity>(
    () => ({
      name: segment?.name ?? '',
      slug: segment?.slug ?? '',
      description: segment?.description ?? '',
    }),
    [segment]
  );
  const savedRoot = useMemo<GroupNode>(
    () => (segment ? parseServerRule(segment.rules) : emptyRoot()),
    [segment]
  );

  const savedKind: 'dynamic' | 'static' = segment?.kind ?? 'dynamic';

  const [identity, setIdentity] = useState<Identity>(savedIdentity);
  const [root, setRoot] = useState<GroupNode>(savedRoot);
  const [kind, setKindState] = useState<'dynamic' | 'static'>(savedKind);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [touched, setTouched] = useState(false);

  const setKind = (next: 'dynamic' | 'static') => {
    setTouched(true);
    setKindState(next);
  };

  // Reset from the server copy until the operator has started editing.
  useEffect(() => {
    if (!touched) {
      setIdentity(savedIdentity);
      setRoot(savedRoot);
      setKindState(savedKind);
    }
  }, [savedIdentity, savedRoot, savedKind, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New segment' : segment ? segment.name : 'Segment');
  }, [ctx, isNew, segment]);

  const setName = (name: string) => {
    setTouched(true);
    setIdentity((cur) => ({
      ...cur,
      name,
      // Keep the slug in step with the name until the operator edits it directly.
      slug: slugTouched ? cur.slug : slugify(name),
    }));
  };
  const setSlug = (slug: string) => {
    setTouched(true);
    setSlugTouched(true);
    setIdentity((cur) => ({ ...cur, slug: slug.toLowerCase() }));
  };
  const setDescription = (description: string) => {
    setTouched(true);
    setIdentity((cur) => ({ ...cur, description }));
  };
  const changeRoot = (next: GroupNode) => {
    setTouched(true);
    setRoot(next);
  };

  /* ── Options for the value pickers ────────────────────────────────────── */

  const repItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const m of roster) items[m.userId] = m.name ?? m.email;
    return items;
  }, [roster]);
  const accountItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const a of accounts?.items ?? []) items[a.id] = a.companyName;
    return items;
  }, [accounts]);

  /* ── Serialize + live preview ─────────────────────────────────────────── */

  const serialized = useMemo(() => serializeNode(root), [root]);
  const ruleForPreview = serialized.ok ? serialized.rule : null;
  const previewKey = ruleForPreview ? JSON.stringify(ruleForPreview) : '';

  const [debouncedRule, setDebouncedRule] = useState<SegmentRule | null>(null);
  useEffect(() => {
    if (previewKey === '') {
      setDebouncedRule(null);
      return;
    }
    const handle = setTimeout(() => {
      setDebouncedRule(JSON.parse(previewKey) as SegmentRule);
    }, 400);
    return () => {
      clearTimeout(handle);
    };
  }, [previewKey]);
  const preview = usePreviewCount(debouncedRule);

  /* ── Validation + dirty ───────────────────────────────────────────────── */

  const nameError = identity.name.trim() === '' ? 'Give the segment a name.' : null;
  const slugError =
    identity.slug.trim() === ''
      ? 'Give the segment a short id.'
      : !SLUG_RE.test(identity.slug.trim())
        ? 'The id can use lowercase letters, numbers and dashes, and must start with a letter.'
        : null;
  // A HAND-PICKED list has no rules to get wrong, so an incomplete rule tree is
  // not an error there — it is just the rules somebody wrote before switching,
  // kept in case they switch back (docs/144 §10).
  const rulesError = kind === 'static' || serialized.ok ? null : serialized.error;
  const blocked = nameError ?? slugError ?? rulesError;

  const savedKey = useMemo(() => {
    const savedRule = serializeNode(savedRoot);
    return JSON.stringify({
      ...savedIdentity,
      kind: savedKind,
      rule: savedRule.ok ? savedRule.rule : null,
    });
  }, [savedIdentity, savedRoot, savedKind]);
  const currentKey = JSON.stringify({ ...identity, kind, rule: ruleForPreview });
  const dirty = isNew ? touched : currentKey !== savedKey;
  const saving = create.isPending || update.isPending;
  const isArchived = segment?.archivedAt != null;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This segment has not been created yet. Close anyway?'
      : 'This segment has unsaved changes. Close anyway?'
  );

  const failure =
    create.isError || update.isError
      ? segmentErrorMessage(
          create.error ?? update.error,
          'The server did not answer. Nothing was changed and your work is still on screen — try again in a moment.'
        )
      : null;

  /* ── Submit ───────────────────────────────────────────────────────────── */

  const submit = () => {
    // `serialized.ok` is still required: even a hand-picked list stores SOME
    // rule document, and an unserializable tree has nothing to store.
    if (blocked || !serialized.ok) return;
    const input: SegmentInput = {
      name: identity.name.trim(),
      slug: identity.slug.trim(),
      description: identity.description.trim() === '' ? null : identity.description.trim(),
      kind,
      // The rules are sent even for a hand-picked list, and KEPT rather than
      // cleared — switching to hand-picked and back should not throw away work
      // somebody did on the conditions.
      rules: serialized.rule,
    };

    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('crm.segment.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${input.name ?? 'Segment'} created`, type: 'success' });
          });
        },
        onError: shownInPlace,
      });
      return;
    }

    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Segment saved', type: 'success' });
      },
      onError: shownInPlace,
    });
  };

  const onArchive = async () => {
    if (!segment) return;
    const ok = await confirm({
      title: `Archive ${segment.name}?`,
      description:
        'This stops the segment being used to target anyone. Its definition is kept, so you can find it again by including archived segments in the list. The customers themselves are untouched.',
      confirmLabel: 'Archive this segment',
      cancelLabel: 'Keep it',
      color: 'warning',
    });
    if (!ok) return;
    archive.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${segment.name} archived`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not archive this segment',
          description: segmentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const sample = members?.items ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Segment actions"
        refresh={
          onRefresh ? (
            <RefreshButton
              isFetching={Boolean(isFetching) || memberCount.isFetching || memberList.isFetching}
              updatedAt={segment ? updatedAt : undefined}
              onRefresh={() => {
                onRefresh();
                void memberCount.refetch();
                void memberList.refetch();
              }}
            />
          ) : undefined
        }
        status={
          <>
            {segment?.isBuiltIn ? (
              <Badge color="module" variant="soft" size="sm">
                Built-in
              </Badge>
            ) : null}
            {isArchived ? (
              <Badge color="neutral" variant="soft" size="sm">
                Archived
              </Badge>
            ) : null}
            <PreviewLabel
              loading={preview.isFetching}
              matches={preview.data?.matches}
              sampled={preview.data?.sampled}
              total={preview.data?.total}
              invalid={!serialized.ok}
            />
          </>
        }
        primary={
          <>
            {/* Only once it exists, and only for rule-driven groups — a hand-picked
            list has no rules to re-derive membership from, and re-cutting one
            would empty something somebody built by hand. */}
            {!isNew && segment?.kind === 'dynamic' ? (
              <Tooltip content="Re-check every customer against these rules. Membership normally keeps itself up to date; use this if a group looks out of date.">
                <Button
                  color="module"
                  variant="soft"
                  size="sm"
                  className="ml-auto shrink-0"
                  loading={recompute.isPending}
                  onClick={() => {
                    recompute.mutate(segment.id, {
                      onSuccess: (result) => {
                        toast.add({
                          title:
                            result.changed === 0
                              ? 'Already up to date'
                              : `${result.changed.toLocaleString()} ${result.changed === 1 ? 'person' : 'people'} moved in or out`,
                          description: `Checked ${result.scanned.toLocaleString()} customers.`,
                          type: 'success',
                        });
                      },
                      onError: () => {
                        toast.add({
                          title: 'Could not update the membership',
                          description: 'Nothing was changed — try again in a moment.',
                          type: 'error',
                        });
                      },
                    });
                  }}
                >
                  Update membership
                </Button>
              </Tooltip>
            ) : null}
            <Button
              color="module"
              size="sm"
              className={!isNew && segment?.kind === 'dynamic' ? 'shrink-0' : 'ml-auto shrink-0'}
              loading={saving}
              disabled={Boolean(blocked) || (!isNew && !dirty)}
              onClick={submit}
            >
              {isNew ? 'Create segment' : 'Save'}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <Text>
              A segment is a saved group of customers built from conditions — big spenders, or
              everyone who has not bought in a year. As you add conditions, the count in the bar
              shows how many customers match right now.
            </Text>
          ) : null}

          <SaveFailure title="Could not save this segment" message={failure} />

          {isArchived ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>This segment is archived</AlertTitle>
                <AlertDescription>
                  It is not targeting anyone. You can still edit and save it here; saving does not
                  bring it back on its own.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection title="Name">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={identity.name}
                    placeholder="Big spenders"
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? <FieldStatus status="error">{nameError}</FieldStatus> : null}
            </Field>

            <Field>
              <FieldLabel>Short id</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={slugError && touched ? 'error' : 'module'}
                    value={identity.slug}
                    placeholder="big-spenders"
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono"
                    onChange={(event) => {
                      setSlug(event.target.value);
                    }}
                  />
                }
              />
              {slugError && touched ? (
                <FieldStatus status="error">{slugError}</FieldStatus>
              ) : (
                <FieldDescription>
                  A short, lowercase id used behind the scenes — for example when a marketing email
                  targets this group. Filled in from the name; change it if you like.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Description</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={identity.description}
                    placeholder="What this group is, in your own words."
                    onChange={(event) => {
                      setDescription(event.target.value);
                    }}
                  />
                }
              />
            </Field>

            {/* How membership is decided (docs/144 §10). Asked HERE, alongside
                the name, because it changes what the rest of the screen even is
                — and because switching it later is a real decision, not a
                setting somebody flips by accident further down. */}
            <Field>
              <FieldLabel>Who belongs in it</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['dynamic', 'Work it out from rules', 'Membership keeps itself up to date.'],
                    ['static', 'I’ll pick people myself', 'Nobody joins or leaves unless you say.'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kind === value}
                    className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left ${
                      kind === value
                        ? 'border-module bg-module/10'
                        : 'border-base-300 hover:border-base-content/20'
                    }`}
                    onClick={() => {
                      setKind(value);
                    }}
                  >
                    <span className="text-base font-semibold">{label}</span>
                    <span className="text-sm">{hint}</span>
                  </button>
                ))}
              </div>
              <FieldDescription>
                {kind === 'static'
                  ? 'Your rules are kept, so you can switch back without losing them.'
                  : 'Anyone who matches is added automatically, and anyone who stops matching drops out.'}
              </FieldDescription>
            </Field>
          </FormSection>

          {kind === 'dynamic' ? (
            <FormSection
              title="Conditions"
              description="Build up who belongs in this segment. A customer is in it when they match the rules below."
            >
              {rulesError && touched ? (
                <Alert color="warning">
                  <AlertContent>
                    <AlertDescription>{rulesError}</AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}

              <RuleGroupEditor
                node={root}
                repItems={repItems}
                accountItems={accountItems}
                onChange={changeRoot}
              />
            </FormSection>
          ) : isNew ? (
            <FormSection title="Who is on it">
              <Text className="text-base">
                Create the list first, then you can start putting people on it.
              </Text>
            </FormSection>
          ) : (
            // Membership saves on the spot, so it sits OUTSIDE the form's own
            // Save — see the note at the top of list-membership.
            <ListMembership segmentId={id} segmentName={identity.name || 'this list'} />
          )}

          {!isNew && segment && !isArchived ? (
            <FormSection
              title="In this segment now"
              description="The saved membership, refreshed after you save changes to the rules."
            >
              <div className="flex flex-col gap-1">
                <Text className="text-sm">Members</Text>
                <span className="text-2xl font-semibold tabular-nums">
                  {(savedCount?.total ?? 0).toLocaleString()}
                </span>
                <Text className="text-sm">{segmentMembership(savedCount?.total ?? 0)}</Text>
              </div>

              {sample.length > 0 ? (
                <ul className="border-base-300 divide-base-300 divide-y rounded-lg border">
                  {sample.slice(0, 10).map((member) => {
                    const meta = customerTypeMeta(member.customer.type);
                    return (
                      <li key={member.customerId}>
                        <button
                          type="button"
                          className="hover:bg-base-200 flex w-full items-center gap-2 px-3 py-2 text-left"
                          onClick={(event) => {
                            ctx.open(
                              'crm.customer.detail',
                              { id: member.customerId },
                              { target: targetFor(event) }
                            );
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {customerName(member.customer)}
                          </span>
                          {member.customer.email ? (
                            <span className="hidden min-w-0 truncate text-sm @sm:inline">
                              {member.customer.email}
                            </span>
                          ) : null}
                          <Badge color={meta.color} variant="soft" size="sm">
                            {meta.label}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </FormSection>
          ) : null}

          {!isNew && segment && !isArchived ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Archiving stops this segment targeting anyone. Its definition is kept.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="warning"
                loading={archive.isPending}
                onClick={() => {
                  void onArchive();
                }}
              >
                <Icon glyph={faBoxArchive} className="size-4" aria-hidden />
                Archive this segment
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── The live match count in the toolbar ────────────────────────────────── */

function PreviewLabel({
  loading,
  matches,
  sampled,
  total,
  invalid,
}: {
  loading: boolean;
  matches?: number;
  sampled?: number;
  total?: number;
  invalid: boolean;
}) {
  let text: string;
  if (invalid) {
    text = 'Finish the rules to preview';
  } else if (loading || matches === undefined || sampled === undefined || total === undefined) {
    text = 'Counting…';
  } else if (sampled >= total) {
    text = `${matches.toLocaleString()} of ${total.toLocaleString()} match`;
  } else {
    // Preview runs over a recent sample, so beyond that it is an estimate.
    text = `About ${matches.toLocaleString()} of ${sampled.toLocaleString()} recent customers match`;
  }
  return (
    <Text as="span" className="hidden shrink-0 text-sm @md:inline" role="status">
      {text}
    </Text>
  );
}
