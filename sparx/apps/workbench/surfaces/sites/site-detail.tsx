'use client';

// One site — create it, rename it, choose what it shows, retire it.
//
// Create and manage are the same surface because they are the same object at two
// ages, and splitting them is how a field ends up owned by two components. The
// `id === 'new'` branch is genuinely smaller: a site is created with a name and
// nothing else, then configured once it exists.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ExternalLink, Save, Star, Trash2 } from 'lucide-react';
import { useWorkbench } from '../../lib/workbench/context';
import { useActiveSiteId, useModuleStates, switchSite } from '../../lib/api/shell-data';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SiteTraffic, TRAFFIC_WINDOW_DAYS } from './traffic';
import { slugify as slugifyWebSegment } from '../../lib/slugify';
import {
  conflictField,
  isBuilderRequired,
  useCreateSite,
  useDeleteSite,
  useDomains,
  useMakePrimary,
  useSite,
  useUpdateSite,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

/** Modules a site can be told not to show. `builder` is absent on purpose — it
 *  is what BUILDS the site, so hiding it from one site is meaningless. */
const SCOPEABLE = ['commerce', 'cms', 'crm', 'email', 'b2b', 'dropship', 'inventory', 'ai'];

const MODULE_LABELS: Record<string, string> = {
  commerce: 'Selling',
  cms: 'Content',
  crm: 'Customers',
  email: 'Email',
  b2b: 'Wholesale',
  dropship: 'Dropshipping',
  inventory: 'Inventory',
  ai: 'AI',
};

/** A handle is the part of the web address that identifies this site, so it is
 *  lowercase, digits and hyphens — matching what api-rest derives from a name. */
function slugify(value: string): string {
  return slugifyWebSegment(value, 63);
}

function CreateSite({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [touchedHandle, setTouchedHandle] = useState(false);
  const create = useCreateSite();

  useEffect(() => {
    ctx.setTitle('New site');
  }, [ctx]);

  // The handle follows the name until someone edits it themselves, at which
  // point it is theirs and typing more of the name must not overwrite it.
  const effectiveHandle = touchedHandle ? handle : slugify(name);
  const dirty = name.trim() !== '' || touchedHandle;
  useDirtySource(
    dirty && !create.isSuccess,
    'This new site has not been created yet. Close anyway?'
  );

  const nameError = name.trim() === '' ? 'Give the site a name.' : null;
  // 'primary' is reserved for the account's first site, so a second site
  // claiming it would collide with something the person cannot see.
  const handleError =
    effectiveHandle === 'primary'
      ? 'That handle is reserved. Pick another.'
      : conflictField(create.error) === 'slug'
        ? 'A site is already using that handle. Pick another.'
        : null;

  const submit = () => {
    if (nameError || handleError) return;
    create.mutate(
      { name: name.trim(), ...(effectiveHandle ? { slug: effectiveHandle } : {}) },
      {
        onSuccess: (site) => {
          // Becomes the manage view for the site that now exists, rather than
          // leaving a spent form open beside a list that has moved on. The toast
          // follows the swap rather than sharing its commit; see `afterPaneChange`.
          ctx.open('platform.settings.site', { id: site.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${site.name} created`, type: 'success' });
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New site actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={Boolean(nameError) || create.isPending}
            onClick={submit}
          >
            {create.isPending ? 'Creating…' : 'Create site'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {isBuilderRequired(create.error) ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Adding another site needs the Builder module</AlertTitle>
                <AlertDescription>
                  Your first site is included. Turn on Builder from Modules to publish more than one
                  website from this account.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : create.isError && !handleError ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>Could not create the site</AlertTitle>
                <AlertDescription>Nothing was created. Try again in a moment.</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection
            title="New site"
            description="A site is one website, with its own name, pages, and web address. You can change the name later; the handle is fixed once the site exists."
          >
            <Field>
              <FieldLabel>Site name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={name}
                    placeholder="Ironleaf Tattoo Co."
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                What visitors see. Your business name, or this site&apos;s own.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Handle</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={handleError ? 'error' : 'module'}
                    value={effectiveHandle}
                    placeholder="ironleaf"
                    onChange={(event) => {
                      setTouchedHandle(true);
                      setHandle(slugify(event.target.value));
                    }}
                  />
                }
              />
              {handleError ? (
                <FieldStatus status="error">{handleError}</FieldStatus>
              ) : (
                <FieldDescription>
                  Used in the site&apos;s first web address. Cannot be changed afterwards, so it is
                  worth a moment now.
                </FieldDescription>
              )}
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function ManageSite({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { controller } = useWorkbench();
  const { data: site, isError, error, isPending, refetch } = useSite(id);
  const { data: modules } = useModuleStates();
  const { data: activeSite } = useActiveSiteId();
  const { data: domains } = useDomains();
  const update = useUpdateSite(id);
  const makePrimary = useMakePrimary(id);
  const remove = useDeleteSite(id);

  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (site && !loaded) {
      setName(site.name);
      setLoaded(true);
    }
  }, [site, loaded]);

  useEffect(() => {
    if (site) ctx.setTitle(site.name);
  }, [ctx, site]);

  const dirty = loaded && site !== undefined && name.trim() !== site.name;
  useDirtySource(dirty, 'This site has an unsaved name change. Close anyway?');

  // The address a visitor would actually type: the canonical one when a site has
  // named it, otherwise the first that still works. Every site has at least its
  // sparx.zone subdomain, so this is normally present.
  const host = useMemo(() => {
    const mine = (domains ?? []).filter(
      (domain) => domain.propertyId === id && domain.status !== 'removed'
    );
    return (mine.find((domain) => domain.isCanonical) ?? mine[0])?.host ?? null;
  }, [domains, id]);

  // Only modules the ACCOUNT has switched on can be scoped — a switch for
  // something the business does not have would promise a capability it cannot
  // deliver, and turning it "on" here would still show nothing.
  const available = useMemo(() => {
    const enabled = new Set((modules ?? []).filter((m) => m.enabled).map((m) => m.slug));
    return SCOPEABLE.filter((slug) => enabled.has(slug));
  }, [modules]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="site"
        title="Could not load this site"
        description="This is a problem reaching the server. Nothing about the site has changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !site) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const isActive = site.id === (activeSite?.propertyId ?? null);

  /** `moduleScope` stores what is switched OFF, so the switch state is its
   *  inverse. Writing the array back is full-replace, not a merge. */
  const setModule = (slug: string, visible: boolean) => {
    const next = visible
      ? site.moduleScope.filter((s) => s !== slug)
      : [...new Set([...site.moduleScope, slug])];
    update.mutate(
      { moduleScope: next },
      {
        onError: () => {
          toast.add({ title: 'Could not change that', type: 'error' });
        },
      }
    );
  };

  /**
   * Switching reloads the window, so it asks first when anything is unsaved —
   * INCLUDING the rename sitting in this very pane, which is the likeliest thing
   * at risk: someone types a new name, then reaches for "work on this site".
   * Same conversation the list and the toolbar switcher have.
   */
  const onSwitch = async () => {
    if (controller.hasUnsavedWork()) {
      const ok = await confirm({
        title: `Switch to ${site.name}?`,
        description:
          'Something in this workspace has unsaved changes. Switching sites reloads the workbench and those changes will be lost.',
        confirmLabel: 'Switch anyway',
        cancelLabel: 'Stay here',
        color: 'warning',
      });
      if (!ok) return;
    }
    await switchSite(controller, activeSite?.propertyId ?? 'default', site.id);
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete ${site.name}?`,
      description:
        'Its pages, layouts, forms and web addresses are deleted with it. Orders and customers are kept, because they belong to the business rather than the site. This cannot be undone.',
      confirmLabel: 'Delete this site',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${site.name} deleted`, type: 'success' });
        });
      },
      onError: () => {
        toast.add({
          title: 'Could not delete this site',
          description: 'Nothing was removed.',
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Site actions"
        primary={
          <Button
            color="module"
            size="sm"
            disabled={!dirty || update.isPending}
            onClick={() => {
              update.mutate(
                { name: name.trim() },
                {
                  onSuccess: () => {
                    toast.add({ title: 'Site name saved', type: 'success' });
                  },
                  onError: () => {
                    toast.add({ title: 'Could not save the name', type: 'error' });
                  },
                }
              );
            }}
          >
            <Save className="size-4" aria-hidden />
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        }
        controls={
          <>
            <div className="flex flex-wrap items-center gap-1">
              {site.isPrimary ? (
                <Badge color="module" variant="soft" size="sm">
                  Primary
                </Badge>
              ) : null}
              {isActive ? (
                <Badge color="success" variant="soft" size="sm">
                  You are here
                </Badge>
              ) : null}
            </div>
            <div className="flex-1" />
            {isActive ? null : (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                onClick={() => {
                  void onSwitch();
                }}
              >
                Work on this site
              </Button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {/* A site is a WEBSITE, so the pane opens by saying which one and where
              it lives. The old version led with a rename box and never showed
              the address at all — you could not tell from this screen what the
              thing you were editing actually was. */}
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {site.name}
            </Heading>
            {host ? (
              <a
                href={`https://${host}`}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex w-fit items-center gap-1 font-mono text-sm"
              >
                {host}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : (
              <Text className="text-sm">No web address yet</Text>
            )}
          </div>

          <FormSection
            title={`Visitors · last ${String(TRAFFIC_WINDOW_DAYS)} days`}
            description="Counted by sparx itself, without cookies, so there is nothing for visitors to accept and nothing to set up."
            action={
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                title="Web addresses for this site"
                onClick={(event) => {
                  ctx.open('platform.settings.domains', undefined, {
                    target: event.shiftKey ? 'beside' : 'tab',
                  });
                }}
              >
                Web addresses
              </Button>
            }
          >
            <SiteTraffic propertyId={site.id} />
          </FormSection>

          <FormSection
            title="Name and handle"
            description="What this site is called, and the handle that anchors its web address."
          >
            <Field>
              <FieldLabel>Site name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>What visitors see.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Handle</FieldLabel>
              <FieldControl render={<Input value={site.slug} readOnly disabled />} />
              <FieldDescription>
                Fixed when the site was created — web addresses already point at it, so changing it
                would break them.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="What this site shows"
            description="Switch off anything this site has no use for. It stays available on your other sites."
          >
            {available.length === 0 ? (
              <Text className="text-sm">
                Nothing to choose yet — this account has no modules switched on beyond the site
                builder itself.
              </Text>
            ) : (
              available.map((slug) => (
                <label key={slug} className="flex items-center gap-2">
                  <Checkbox
                    color="module"
                    checked={!site.moduleScope.includes(slug)}
                    disabled={update.isPending}
                    aria-label={MODULE_LABELS[slug] ?? slug}
                    onChange={(event) => {
                      setModule(slug, event.target.checked);
                    }}
                  />
                  <Text as="span">{MODULE_LABELS[slug] ?? slug}</Text>
                </label>
              ))
            )}
          </FormSection>

          {/* Making a site primary and deleting one are both RARE and both hard
              to undo. As full cards in a rail they carried the same weight as
              the settings someone actually came here to change, which is how a
              destructive button becomes something you click by habit. They live
              at the bottom now, after the work, in plain rows. */}
          <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
            {site.isPrimary ? (
              <Text className="text-sm">
                This is your primary site — the one that answers your account&apos;s main web
                address. Make another site primary to move that role, which is also what has to
                happen before this one can be deleted.
              </Text>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Make this the primary site to point your account&apos;s main address here. The
                  current primary keeps its own address.
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  disabled={makePrimary.isPending}
                  onClick={() => {
                    makePrimary.mutate(undefined, {
                      onSuccess: () => {
                        toast.add({ title: `${site.name} is now primary`, type: 'success' });
                      },
                      onError: () => {
                        toast.add({ title: 'Could not change the primary site', type: 'error' });
                      },
                    });
                  }}
                >
                  <Star className="size-4" aria-hidden />
                  {makePrimary.isPending ? 'Working…' : 'Make primary'}
                </Button>
              </div>
            )}

            {site.isPrimary ? null : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Deleting this site removes its pages, layouts, forms and web addresses. This
                  cannot be undone.
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    void onDelete();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  {remove.isPending ? 'Deleting…' : 'Delete this site'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SiteDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <CreateSite ctx={ctx} /> : <ManageSite ctx={ctx} id={id} />;
}
