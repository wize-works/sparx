'use client';

// Your listing — how your agency appears in the sparx partner directory, where
// businesses go looking for help.
//
// This is a working edit surface, so it's a PANE: it edits a durable thing you
// return to (edit has the same shape whenever you open it), and the leave-guard +
// dirty dot only exist for panes. One centred, capped column of grouped fields,
// neutral cards — identity rides the module-hued Save button, not a tint. The
// facts the partner can't edit here (tier, referral code, when they joined) sit in
// a quiet read-only strip at the top so the listing is grounded in who they are.
//
// Explicit save, last-write-wins, with a leave-guard while there are unsaved
// edits — like every editor in the app.

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
  FieldStatus,
  Heading,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Save } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  usePartnerProfile,
  useUpdateProfile,
  partnerErrorMessage,
  type PartnerKind,
  type PartnerProfile,
  type ProfileInput,
} from './data';
import { formatDate, KNOWN_SPECIALTIES, PARTNER_KINDS, partnerStatusState, TIERS } from './format';
import { NotAPartner, PartnerLoadError, PartnerLoading } from './gate';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const KIND_ITEMS: Record<string, string> = Object.fromEntries(
  PARTNER_KINDS.map((k) => [k.value, k.label])
);

interface FormState {
  displayName: string;
  bio: string;
  websiteUrl: string;
  kind: PartnerKind;
  locationCity: string;
  locationState: string;
  locationCountry: string;
  isRemote: boolean;
  specialties: string[];
  photoUrl: string;
  directoryVisible: boolean;
}

function formFrom(profile: PartnerProfile): FormState {
  return {
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    websiteUrl: profile.websiteUrl ?? '',
    kind: profile.kind,
    locationCity: profile.locationCity ?? '',
    locationState: profile.locationState ?? '',
    locationCountry: profile.locationCountry ?? '',
    isRemote: profile.isRemote,
    specialties: profile.specialties,
    photoUrl: profile.photoUrl ?? '',
    directoryVisible: profile.directoryVisible,
  };
}

function toInput(form: FormState): ProfileInput {
  return {
    displayName: form.displayName.trim(),
    bio: form.bio.trim() || null,
    websiteUrl: form.websiteUrl.trim() || null,
    kind: form.kind,
    locationCity: form.locationCity.trim() || null,
    locationState: form.locationState.trim() || null,
    locationCountry: form.locationCountry.trim() ? form.locationCountry.trim().toUpperCase() : null,
    isRemote: form.isRemote,
    specialties: form.specialties,
    photoUrl: form.photoUrl.trim() || null,
    directoryVisible: form.directoryVisible,
  };
}

