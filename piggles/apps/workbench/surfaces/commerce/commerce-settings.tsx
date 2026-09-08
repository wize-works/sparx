'use client';

// Selling settings — the rules that apply to every sale on this site.
//
// A plain draft-then-Save form, like every editor in the app: the Save button
// lives in the toolbar, edits register as unsaved work so closing mid-change
// asks first, and the whole object is written back last-write-wins. Settings are
// per-site; the API client attaches the active site, so this pane never has to
// name which one it is editing. The fulfilment origin (a warehouse) is carried
// through untouched — it is set elsewhere, and saving here must not clear it.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  NumberField,
  Select,
  Switch,
  Text,
} from '@wizeworks/silicaui-react';
import { useToast } from '@wizeworks/silicaui-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  CURRENCY_OPTIONS,
  describeDunningPolicy,
  FINAL_OUTCOME_OPTIONS,
  LOCALE_OPTIONS,
  matchRetryPreset,
  RETRY_PRESETS,
  settingsErrorMessage,
  useCommerceSettings,
  useUpdateCommerceSettings,
  type CommerceSettings,
  type DunningPolicy,
} from './commerce-settings-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const ABANDON_MIN = 15;
const ABANDON_MAX = 60 * 24 * 30;

const ATTEMPTS_MIN = 1;
const ATTEMPTS_MAX = 10;

interface Draft {
  defaultCurrency: string;
  defaultLocale: string;
  cartAbandonmentMinutes: number;
  showStockBelow: number;
  hidePricesWhenSignedOut: boolean;
  requireAuthForCheckout: boolean;
  dunning: DunningPolicy;
}

function toDraft(settings: CommerceSettings): Draft {
  return {
    defaultCurrency: settings.defaultCurrency,
    defaultLocale: settings.defaultLocale,
    cartAbandonmentMinutes: settings.cartAbandonmentMinutes,
    showStockBelow: settings.showStockBelow,
    hidePricesWhenSignedOut: settings.hidePricesWhenSignedOut,
    requireAuthForCheckout: settings.requireAuthForCheckout,
    dunning: settings.defaultDunningPolicy,
  };
}

/** Compared as JSON because the policy is a nested object with an array in it —
 *  a field-by-field diff here would be four more lines to forget to update. */
