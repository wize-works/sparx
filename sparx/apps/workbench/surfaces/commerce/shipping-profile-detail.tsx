'use client';

// One product group — create it, then manage it.
//
// A product group ("profile") gathers products that ship the same way, so their
// delivery options can be priced together and kept apart from everything else.
// It is create-and-manage in one surface: `{ id: 'new' }` builds it, `{ id }`
// manages it. Which products belong to a group is set from the products
// themselves, not here — this pane owns the group's identity and its shipping
// rules (freight, signature), which is what a rate needs to know.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  shippingErrorMessage,
  useCreateShippingProfile,
  useDeleteShippingProfile,
  useShippingProfile,
  useUpdateShippingProfile,
  type ShippingProfile,
} from './shipping-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

interface Draft {
  name: string;
  description: string;
  requiresSignature: boolean;
  requiresFreight: boolean;
}

function toDraft(profile: ShippingProfile): Draft {
  return {
    name: profile.name,
    description: profile.description ?? '',
    requiresSignature: profile.requiresSignature,
    requiresFreight: profile.requiresFreight,
  };
}

function emptyDraft(): Draft {
  return { name: '', description: '', requiresSignature: false, requiresFreight: false };
}

export function ShippingProfileDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <ProfileEditor ctx={ctx} id="new" /> : <ProfileLoader ctx={ctx} id={id} />;
}

function ProfileLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: profile, isPending, isError, error, refetch } = useShippingProfile(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="product group"
        title="Could not load this product group"
        description="This is a problem reaching the server. The group itself is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !profile) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <ProfileEditor ctx={ctx} id={id} profile={profile} />;
}

function ProfileEditor({
  ctx,
  id,
  profile,
}: {
  ctx: SurfaceContext;
  id: string;
  profile?: ShippingProfile;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateShippingProfile();
  const update = useUpdateShippingProfile(id);
  const remove = useDeleteShippingProfile(id);

  const saved = useMemo(() => (profile ? toDraft(profile) : emptyDraft()), [profile]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New product group' : (profile?.name ?? 'Product group'));
  }, [ctx, isNew, profile]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const nameError = draft.name.trim() === '' ? 'Give this group a name.' : null;

  const dirty = isNew
    ? draft.name.trim() !== '' ||
      draft.description.trim() !== '' ||
      draft.requiresSignature ||
      draft.requiresFreight
    : draft.name !== saved.name ||
      draft.description !== saved.description ||
      draft.requiresSignature !== saved.requiresSignature ||
      draft.requiresFreight !== saved.requiresFreight;

  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This product group has not been created yet. Close anyway?'
      : 'This product group has unsaved changes. Close anyway?'
  );

  const failure =
    create.isError || update.isError
      ? shippingErrorMessage(
          create.error ?? update.error,
          'Could not save this group. Nothing was changed.'
        )
      : null;

  const submit = () => {
    if (nameError) return;
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      requiresSignature: draft.requiresSignature,
      requiresFreight: draft.requiresFreight,
    };
    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('commerce.shipping.profile.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${draft.name.trim()} created`, type: 'success' });
          });
        },
      });
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Group saved', type: 'success' });
      },
    });
  };

  const onDelete = async () => {
    if (!profile) return;
    const count = profile.productCount + profile.variantCount;
    const ok = await confirm({
      title: `Delete ${profile.name}?`,
      description:
        count > 0
          ? `The ${String(count)} product${count === 1 ? '' : 's'} in this group go back to shipping the standard way, and any delivery options priced for this group are removed. The products themselves are kept. This cannot be undone.`
          : 'This group is removed. Any delivery options priced for it go too. This cannot be undone.',
      confirmLabel: 'Delete this group',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${profile.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this group',
          description: shippingErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  const productCount = profile ? profile.productCount + profile.variantCount : 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Product group actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={Boolean(nameError) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create group' : 'Save'}
          </Button>
        }
        controls={
          <>
            {!isNew ? (
              <Badge variant="soft" size="sm">
                {profile?.isDefault
                  ? 'All other products'
                  : productCount === 0
                    ? 'Nothing in it yet'
                    : productCount === 1
                      ? '1 product'
                      : `${String(productCount)} products`}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Add a product group
              </Heading>
              <Text>
                Group together products that ship the same way — bulky freight, anything needing a
                signature — so you can price their delivery on its own. You add products to the
                group from each product later.
              </Text>
            </div>
          ) : (
            <Heading level={1} className="text-2xl font-semibold">
              {profile?.name}
            </Heading>
          )}

          <SaveFailure title="Could not save this group" message={failure} />

          <FormSection title="The group">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.name}
                    placeholder="Freight items"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? (
                <FieldStatus status="error">{nameError}</FieldStatus>
              ) : (
                <FieldDescription>A name only you see, to tell your groups apart.</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Note (optional)</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={draft.description}
                    placeholder="A reminder of what belongs in this group."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title="How these products ship"
            description="These tell carriers how to handle anything in this group. Leave both off for ordinary parcels."
          >
            <Field>
              <FieldLabel>Ships as freight</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.requiresFreight}
                    onCheckedChange={(next: boolean) => {
                      set('requiresFreight', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                For oversized or palletised items that go by freight rather than ordinary post.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Needs a signature</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.requiresSignature}
                    onCheckedChange={(next: boolean) => {
                      set('requiresSignature', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                The carrier collects a signature on delivery. Good for high-value goods.
              </FieldDescription>
            </Field>
          </FormSection>

          {!isNew && profile ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Deleting this group returns its products to shipping the standard way.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="danger"
                loading={remove.isPending}
                onClick={() => {
                  void onDelete();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete this group
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
