'use client';

// Chat settings — how the chat box looks and behaves on your site, when you are
// available, and the AI assistant that answers when nobody on the team is around.
//
// An explicit-save editor like every other one in the app: one Save in the
// toolbar, edits register as unsaved work so switching away asks first, and the
// whole config is written at once. Editing requires an owner/admin — a viewer
// sees the settings but the controls are read-only rather than handing out an
// error on save.
//
// The AI key is write-only: the server never sends it back (only whether one is
// saved), and a newly-pasted key is VERIFIED with a real call before it is
// stored — a bad key is rejected with a sentence saying why, which this surface
// shows verbatim rather than a generic failure.
//
// One centred column, not EditorLayout: this is a settings form with no running
// summary to put in a rail.

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
  Input,
  NativeSelect,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Bot, Save } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { useViewer } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  AI_PROVIDERS,
  chatErrorMessage,
  useChatConfig,
  useUpdateChatConfig,
  type AiProvider,
  type ChatConfig,
  type OperatingHours,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const WEEKDAYS: { value: string; label: string }[] = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (ChatGPT)',
};

const DEFAULT_DAY = { open: '09:00', close: '17:00' };

/** Everything this surface edits, kept apart from the write-only key input. */
interface Draft {
  position: 'bottom-right' | 'bottom-left';
  collectEmail: boolean;
  greeting: string;
  awayMessage: string;
  aiEnabled: boolean;
  aiProvider: AiProvider | null;
  operatingHours: OperatingHours | null;
}

function draftFrom(config: ChatConfig): Draft {
  return {
    position: config.position,
    collectEmail: config.collectEmail,
    greeting: config.greeting,
    awayMessage: config.awayMessage,
    aiEnabled: config.aiEnabled,
    aiProvider: config.aiProvider,
    operatingHours: config.operatingHours,
  };
}

function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/* ── Operating-hours editor ───────────────────────────────────────────────── */