function samePolicy(a: DunningPolicy, b: DunningPolicy): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function CommerceSettingsSurface({ ctx }: { ctx: SurfaceContext }) {
  const {
    data: settings,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useCommerceSettings();

  useEffect(() => {
    ctx.setTitle('Selling settings');
  }, [ctx]);

  if (isError) {
    return (
      <div className={PANE_SHELL}>
        <div className={`${PANE_SHELL} p-2`}>
          <Card className="min-h-0 flex-1 items-center justify-center">
            <PaneLoadError
              title="Could not load your selling settings"
              description={
                <>
                  {settingsErrorMessage(
                    error,
                    'This is a problem reaching the server. Your settings are unaffected.'
                  )}
                </>
              }
              onRetry={() => {
                void refetch();
              }}
            />
          </Card>
        </div>
      </div>
    );
  }

  if (isPending || !settings) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting />
      </div>
    );
  }

  return (
    <SettingsForm
      settings={settings}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

function SettingsForm({
  settings,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  settings: CommerceSettings;
  isFetching: boolean;
  updatedAt: number | undefined;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const update = useUpdateCommerceSettings();

  const saved = useMemo(() => toDraft(settings), [settings]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty =
    draft.defaultCurrency !== saved.defaultCurrency ||
    draft.defaultLocale !== saved.defaultLocale ||
    draft.cartAbandonmentMinutes !== saved.cartAbandonmentMinutes ||
    draft.showStockBelow !== saved.showStockBelow ||
    draft.hidePricesWhenSignedOut !== saved.hidePricesWhenSignedOut ||
    draft.requireAuthForCheckout !== saved.requireAuthForCheckout ||
    !samePolicy(draft.dunning, saved.dunning);

  useDirtySource(dirty, 'Your selling settings have unsaved changes. Close anyway?');

  const failure = update.isError
    ? settingsErrorMessage(update.error, 'Could not save your settings. Nothing was changed.')
    : null;

  const submit = () => {
    update.mutate(
      {
        defaultCurrency: draft.defaultCurrency,
        defaultLocale: draft.defaultLocale,
        ...(settings.defaultWarehouseId ? { defaultWarehouseId: settings.defaultWarehouseId } : {}),
        channelsEnabled: settings.channelsEnabled,
        cartAbandonmentMinutes: Math.min(
          ABANDON_MAX,
          Math.max(ABANDON_MIN, draft.cartAbandonmentMinutes)
        ),
        showStockBelow: Math.max(0, draft.showStockBelow),
        hidePricesWhenSignedOut: draft.hidePricesWhenSignedOut,
        requireAuthForCheckout: draft.requireAuthForCheckout,
        defaultDunningPolicy: {
          ...draft.dunning,
          maxAttempts: Math.min(ATTEMPTS_MAX, Math.max(ATTEMPTS_MIN, draft.dunning.maxAttempts)),
        },
      },
      {
        onSuccess: () => {
          setTouched(false);
          toast.add({ title: 'Selling settings saved', type: 'success' });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Selling settings actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={update.isPending}
            disabled={!dirty}
            onClick={submit}
          >
            Save
          </Button>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={updatedAt} onRefresh={onRefresh} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text className="text-sm">
            The rules that apply to every sale on this site. These affect what shoppers see and how
            checkout works.
          </Text>

          <SaveFailure title="Could not save your settings" message={failure} />

          <FormSection
            title="Currency and language"
            description="What your prices are shown in, and the language used for dates and numbers."
          >
            <Field>
              <FieldLabel>Currency</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-sm">
                    <Select
                      color="module"
                      aria-label="Currency"
                      value={draft.defaultCurrency}
                      items={CURRENCY_OPTIONS}
                      onValueChange={(next) => {
                        set('defaultCurrency', (next as string) ?? 'USD');
                      }}
                    />
                  </div>
                }
              />
              <FieldDescription>
                All prices on this site are shown and charged in this currency.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Language and formatting</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-sm">
                    <Select
                      color="module"
                      aria-label="Language and formatting"
                      value={draft.defaultLocale}
                      items={LOCALE_OPTIONS}
                      onValueChange={(next) => {
                        set('defaultLocale', (next as string) ?? 'en-US');
                      }}
                    />
                  </div>
                }
              />
              <FieldDescription>Sets how dates, numbers and prices are formatted.</FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="At checkout" description="What a customer has to do to buy from you.">
            <Field>
              <FieldLabel>Require an account to check out</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.requireAuthForCheckout}
                    onCheckedChange={(next: boolean) => {
                      set('requireAuthForCheckout', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                On, shoppers must sign in or create an account before paying. Off, they can check
                out as a guest — usually the smoother choice.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Hide prices until a shopper signs in</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.hidePricesWhenSignedOut}
                    onCheckedChange={(next: boolean) => {
                      set('hidePricesWhenSignedOut', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                For trade or members-only sites where prices should only show to signed-in
                customers. Leave off for a normal shop.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="Stock and carts">
            <Field>
              <FieldLabel>Show a &ldquo;low stock&rdquo; note when stock falls below</FieldLabel>
              <FieldControl
                render={
                  <NumberField
                    label="Low stock threshold"
                    className="max-w-[10rem]"
                    min={0}
                    value={draft.showStockBelow}
                    onValueChange={(next) => {
                      set(
                        'showStockBelow',
                        typeof next === 'number' && !Number.isNaN(next) ? next : 0
                      );
                    }}
                  />
                }
              />
              <FieldDescription>
                Nudges shoppers to buy before it runs out. Set to 0 to never show it.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Count an unfinished cart as abandoned after (minutes)</FieldLabel>
              <FieldControl
                render={
                  <NumberField
                    label="Cart abandonment minutes"
                    className="max-w-[10rem]"
                    min={ABANDON_MIN}
                    max={ABANDON_MAX}
                    value={draft.cartAbandonmentMinutes}
                    onValueChange={(next) => {
                      set(
                        'cartAbandonmentMinutes',
                        typeof next === 'number' && !Number.isNaN(next) ? next : ABANDON_MIN
                      );
                    }}
                  />
                }
              />
              <FieldDescription>
                How long a cart can sit untouched before it counts as abandoned in your reports and
                reminder emails. Between 15 minutes and 30 days.
              </FieldDescription>
            </Field>
          </FormSection>

          <FailedPaymentsSection
            policy={draft.dunning}
            onChange={(next) => {
              set('dunning', next);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * What happens when a repeat order's card is declined (docs/142 §4.1).
 *
 * This is the only screen in the app where a shop owner decides how to treat a
 * customer whose card stopped working, and the wrong answer is expensive in both
 * directions: give up too fast and a paying customer is gone over an expired
 * card; retry too long and you buy decline fees and irritation. So the controls
 * are followed by the policy written out as a sentence — a schedule expressed as
 * four separate inputs is not something anyone can read back.
 *
 * The retry schedule is stored as an array of hours because that is what the
 * billing engine indexes. It is EDITED as a named choice, because "24, 72, 168,
 * 336" is not a decision anybody makes.
 */
function FailedPaymentsSection({
  policy,
  onChange,
}: {
  policy: DunningPolicy;
  onChange: (next: DunningPolicy) => void;
}) {
  const preset = matchRetryPreset(policy.retryDelaysHours);
  const presetItems = Object.fromEntries(RETRY_PRESETS.map((p) => [p.value, p.label]));
  // A schedule set through the API that matches no preset is shown as its own
  // option rather than snapped to the nearest one — it was chosen deliberately,
  // and silently rewriting it on the next save would be the same class of bug as
  // a patch schema fabricating defaults.
  const items =
    preset === 'custom'
      ? { custom: 'Custom schedule (set through the API)', ...presetItems }
      : presetItems;

  return (
    <FormSection
      title="When a repeat payment fails"
      description="Cards expire and get replaced — this is what happens when one stops working. It applies to every repeat order in your business, on all of your sites."
    >
      <Field>
        <FieldLabel>How many times to try the card</FieldLabel>
        <FieldControl
          render={
            <NumberField
              label="Number of attempts"
              className="max-w-[10rem]"
              min={ATTEMPTS_MIN}
              max={ATTEMPTS_MAX}
              value={policy.maxAttempts}
              onValueChange={(next) => {
                onChange({
                  ...policy,
                  maxAttempts:
                    typeof next === 'number' && !Number.isNaN(next) ? next : ATTEMPTS_MIN,
                });
              }}
            />
          }
        />
        <FieldDescription>
          Including the first one. Most declines are temporary, so trying again usually works.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>How long to wait between tries</FieldLabel>
        <FieldControl
          render={
            <div className="max-w-sm">
              <Select
                color="module"
                aria-label="How long to wait between tries"
                value={preset}
                items={items}
                onValueChange={(next) => {
                  const chosen = RETRY_PRESETS.find((p) => p.value === next);
                  if (!chosen) return;
                  onChange({ ...policy, retryDelaysHours: chosen.hours });
                }}
              />
            </div>
          }
        />
        <FieldDescription>
          Spacing the tries out gives the customer time to notice and fix their card.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>When all the tries are used up</FieldLabel>
        <FieldControl
          render={
            <div className="max-w-sm">
              <Select
                color="module"
                aria-label="When all the tries are used up"
                value={policy.finalOutcome}
                items={Object.fromEntries(FINAL_OUTCOME_OPTIONS.map((o) => [o.value, o.label]))}
                onValueChange={(next) => {
                  onChange({
                    ...policy,
                    finalOutcome: String(next) as DunningPolicy['finalOutcome'],
                  });
                }}
              />
            </div>
          }
        />
        <FieldDescription>
          Pausing is the usual choice — the order picks straight back up when the customer saves a
          new card.
        </FieldDescription>
      </Field>

      {policy.finalOutcome === 'cancel' ? (
        // The one genuinely irreversible option on this screen. A paused order
        // resumes itself; a cancelled one has to be sold again.
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>Cancelling ends the customer relationship</AlertTitle>
            <AlertDescription>
              A cancelled repeat order can&rsquo;t be restarted by the customer — they have to place
              a new one, and most won&rsquo;t. An expired card is usually worth pausing over, not
              cancelling.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel>Email the customer the first time a payment fails</FieldLabel>
        <FieldControl
          render={
            <Switch
              color="module"
              checked={policy.notifyCustomerOnFirstFailure}
              onCheckedChange={(next: boolean) => {
                onChange({ ...policy, notifyCustomerOnFirstFailure: next });
              }}
            />
          }
        />
        <FieldDescription>
          Only the first failure is emailed — the tries in between are silent, so nobody gets four
          emails about one card.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Email the customer when the tries run out</FieldLabel>
        <FieldControl
          render={
            <Switch
              color="module"
              checked={policy.notifyCustomerOnFinalFailure}
              onCheckedChange={(next: boolean) => {
                onChange({ ...policy, notifyCustomerOnFinalFailure: next });
              }}
            />
          }
        />
        <FieldDescription>
          Turning this off means the customer is never told their repeat order stopped.
        </FieldDescription>
      </Field>

      <Alert color="info">
        <AlertContent>
          <AlertTitle>What this means in practice</AlertTitle>
          <AlertDescription>{describeDunningPolicy(policy)}</AlertDescription>
        </AlertContent>
      </Alert>
    </FormSection>
  );
}
