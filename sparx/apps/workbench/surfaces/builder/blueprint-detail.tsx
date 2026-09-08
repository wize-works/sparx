'use client';

// One ready-made design — preview it, then add it to a site.
//
// Every action on this pane pivots on WHICH SITE, because a blueprint installs
// per-site: adding it, publishing it live, and removing it all target one chosen
// site. So the site picker and the action that acts on it live TOGETHER in one
// section ("Add it to a site"), rather than splitting the picker into the body
// and its button into the header where the two would drift apart. The toolbar
// carries only the state for the chosen site and a refresh.
//
// NOT built on EditorLayout: there is no form here and no running summary — it is
// a preview, a list of what the design includes, and a single decision per site.
// One centred, capped column instead, with the preview and "what it adds" as the
// hero.
//
// Adding is additive, not destructive: it stamps a whole design as DRAFTS you
// review, and leaves your existing pages and products alone. Publishing and
// removing are the meaningful moves — removing tears the whole design back out,
// so it sits behind a confirm that names the site.

import { useEffect, useMemo, useState } from 'react';
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
  Heading,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { ArrowUpCircle, LayoutTemplate, Rocket, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useActiveSiteId, useModuleStates } from '../../lib/api/shell-data';
import { useSites } from '../sites/data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  blueprintErrorMessage,
  contentsGroups,
  examplesSentence,
  formatDate,
  installState,
  moduleLabel,
  useBlueprint,
  useBlueprintInstalls,
  useGoLiveInstall,
  useInstallBlueprint,
  useUninstallInstall,
  useUpdateInstall,
  useUpdatePlan,
  type Blueprint,
  type BlueprintInstall,
  type ContentsLine,
} from './blueprints-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function BlueprintDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const key = typeof ctx.params.key === 'string' ? ctx.params.key : '';
  const {
    data: blueprint,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useBlueprint(key);

  useEffect(() => {
    if (blueprint) ctx.setTitle(blueprint.name);
  }, [ctx, blueprint]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="design"
        title="Could not load this design"
        description="This is a problem reaching the server, or the design is no longer in the catalog. Your site is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !blueprint) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return (
    <BlueprintBody
      blueprint={blueprint}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
    />
  );
}