export function ProfileSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const profile = usePartnerProfile();
  const update = useUpdateProfile();

  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);

  useEffect(() => {
    if (profile.data && !form) {
      const next = formFrom(profile.data);
      setForm(next);
      setBaseline(next);
    }
  }, [profile.data, form]);

  useEffect(() => {
    ctx.setTitle('Your listing');
  }, [ctx]);

  const dirty = useMemo(
    () => (form && baseline ? JSON.stringify(form) !== JSON.stringify(baseline) : false),
    [form, baseline]
  );

  const nameOk = (form?.displayName.trim() ?? '') !== '';

  useDirtySource(dirty, 'Changes to your listing have not been saved. Close anyway?');

  if (profile.isError) {
    return (
      <PartnerLoadError
        section="your listing"
        error={profile.error}
        onRetry={() => {
          void profile.refetch();
        }}
      />
    );
  }
  if (profile.isPending || (profile.data && !form)) {
    return <PartnerLoading />;
  }
  if (!profile.data || !form || !baseline) {
    return <NotAPartner section="Your listing" />;
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const toggleSpecialty = (tag: string) => {
    set(
      'specialties',
      form.specialties.includes(tag)
        ? form.specialties.filter((t) => t !== tag)
        : [...form.specialties, tag]
    );
  };

  const save = () => {
    if (!nameOk || !dirty) return;
    update.mutate(toInput(form), {
      onSuccess: (saved) => {
        const next = formFrom(saved);
        setForm(next);
        setBaseline(next);
        afterPaneChange(() => {
          toast.add({ title: 'Your listing is saved', type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save your listing',
          description: partnerErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const status = partnerStatusState(profile.data.status);
  const tier = TIERS[profile.data.tier];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Listing actions"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!nameOk || !dirty}
            loading={update.isPending}
            onClick={save}
          >
            <Save className="size-4" aria-hidden />
            Save
          </Button>
        }
        controls={
          <>
            <Badge color={form.directoryVisible ? 'success' : 'neutral'} variant="soft" size="sm">
              {form.directoryVisible ? 'Listed publicly' : 'Not listed'}
            </Badge>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={profile.isFetching}
            updatedAt={profile.data ? profile.dataUpdatedAt : undefined}
            onRefresh={() => {
              void profile.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Your directory listing
            </Heading>
            <Text>
              This is how you appear in the sparx partner directory, where businesses go looking for
              someone to help them build. Turn listing off to stay unlisted while still earning.
            </Text>
          </div>

          {/* Read-only grounding facts — what the partner can't change here. */}
          <div className="border-base-300 flex flex-wrap gap-x-6 gap-y-1 rounded-lg border px-4 py-3">
            <Text className="text-sm">
              Tier: <span className="font-medium">{tier.label}</span>
            </Text>
            <span className="inline-flex items-center gap-1.5">
              <Text as="span" className="text-sm">
                Status:
              </Text>
              <Badge color={status.tone} variant="soft" size="sm">
                {status.label}
              </Badge>
            </span>
            <Text className="text-sm">
              Referral code:{' '}
              <span className="font-mono font-medium">{profile.data.referralCode}</span>
            </Text>
            <Text className="text-sm">
              Joined: <span className="font-medium">{formatDate(profile.data.createdAt)}</span>
            </Text>
          </div>

          <FormSection title="Who you are">
            <Field>
              <FieldLabel required>Practice name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={form.displayName}
                    maxLength={255}
                    placeholder="Ironleaf Studio"
                    onChange={(event) => {
                      set('displayName', event.target.value);
                    }}
                  />
                }
              />
              {!nameOk ? (
                <FieldStatus status="error">Your listing needs a name.</FieldStatus>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>About you</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={4}
                    maxLength={2000}
                    value={form.bio}
                    placeholder="What you do, who you help, and what makes your practice a good fit."
                    onChange={(event) => {
                      set('bio', event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Website</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="url"
                      value={form.websiteUrl}
                      placeholder="https://ironleaf.studio"
                      spellCheck={false}
                      onChange={(event) => {
                        set('websiteUrl', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>What describes you</FieldLabel>
                <Select
                  color="module"
                  items={KIND_ITEMS}
                  value={form.kind}
                  aria-label="What best describes your practice"
                  onValueChange={(next) => {
                    set('kind', next as PartnerKind);
                  }}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Logo or photo link</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="url"
                    value={form.photoUrl}
                    placeholder="https://…/logo.png"
                    spellCheck={false}
                    onChange={(event) => {
                      set('photoUrl', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>A square image reads best in the directory.</FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="Where you work">
            <div className="grid gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel>City</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.locationCity}
                      onChange={(event) => {
                        set('locationCity', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>State or region</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.locationState}
                      onChange={(event) => {
                        set('locationState', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Country</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.locationCountry}
                      placeholder="US"
                      maxLength={2}
                      spellCheck={false}
                      className="uppercase"
                      onChange={(event) => {
                        set('locationCountry', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Two-letter country code.</FieldDescription>
              </Field>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  Work remotely
                </Text>
                <Text as="span" className="text-sm">
                  Show that you take on clients anywhere, not just near you.
                </Text>
              </span>
              <Switch
                color="module"
                checked={form.isRemote}
                aria-label="Work remotely"
                onCheckedChange={(checked) => {
                  set('isRemote', checked);
                }}
              />
            </div>
          </FormSection>

          <FormSection
            title="What you focus on"
            description="These drive the directory’s filters, so a business can find someone with the right focus."
          >
            <div className="flex flex-wrap gap-2">
              {KNOWN_SPECIALTIES.map((tag) => {
                const on = form.specialties.includes(tag);
                return (
                  <Button
                    key={tag}
                    size="sm"
                    color="module"
                    variant={on ? 'soft' : 'outline'}
                    aria-pressed={on}
                    onClick={() => {
                      toggleSpecialty(tag);
                    }}
                  >
                    {tag}
                  </Button>
                );
              })}
            </div>
          </FormSection>

          <FormSection title="Listing">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  List me in the partner directory
                </Text>
                <Text as="span" className="text-sm">
                  When off, you stay an active partner and keep earning — you just won’t appear in
                  the public directory.
                </Text>
              </span>
              <Switch
                color="module"
                checked={form.directoryVisible}
                aria-label="List me in the partner directory"
                onCheckedChange={(checked) => {
                  set('directoryVisible', checked);
                }}
              />
            </div>
            {profile.data.status !== 'active' ? (
              <Alert color="info">
                <AlertContent>
                  <AlertTitle>Your listing goes live once your account is active</AlertTitle>
                  <AlertDescription>
                    You can fill everything in now. It appears in the directory as soon as sparx
                    activates your partner account.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </FormSection>
        </div>
      </div>
    </div>
  );
}