function HoursEditor({
  hours,
  disabled,
  onChange,
}: {
  hours: OperatingHours;
  disabled: boolean;
  onChange: (next: OperatingHours) => void;
}) {
  const setDay = (day: string, value: { open: string; close: string } | null) => {
    onChange({ ...hours, days: { ...hours.days, [day]: value } });
  };

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel>Time zone</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={hours.timezone}
              disabled={disabled}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                onChange({ ...hours, timezone: event.target.value });
              }}
            />
          }
        />
        <FieldDescription>
          Your hours are read in this time zone, e.g. America/New_York or Europe/London.
        </FieldDescription>
      </Field>

      <div className="divide-base-300 flex flex-col divide-y">
        {WEEKDAYS.map((day) => {
          const window = hours.days[day.value] ?? null;
          const open = window !== null;
          return (
            <div key={day.value} className="flex flex-col gap-2 py-3 @md:flex-row @md:items-center">
              <div className="flex items-center gap-3 @md:w-40">
                <Switch
                  color="module"
                  checked={open}
                  disabled={disabled}
                  aria-label={`${day.label} — open`}
                  onCheckedChange={(next: boolean) => {
                    setDay(day.value, next ? { ...DEFAULT_DAY } : null);
                  }}
                />
                <Text as="span" className="font-medium">
                  {day.label}
                </Text>
              </div>
              {open ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="time"
                    color="module"
                    className="max-w-32 tabular-nums"
                    value={window.open}
                    disabled={disabled}
                    aria-label={`${day.label} opening time`}
                    onChange={(event) => {
                      setDay(day.value, { ...window, open: event.target.value });
                    }}
                  />
                  <Text as="span" className="text-sm">
                    to
                  </Text>
                  <Input
                    type="time"
                    color="module"
                    className="max-w-32 tabular-nums"
                    value={window.close}
                    disabled={disabled}
                    aria-label={`${day.label} closing time`}
                    onChange={(event) => {
                      setDay(day.value, { ...window, close: event.target.value });
                    }}
                  />
                </div>
              ) : (
                <Text as="span" className="text-sm">
                  Closed — the away message shows instead
                </Text>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function ChatSettingsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const { data: config, isPending, isError, isFetching, dataUpdatedAt, refetch } = useChatConfig();
  const { data: viewer } = useViewer();
  const update = useUpdateChatConfig();

  const canEdit = viewer ? viewer.role === 'owner' || viewer.role === 'admin' : false;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [disconnectKey, setDisconnectKey] = useState(false);

  useEffect(() => {
    ctx.setTitle('Chat settings');
  }, [ctx]);

  // Seed the draft once the config loads. Reruns only when the server copy
  // changes (a save writes the cache), which also discards a stale local edit
  // against fresh server data rather than silently keeping it.
  useEffect(() => {
    if (config) {
      setDraft(draftFrom(config));
      setKeyInput('');
      setDisconnectKey(false);
    }
  }, [config]);

  const dirty = useMemo(() => {
    if (!config || !draft) return false;
    const changed = JSON.stringify(draft) !== JSON.stringify(draftFrom(config));
    return changed || keyInput.trim() !== '' || disconnectKey;
  }, [config, draft, keyInput, disconnectKey]);

  useDirtySource(dirty, 'You have unsaved changes to your chat settings. Close anyway?');

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  if (isError) {
    return (
      <PaneLoadError
        title="Could not load your chat settings"
        description="This is a problem reaching the server. Your live chat is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !draft || !config) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const save = () => {
    const patch = { ...draft };
    const body: Parameters<typeof update.mutate>[0] = { ...patch };
    if (disconnectKey) {
      body.aiApiKey = null;
    } else if (keyInput.trim() !== '') {
      body.aiApiKey = keyInput.trim();
    }
    update.mutate(body, {
      onSuccess: () => {
        // The save writes fresh config into the cache, which reseeds the draft
        // and re-renders this pane; the toast defers a macrotask out of that
        // commit to stay clear of React's flushSync guard.
        afterPaneChange(() => {
          toast.add({ title: 'Chat settings saved', type: 'success' });
        });
      },
      onError: (error) => {
        afterPaneChange(() => {
          toast.add({
            title: 'Could not save your settings',
            description: chatErrorMessage(
              error,
              'Nothing was changed. Check the details and retry.'
            ),
            type: 'error',
          });
        });
      },
    });
  };

  const hoursOn = draft.operatingHours !== null;
  const failure = update.isError
    ? chatErrorMessage(update.error, 'Could not save your settings. Nothing was changed.')
    : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Chat settings actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={update.isPending}
            disabled={!canEdit || !dirty}
            onClick={save}
          >
            <Save className="size-4" aria-hidden />
            Save changes
          </Button>
        }
        controls={
          <>
            {dirty ? (
              <Badge color="warning" variant="soft" size="sm">
                Unsaved changes
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={config ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Chat settings
            </Heading>
            <Text>
              Set up the chat box that greets people on your site — how it looks, when you are
              around, and what happens when you are not.
            </Text>
          </div>

          {!canEdit ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>You can view these settings but not change them</AlertTitle>
                <AlertDescription>
                  Only an account owner or admin can edit the chat settings. Ask one of them if
                  something here needs changing.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {/* One message, the most specific one — the server's own reason a save
              failed (a rejected AI key names itself) beats a generic banner. */}
          <SaveFailure title="Could not save your settings" message={failure} />

          <FormSection title="The chat box">
            <Field>
              <FieldLabel>Where it sits on the page</FieldLabel>
              <Select
                color="module"
                aria-label="Where the chat box sits"
                value={draft.position}
                items={{ 'bottom-right': 'Bottom right', 'bottom-left': 'Bottom left' }}
                onValueChange={(next) => {
                  set('position', next as Draft['position']);
                }}
              />
              <FieldDescription>
                Which corner the chat button appears in for your visitors.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Ask for a name and email first</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.collectEmail}
                    disabled={!canEdit}
                    onCheckedChange={(next: boolean) => {
                      set('collectEmail', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                {draft.collectEmail
                  ? 'Visitors give their name and email before the chat starts, so you can follow up even if they leave.'
                  : 'Visitors can start chatting straight away without giving any details.'}
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="What it says">
            <Field>
              <FieldLabel>Greeting</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    value={draft.greeting}
                    rows={2}
                    maxLength={500}
                    disabled={!canEdit}
                    onChange={(event) => {
                      set('greeting', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                The first thing a visitor sees when they open the chat.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Away message</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    value={draft.awayMessage}
                    rows={2}
                    maxLength={500}
                    disabled={!canEdit}
                    onChange={(event) => {
                      set('awayMessage', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Shown when you are outside your available hours, so people know what to expect.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="When you're available">
            <Field>
              <FieldLabel>Set specific hours</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={hoursOn}
                    disabled={!canEdit}
                    onCheckedChange={(next: boolean) => {
                      set('operatingHours', next ? { timezone: localTimezone(), days: {} } : null);
                    }}
                  />
                }
              />
              <FieldDescription>
                {hoursOn
                  ? 'Outside these hours the chat shows your away message instead of a reply box.'
                  : 'Chat is always available — there is no away state.'}
              </FieldDescription>
            </Field>

            {hoursOn && draft.operatingHours ? (
              <HoursEditor
                hours={draft.operatingHours}
                disabled={!canEdit}
                onChange={(next) => {
                  set('operatingHours', next);
                }}
              />
            ) : null}
          </FormSection>

          <FormSection
            title="AI first responder"
            description="An assistant that answers new messages instantly using your own AI account. It only ever runs on a provider key you connect below — sparx never answers on your behalf without one."
          >
            <Field>
              <FieldLabel>Let AI answer new messages</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.aiEnabled}
                    disabled={!canEdit}
                    onCheckedChange={(next: boolean) => {
                      set('aiEnabled', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                When on, the assistant replies first and hands over to your team when it cannot
                help. It stays off until a working key is connected.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>AI provider</FieldLabel>
              <Select
                color="module"
                aria-label="AI provider"
                value={draft.aiProvider ?? ''}
                items={{
                  '': 'Choose a provider',
                  ...Object.fromEntries(AI_PROVIDERS.map((p) => [p, PROVIDER_LABELS[p]])),
                }}
                onValueChange={(next) => {
                  set('aiProvider', next === '' ? null : (next as AiProvider));
                }}
              />
              <FieldDescription>Whose AI answers — you bring your own account.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{config.aiKeyConfigured ? 'Replace the AI key' : 'AI key'}</FieldLabel>
              <FieldControl
                render={
                  <Input
                    type="password"
                    color="module"
                    value={keyInput}
                    disabled={!canEdit || disconnectKey}
                    placeholder={
                      config.aiKeyConfigured
                        ? 'A key is saved — paste a new one to replace it'
                        : 'Paste your key'
                    }
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setKeyInput(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                We check the key works before saving it, and store it encrypted. It is never shown
                again after you save.
              </FieldDescription>
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              {config.aiKeyConfigured ? (
                <Badge color="success" variant="soft" size="sm">
                  A key is saved
                </Badge>
              ) : (
                <Badge color="neutral" variant="outline" size="sm">
                  No key yet
                </Badge>
              )}
              {config.aiKeyConfigured && canEdit ? (
                <label className="flex items-center gap-2 text-sm">
                  <NativeSelect
                    size="sm"
                    aria-label="What to do with the saved key"
                    value={disconnectKey ? 'disconnect' : 'keep'}
                    onChange={(event) => {
                      setDisconnectKey(event.target.value === 'disconnect');
                      if (event.target.value === 'disconnect') setKeyInput('');
                    }}
                  >
                    <option value="keep">Keep the saved key</option>
                    <option value="disconnect">Remove the saved key</option>
                  </NativeSelect>
                </label>
              ) : null}
            </div>

            {draft.aiEnabled && !config.aiKeyConfigured && keyInput.trim() === '' ? (
              <Alert color="warning">
                <Bot className="size-5" aria-hidden />
                <AlertContent>
                  <AlertTitle>Connect a key to turn this on</AlertTitle>
                  <AlertDescription>
                    The AI first responder needs a provider key to work. Add one above, or turn it
                    off until you have one.
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