function BlueprintBody({
  blueprint,
  isFetching,
  dataUpdatedAt,
  refetch,
}: {
  blueprint: Blueprint;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const { data: sites } = useSites();
  const { data: active } = useActiveSiteId();
  const { data: modules } = useModuleStates();
  const {
    data: installs,
    isFetching: installsFetching,
    refetch: refetchInstalls,
  } = useBlueprintInstalls();

  const install = useInstallBlueprint(blueprint.key);
  const goLive = useGoLiveInstall();
  const uninstall = useUninstallInstall();
  const update = useUpdateInstall();

  // Default the target to the site being worked in — nearly always the one meant
  // — but keep it a visible, changeable choice, because adding a whole design to
  // the wrong site is a real mistake to make.
  const fallbackSite = active?.propertyId ?? sites?.find((site) => site.isPrimary)?.id ?? '';
  const [chosen, setChosen] = useState('');
  const targetSite = chosen || fallbackSite;

  // Whether this install brings the design's examples (issue 098). On by default —
  // a console with nothing in it teaches a new owner nothing — and only ever asked
  // BEFORE an install: afterwards the answer is a fact about it, not a control.
  const [sampleData, setSampleData] = useState(true);

  const siteItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const site of sites ?? []) items[site.id] = site.name;
    return items;
  }, [sites]);
  const targetName = siteItems[targetSite] ?? 'this site';

  // The install row (if any) for THIS blueprint in the chosen site. The catalog
  // list only knows the active site's state; this is what lets the pane speak
  // truthfully about whichever site the operator points at.
  const current: BlueprintInstall | undefined = useMemo(
    () =>
      (installs ?? []).find(
        (row) => row.blueprint_key === blueprint.key && row.property_id === targetSite
      ),
    [installs, blueprint.key, targetSite]
  );
  const state = current ? installState(current.status) : null;

  // An update is available when the chosen site's install trails the catalog version
  // and is in a state that can take one (a draft or a live install — not one that is
  // mid-install or stopped, which resolve their own way first). The catalog version is
  // `blueprint.version`; the install's is `current.blueprint_version`.
  const updateAvailable =
    !!current &&
    (current.status === 'installed' || current.status === 'live') &&
    current.blueprint_version !== blueprint.version;
  // Preview the merge only when one is actually available, so an up-to-date install
  // never fetches a plan. The summary drives the confirm so the operator sees what will
  // change before committing.
  const { data: plan } = useUpdatePlan(current?.id ?? '', updateAvailable);

  const groups = contentsGroups(blueprint.contents);
  const hasContents = groups.structure.length > 0 || groups.examples.length > 0;
  // `contents` is free-form JSON on the wire, so read the theme name defensively
  // — a non-string would render as `[object Object]` or crash React.
  const themeName = typeof blueprint.contents.theme === 'string' ? blueprint.contents.theme : null;

  // Which required modules are off, so the note can say what will be skipped —
  // mirroring the installer, which only fills in modules the tenant has enabled.
  const moduleEnabled = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const module of modules ?? []) map.set(module.slug, module.enabled);
    return map;
  }, [modules]);
  const offModules = blueprint.requiredModules.filter((slug) => moduleEnabled.get(slug) === false);

  const busy = install.isPending || goLive.isPending || uninstall.isPending || update.isPending;

  const onInstall = async () => {
    if (targetSite === '') return;
    const ok = await confirm({
      title: `Add “${blueprint.name}” to ${targetName}?`,
      description: `This adds the design's pages and a matching look to ${targetName} — all as drafts only you can see. ${examplesSentence(sampleData)} Your existing pages and products are left exactly as they are, and nothing goes live until you publish it.`,
      confirmLabel: 'Add it',
      cancelLabel: 'Cancel',
      color: 'module',
    });
    if (!ok) return;
    install.mutate(
      { propertyId: targetSite, sampleData },
      {
        onSuccess: () => {
          void refetchInstalls();
          afterPaneChange(() => {
            toast.add({
              title: `${blueprint.name} added to ${targetName}`,
              description:
                'It is on your site as drafts. Review it, then publish it when you are ready.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add this design',
            description: blueprintErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onGoLive = async () => {
    if (!current) return;
    const ok = await confirm({
      title: `Publish “${blueprint.name}” on ${targetName}?`,
      description: `This makes everything the design added — its pages, look, and anything else it created — live on ${targetName} for visitors to see. You can still edit any of it afterwards.`,
      confirmLabel: 'Publish it live',
      cancelLabel: 'Not yet',
      color: 'module',
    });
    if (!ok) return;
    goLive.mutate(current.id, {
      onSuccess: () => {
        void refetchInstalls();
        toast.add({ title: `${blueprint.name} is live on ${targetName}`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not publish this',
          description: blueprintErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onUpdate = async () => {
    if (!current) return;
    // What's changing, in plain words — new things the design added, clean updates, and
    // anything you've edited that will keep your version. Falls back to a generic line
    // while the plan is still loading.
    const s = plan?.summary;
    const bits: string[] = [];
    if (s) {
      if (s.new > 0) bits.push(`${String(s.new)} new ${s.new === 1 ? 'addition' : 'additions'}`);
      if (s.updated > 0) bits.push(`${String(s.updated)} update${s.updated === 1 ? '' : 's'}`);
      if (s.conflicts > 0) bits.push(`${String(s.conflicts)} you've edited (your version is kept)`);
    }
    const changeLine = bits.length > 0 ? ` This brings in ${bits.join(', ')}.` : '';
    const ok = await confirm({
      title: `Update “${blueprint.name}” on ${targetName}?`,
      description: `This updates the design from version ${current.blueprint_version} to ${blueprint.version} on ${targetName}.${changeLine} Anything you have changed yourself is kept — the update never overwrites your edits.`,
      confirmLabel: 'Update it',
      cancelLabel: 'Cancel',
      color: 'module',
    });
    if (!ok) return;
    update.mutate(current.id, {
      onSuccess: (result) => {
        void refetchInstalls();
        toast.add({
          title: `${blueprint.name} updated to version ${blueprint.version} on ${targetName}`,
          description:
            current.status === 'live'
              ? 'The changes are live. Anything you had edited was kept.'
              : 'The changes are in as drafts. Review and publish when you are ready.',
          type: 'success',
        });
        void result;
      },
      onError: (error) => {
        toast.add({
          title: 'Could not update this design',
          description: blueprintErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onRemove = async () => {
    if (!current) return;
    const ok = await confirm({
      title: `Remove “${blueprint.name}” from ${targetName}?`,
      description: `This tears the whole design back out of ${targetName} — the pages, content, products and email designs it added are deleted, and its look is cleared. This cannot be undone. Anything you created yourself is left alone.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    uninstall.mutate(current.id, {
      onSuccess: () => {
        void refetchInstalls();
        toast.add({ title: `${blueprint.name} removed from ${targetName}`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this design',
          description: blueprintErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Blueprint actions"
        controls={
          <>
            {state ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : (
              <Text className="text-sm">Preview</Text>
            )}
            {updateAvailable ? (
              <Badge color="module" variant="soft" size="sm">
                Update available
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching || installsFetching}
            updatedAt={dataUpdatedAt}
            onRefresh={() => {
              refetch();
              void refetchInstalls();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {blueprint.name}
            </Heading>
            <Text className="text-sm">
              {[
                blueprint.vertical ? verticalText(blueprint.vertical) : null,
                `Version ${blueprint.version}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </div>

          {blueprint.preview ? (
            // Hot-linked marketplace preview on an arbitrary CDN — not an
            // allow-listed media host, so `next/image` would reject it (it THROWS
            // on an un-allow-listed host). A plain <img> is correct here.
            <img
              src={blueprint.preview}
              alt={`Preview of the ${blueprint.name} design`}
              className="bg-base-200 border-base-300 aspect-video w-full rounded-lg border object-cover"
            />
          ) : (
            <div className="bg-base-200 border-base-300 flex aspect-video w-full items-center justify-center rounded-lg border">
              <LayoutTemplate className="size-10 [color:var(--color-module)]" aria-hidden />
            </div>
          )}

          {blueprint.summary ? <Text>{blueprint.summary}</Text> : null}

          {/* One status message, when there is a specific state to report for the
              chosen site — its detail, plus what it added. */}
          {state && current ? (
            <Alert color={state.tone} variant="soft">
              <AlertContent>
                <AlertTitle>
                  {state.label} on {targetName}
                </AlertTitle>
                <AlertDescription>
                  {state.detail}
                  {current.status === 'live' && current.live_at
                    ? ` Live since ${formatDate(current.live_at)}.`
                    : current.installed_at
                      ? ` Added ${formatDate(current.installed_at)}.`
                      : ''}
                  {/* A fact about THIS install, read from the server — never
                      inferred from a zero count (issue 098). */}
                  {current.sample_data
                    ? ' Its examples came with it.'
                    : ' Its examples were left out.'}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {/* A newer version of this design is in the catalog. Surfaced as its own
              prompt (not folded into the status line) because it is an ACTION the
              operator can take, distinct from what the install currently is. */}
          {updateAvailable && current ? (
            <Alert color="module" variant="soft">
              <AlertContent>
                <AlertTitle>Update available</AlertTitle>
                <AlertDescription>
                  {targetName} has version {current.blueprint_version} of this design; version{' '}
                  {blueprint.version} is now available.
                  {plan?.summary && plan.summary.new > 0
                    ? ` It adds ${String(plan.summary.new)} new ${plan.summary.new === 1 ? 'thing' : 'things'} (like new pages).`
                    : ''}{' '}
                  Updating keeps everything you have edited yourself.
                  {current.sample_data
                    ? ''
                    : ' This design came in without its examples, and the update leaves them out too.'}
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="module"
                loading={update.isPending}
                disabled={busy && !update.isPending}
                onClick={() => {
                  void onUpdate();
                }}
              >
                <ArrowUpCircle className="size-4" aria-hidden />
                Update to {blueprint.version}
              </Button>
            </Alert>
          ) : null}

          <FormSection
            title="What this adds to your site"
            description="Everything comes in as drafts you can change — nothing here replaces what you already have."
          >
            {!hasContents ? (
              <Text className="text-sm">
                A clean starting layout to build on, with a matching look already set up.
              </Text>
            ) : (
              <LineList lines={groups.structure} />
            )}
            {themeName ? (
              <Text className="text-sm">
                Comes with the <span className="font-medium">{themeName}</span> look — colors, fonts
                and spacing — applied for you.
              </Text>
            ) : null}

            {/* The examples, listed apart from the structure — because they are the
                half the next section makes a choice about (issue 098). */}
            {groups.examples.length > 0 ? (
              <>
                <Text className="font-medium">The examples it brings</Text>
                <LineList lines={groups.examples} />
                <Text className="text-sm">
                  These are somebody else&rsquo;s: a shop&rsquo;s stock, a salon&rsquo;s treatments,
                  a writer&rsquo;s articles. They are there so every screen has something real on it
                  while you find your way around. You can leave them out below.
                </Text>
              </>
            ) : null}
            {offModules.length > 0 ? (
              <Text className="text-sm">
                Some of this needs features you have turned off
                {' ('}
                {offModules.map((slug) => moduleLabel(slug)).join(', ')}
                {'). '}
                Those parts are skipped — turn the feature on first if you want them included.
              </Text>
            ) : null}
          </FormSection>

          {/* The action hub: the site to act on, and the actions that act on it,
              in one place — because every one of them targets THIS chosen site. */}
          <FormSection
            title="Add it to a site"
            description="Pick which site this design goes into. You can add it to more than one."
          >
            <Field>
              <FieldLabel>Site</FieldLabel>
              {sites && sites.length > 0 ? (
                <Select
                  color="module"
                  items={siteItems}
                  value={targetSite}
                  aria-label="Which site to add this design to"
                  onValueChange={(next) => {
                    setChosen(next as string);
                  }}
                />
              ) : (
                <Text className="text-sm" role="status">
                  Loading your sites…
                </Text>
              )}
              <FieldDescription>
                The design is added only to the site you choose here — your other sites are not
                touched.
              </FieldDescription>
            </Field>

            {/* The choice the whole of issue 098 is about. Only before an install,
                and only when this design actually brings examples — a design with
                none never asks. */}
            {!current && groups.examples.length > 0 ? (
              <Field>
                <FieldLabel>Bring its examples</FieldLabel>
                <FieldControl
                  render={
                    <Switch
                      color="module"
                      checked={sampleData}
                      disabled={busy}
                      onCheckedChange={setSampleData}
                      aria-label="Bring this design's examples"
                    />
                  }
                />
                <FieldDescription>{examplesSentence(sampleData)}</FieldDescription>
              </Field>
            ) : null}

            {current ? (
              <>
                {current.status === 'installed' ? (
                  <Button
                    color="module"
                    onClick={() => {
                      void onGoLive();
                    }}
                    loading={goLive.isPending}
                    disabled={busy && !goLive.isPending}
                  >
                    <Rocket className="size-4" aria-hidden />
                    Publish it live on {targetName}
                  </Button>
                ) : null}

                {current.status === 'running' ? (
                  <Text className="text-sm">
                    This design is still being added to {targetName}. Refresh in a moment to see it
                    finish.
                  </Text>
                ) : null}

                {/* Removal is rare and irreversible, so it is a plain row under a
                    divider — never a button with equal weight to publishing. */}
                <div className="border-base-300 mt-1 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex min-w-0 flex-col">
                    <Text className="font-medium">Remove this design from {targetName}</Text>
                    <Text className="text-sm">
                      Deletes everything it added to that site. This cannot be undone.
                    </Text>
                  </div>
                  <Button
                    variant="outline"
                    color="danger"
                    size="sm"
                    loading={uninstall.isPending}
                    disabled={busy && !uninstall.isPending}
                    onClick={() => {
                      void onRemove();
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Remove
                  </Button>
                </div>
              </>
            ) : (
              <Button
                color="module"
                disabled={targetSite === '' || busy}
                loading={install.isPending}
                onClick={() => {
                  void onInstall();
                }}
              >
                Add “{blueprint.name}” to {targetName}
              </Button>
            )}
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function LineList({ lines }: { lines: ContentsLine[] }) {
  return (
    <ul className="flex flex-col">
      {lines.map((line) => (
        <li key={line.key} className="border-base-300 border-b py-2 text-base last:border-b-0">
          {line.text}
        </li>
      ))}
    </ul>
  );
}

/** Title-cased vertical for the identity line. Plain text, not a badge. */
function verticalText(vertical: string): string {
  return vertical
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
