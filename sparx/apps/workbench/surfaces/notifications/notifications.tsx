'use client';

// Notifications — choose what sparx tells you about, and whether it reaches you
// by email or only in your inbox here.
//
// A per-person preferences pane, not a modal: it is durable (you come back to
// it), it is reached from the settings nav, and there is real work to lose if it
// vanished — so it lives on a tab with the app's dirty-guard behind it, saved
// explicitly. One centred column: this is a form and a short delivery choice,
// with no separate summary worth a rail, so `EditorLayout` would leave a near-
// empty column beside a near-empty rail. The categories ARE the point, so they
// are the hero and everything else is a note around them.
//
// The language is deliberately plain. A business owner does not think in
// "kinds" or "channels" — they think "tell me when an order comes in, by email".
// Every category says what it covers in examples, and the delivery choice reads
// as a sentence rather than a pair of toggles.

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Heading,
  NativeSelect,
  RadioGroup,
  RadioOption,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Save } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  CHANNEL_OPTIONS,
  DIGEST_OPTIONS,
  NOTIFICATION_CATEGORY_META,
  preferencesEqual,
  useNotificationPreferences,
  useSaveNotificationPreferences,
  type EmailDigest,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferences,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

/** Centred and capped — a preferences pane torn onto a second monitor is
 *  otherwise a column of controls pinned to the left edge of 2000px of grey. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** One category: what it covers on the left (in that part of sparx's hue), and
 *  how it should reach you on the right. Stacks under @md so a narrow pane keeps
 *  the choice under the thing it applies to rather than crushing both. */
function CategoryRow({
  meta,
  channel,
  onChange,
}: {
  meta: (typeof NOTIFICATION_CATEGORY_META)[number];
  channel: NotificationChannel;
  onChange: (value: NotificationChannel) => void;
}) {
  const Icon = meta.icon;
  const selectId = `notify-${meta.key}`;
  return (
    <div className="border-base-300 flex flex-col gap-3 rounded-lg border p-3 @md:flex-row @md:items-center @md:gap-4">
      <ModuleScope
        module={meta.module ?? 'platform'}
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        <span className="bg-module soft flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-module size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={selectId} className="text-base font-semibold">
            {meta.label}
          </label>
          <Text className="text-sm">{meta.description}</Text>
        </div>
      </ModuleScope>
      <div className="shrink-0 @md:w-56">
        <NativeSelect
          id={selectId}
          color="neutral"
          value={channel}
          onChange={(event) => {
            onChange(event.target.value as NotificationChannel);
          }}
        >
          {CHANNEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

export function NotificationsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } =
    useNotificationPreferences();
  const save = useSaveNotificationPreferences();

  const [form, setForm] = useState<NotificationPreferences | null>(null);

  useEffect(() => {
    ctx.setTitle('Notifications');
  }, [ctx]);

  // Seed once. A background refetch landing while someone is mid-change must not
  // wipe what they were choosing.
  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const dirty = useMemo(() => Boolean(form && data && !preferencesEqual(form, data)), [form, data]);
  useDirtySource(dirty, 'Your notification choices have unsaved changes. Close anyway?');

  // A failed load is shown INSTEAD of the form, never a dead form beside a dead
  // Save: the form seeds from `data`, so on a failed load it would render every
  // category at a default the person never chose.
  if (isError) {
    return (
      <PaneLoadError
        title="Could not load your notification choices"
        description="Nothing has changed — this is a problem reaching the server, not with your saved choices."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const setChannel = (key: NotificationCategory) => (value: NotificationChannel) => {
    setForm((prev) => (prev ? { ...prev, channels: { ...prev.channels, [key]: value } } : prev));
  };

  const setDigest = (digest: EmailDigest) => {
    setForm((prev) => (prev ? { ...prev, digest } : prev));
  };

  const onSave = () => {
    if (!form) return;
    save.mutate(form, {
      onSuccess: (saved) => {
        setForm(saved);
        toast.add({ title: 'Notification choices saved', type: 'success' });
      },
      onError: () => {
        toast.add({
          title: 'Could not save your choices',
          description: 'Nothing was changed. Try again in a moment.',
          type: 'error',
        });
      },
    });
  };

  const anyEmail = form
    ? NOTIFICATION_CATEGORY_META.some((meta) => form.channels[meta.key] === 'email')
    : false;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Notification preference actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!dirty || isPending || save.isPending}
            onClick={onSave}
          >
            <Save className="size-4" aria-hidden />
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending || !form ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Notifications
              </Heading>
              <Text>
                Choose what sparx tells you about, and whether it reaches you by email or only in
                your inbox here. These are your own choices — changing them affects nobody else on
                the team.
              </Text>
            </div>

            <FormSection
              title="What to tell you about"
              description="Pick how each kind of update should reach you. Anything set to your inbox shows on the bell at the top of the window."
            >
              <div className="flex flex-col gap-3">
                {NOTIFICATION_CATEGORY_META.map((meta) => (
                  <CategoryRow
                    key={meta.key}
                    meta={meta}
                    channel={form.channels[meta.key]}
                    onChange={setChannel(meta.key)}
                  />
                ))}
              </div>
            </FormSection>

            <FormSection
              title="How email arrives"
              description={
                anyEmail
                  ? 'For anything you chose to get by email, decide whether each one arrives on its own or is gathered up and sent together.'
                  : 'This applies once you set something above to reach you by email. Until then, everything stays in your inbox only.'
              }
            >
              <RadioGroup
                color="module"
                value={form.digest}
                onValueChange={(value) => {
                  setDigest(value as EmailDigest);
                }}
              >
                {DIGEST_OPTIONS.map((option) => (
                  <RadioOption key={option.value} value={option.value} className="items-start py-1">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-medium">{option.label}</span>
                      <span className="text-sm">{option.hint}</span>
                    </span>
                  </RadioOption>
                ))}
              </RadioGroup>
            </FormSection>

            {/* Honesty about the messages a choice here cannot switch off. A
                receipt or a security alert is not a preference — it is owed. */}
            <Text className="text-sm">
              A few essential messages are always sent by email whatever you choose here — a
              password reset, a receipt a customer is owed, or an urgent warning about your account
              — because missing one would leave you or a customer stuck.
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
