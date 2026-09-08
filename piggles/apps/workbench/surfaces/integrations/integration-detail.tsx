'use client';

// One connection — connect a service, or manage one you already have.
//
// Connect and manage are the same surface in two states: `{ slug }` connects a
// service that isn't linked yet, `{ id }` manages one that is. Connecting does
// not always finish the job — some services come up needing a quick test before
// they switch on — and this pane is where you come back to until it is working,
// so it is a PANE, never a create modal.
//
// The audience owns a business, not an integrations stack: a "provider" is the
// service, "credentials" are the details it gave you, an "installation" is simply
// your connection to it. Nothing here asks for a webhook or a scope by name.
//
// One centred column, not EditorLayout — a short credentials form and some
// facts, with no running summary to put in a rail.

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
  Input,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  faArrowsRotate,
  faLink,
  faPause,
  faPlay,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { useViewer } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { providerKindIcon } from './kind-icon';
import { SaveFailure } from '@/components/save-failure';
import {
  installationState,
  integrationErrorMessage,
  kindHint,
  kindLabel,
  parseConfigFields,
  useDisconnectIntegration,
  useInstallation,
  useInstallProvider,
  useProviderMetadata,
  useSetIntegrationEnabled,
  useTestIntegration,
  useUpdateIntegrationConfig,
  type ConfigField,
  type ProviderEnvironment,
  type ProviderKind,
} from './provider-connection';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function canManage(role: string | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type ConfigValues = Record<string, string>;

/** Build the initial value map from a field list (defaults filled in). */
function initialValues(fields: ConfigField[]): ConfigValues {
  const out: ConfigValues = {};
  for (const field of fields) {
    if (field.type === 'boolean') out[field.key] = 'false';
    else out[field.key] = field.defaultValue ?? '';
  }
  return out;
}

/** Turn the string-keyed form values into the config object the server wants,
 *  coercing each field back to its real type and dropping empty optionals. */
function toConfig(fields: ConfigField[], values: ConfigValues): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key] ?? '';
    if (field.type === 'boolean') {
      config[field.key] = raw === 'true';
    } else if (field.type === 'list') {
      const items = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (items.length > 0) config[field.key] = items;
    } else if (raw.trim() !== '') {
      config[field.key] = raw.trim();
    }
  }
  return config;
}

/** Whether every REQUIRED field has a value. */
function requiredMet(fields: ConfigField[], values: ConfigValues): boolean {
  return fields.every((field) => {
    if (!field.required) return true;
    if (field.type === 'boolean') return true;
    return (values[field.key] ?? '').trim() !== '';
  });
}

/** Renders one config field in plain form controls. Secret fields are masked;
 *  enums are a picker; string lists a comma-separated box; booleans a switch. */
function ConfigFieldControl({
  field,
  value,
  onChange,
  secretPlaceholder,
}: {
  field: ConfigField;
  value: string;
  onChange: (next: string) => void;
  secretPlaceholder?: string;
}) {
  if (field.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Text className="font-medium">{field.label}</Text>
          {field.description ? <Text className="text-sm">{field.description}</Text> : null}
        </div>
        <Switch
          color="module"
          checked={value === 'true'}
          onCheckedChange={(checked) => {
            onChange(checked ? 'true' : 'false');
          }}
        />
      </div>
    );
  }

  if (field.type === 'select' && field.options) {
    const items: Record<string, string> = {};
    for (const option of field.options) items[option] = option;
    return (
      <Field>
        <FieldLabel>{field.label}</FieldLabel>
        <Select
          color="module"
          items={items}
          value={value}
          aria-label={field.label}
          onValueChange={(next) => {
            onChange(next as string);
          }}
        />
        {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel>{field.label}</FieldLabel>
      <FieldControl
        render={
          <Input
            color="module"
            type={field.type === 'secret' ? 'password' : 'text'}
            value={value}
            autoComplete="off"
            spellCheck={false}
            placeholder={field.type === 'secret' ? secretPlaceholder : undefined}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        }
      />
      {field.description ? (
        <FieldDescription>
          {field.description}
          {field.type === 'list' ? ' Separate several with commas.' : ''}
        </FieldDescription>
      ) : field.type === 'list' ? (
        <FieldDescription>Separate several with commas.</FieldDescription>
      ) : null}
    </Field>
  );
}

/* ── Connect ───────────────────────────────────────────────────────────────── */

function ConnectIntegration({
  ctx,
  slug,
  presetKind,
}: {
  ctx: SurfaceContext;
  slug: string;
  presetKind?: ProviderKind;
}) {
  const toast = useToast();
  const {
    data: metadata,
    isPending,
    isError,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useProviderMetadata(slug);
  const install = useInstallProvider();

  const fields = useMemo(() => (metadata ? parseConfigFields(metadata) : []), [metadata]);
  const [values, setValues] = useState<ConfigValues>({});
  const [environment, setEnvironment] = useState<ProviderEnvironment>('production');
  const [initialised, setInitialised] = useState(false);

  // Seed defaults once the schema arrives.
  useEffect(() => {
    if (metadata && !initialised) {
      setValues(initialValues(parseConfigFields(metadata)));
      setInitialised(true);
    }
  }, [metadata, initialised]);

  useEffect(() => {
    if (metadata) ctx.setTitle(`Connect ${metadata.displayName}`);
  }, [ctx, metadata]);

  const kind = presetKind ?? metadata?.kinds[0] ?? 'shipping';

  const dirty = useMemo(() => Object.values(values).some((v) => v.trim() !== ''), [values]);
  useDirtySource(
    dirty && !install.isSuccess,
    'This connection has not been saved yet. Close anyway?'
  );

  const canSubmit = fields.length > 0 ? requiredMet(fields, values) : true;

  const submit = () => {
    if (!metadata || !canSubmit) return;
    install.mutate(
      { providerSlug: metadata.slug, kind, environment, config: toConfig(fields, values) },
      {
        onSuccess: (result) => {
          ctx.open(
            'platform.settings.integration',
            { id: result.installationId, slug: metadata.slug },
            { target: 'replace' }
          );
          afterPaneChange(() => {
            toast.add({
              title: `${metadata.displayName} connected`,
              description:
                result.status === 'active'
                  ? 'It is ready to use.'
                  : 'Give it a quick test to switch it on.',
              type: 'success',
            });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            title="Could not load this service"
            description="This is a problem reaching the server. Nothing has been connected."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !metadata) {
    return <PaneWaiting />;
  }

  const KindIcon = providerKindIcon(kind);
  const failure = install.isError
    ? integrationErrorMessage(install.error, 'Could not connect that service. Nothing was saved.')
    : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Connect a service actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={install.isPending}
            disabled={!canSubmit}
            onClick={submit}
          >
            <Icon glyph={faLink} className="size-4" aria-hidden />
            Connect
          </Button>
        }
        // Not a bare create form: the fields on this screen ARE server data —
        // whatever the provider says it needs — so there is something real to
        // re-read when that changes underneath.
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={metadata ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex items-start gap-3">
            <span className="bg-base-200 flex size-11 shrink-0 items-center justify-center rounded-lg">
              <Icon glyph={KindIcon} className="size-6" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <Text>{metadata.description}</Text>
              <Text className="text-sm">
                {kindLabel(kind)} · by {metadata.vendor}
              </Text>
            </div>
          </div>

          <SaveFailure title="Could not connect that service" message={failure} />

          <FormSection
            title="Its details"
            description={
              fields.length > 0
                ? 'Copy these across from the other service. We check them and store anything secret encrypted.'
                : 'This service needs nothing from you to connect — just add it and test it.'
            }
          >
            {fields.map((field) => (
              <ConfigFieldControl
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                onChange={(next) => {
                  setValues((prev) => ({ ...prev, [field.key]: next }));
                }}
              />
            ))}
          </FormSection>

          {metadata.sandboxAvailable ? (
            <FormSection
              title="Live or test"
              description="Test mode lets you try the connection with the other service's practice environment before real money or real orders are involved."
            >
              <Field>
                <FieldLabel>Mode</FieldLabel>
                <Select
                  color="module"
                  items={{ production: 'Live', sandbox: 'Test mode' }}
                  value={environment}
                  aria-label="Live or test mode"
                  onValueChange={(next) => {
                    setEnvironment(next as ProviderEnvironment);
                  }}
                />
              </Field>
            </FormSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Manage ────────────────────────────────────────────────────────────────── */

function ManageIntegration({
  ctx,
  id,
  slug,
  canEdit,
}: {
  ctx: SurfaceContext;
  id: string;
  slug: string | undefined;
  canEdit: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const {
    data: installation,
    isPending,
    isError,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useInstallation(id);
  const { data: metadata } = useProviderMetadata(slug ?? installation?.providerSlug);

  const test = useTestIntegration(id);
  const setEnabled = useSetIntegrationEnabled(id);
  const disconnect = useDisconnectIntegration(id);
  const updateConfig = useUpdateIntegrationConfig(id);

  const secretFields = useMemo(
    () => (metadata ? parseConfigFields(metadata).filter((f) => f.type === 'secret') : []),
    [metadata]
  );
  const [secretValues, setSecretValues] = useState<ConfigValues>({});

  const name = metadata?.displayName ?? installation?.providerSlug ?? 'Connection';
  useEffect(() => {
    if (installation) ctx.setTitle(name);
  }, [ctx, installation, name]);

  const secretDirty = useMemo(
    () => Object.values(secretValues).some((v) => v.trim() !== ''),
    [secretValues]
  );
  useDirtySource(
    secretDirty && !updateConfig.isPending,
    'You have typed a new detail but not saved it yet. Close anyway?'
  );

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            title="Could not load this connection"
            description="This is a problem reaching the server. The connection itself is unaffected."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !installation) {
    return <PaneWaiting />;
  }

  const state = installationState(installation);
  const KindIcon = providerKindIcon(installation.kind);
  const isLive = installation.environment === 'production';

  const onTest = () => {
    test.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title: result.ok ? `${name} is working` : `${name} did not pass the test`,
          description: result.details,
          type: result.ok ? 'success' : 'error',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not test that connection',
          description: integrationErrorMessage(error, 'Try again shortly.'),
          type: 'error',
        });
      },
    });
  };

  const onToggleEnabled = () => {
    setEnabled.mutate(!installation.enabled, {
      onSuccess: () => {
        toast.add({
          title: installation.enabled ? `${name} paused` : `${name} switched back on`,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not change that',
          description: integrationErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onSaveSecrets = () => {
    const config: Record<string, unknown> = {};
    for (const field of secretFields) {
      const raw = (secretValues[field.key] ?? '').trim();
      if (raw !== '') config[field.key] = raw;
    }
    if (Object.keys(config).length === 0) return;
    updateConfig.mutate(config, {
      onSuccess: () => {
        setSecretValues({});
        toast.add({ title: 'Details updated', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not update those details',
          description: integrationErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onDisconnect = async () => {
    const ok = await confirm({
      title: `Disconnect ${name}?`,
      description:
        'Anything that relies on this connection — like live delivery prices or taking payments through it — stops working. Your account with the other service is untouched, and you can connect it again later.',
      confirmLabel: 'Disconnect it',
      cancelLabel: 'Keep it connected',
      color: 'danger',
    });
    if (!ok) return;
    disconnect.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${name} disconnected`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not disconnect that service',
          description: integrationErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const testFailure = test.data && !test.data.ok ? test.data.details : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Connection actions"
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={installation ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
        status={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {!isLive ? (
              <Badge color="warning" variant="soft" size="sm">
                Test mode
              </Badge>
            ) : null}
            <div className="flex-1" />
          </>
        }
        controls={
          canEdit ? (
            <>
              <Button size="sm" color="module" loading={test.isPending} onClick={onTest}>
                <Icon glyph={faArrowsRotate} className="size-4" aria-hidden />
                Test connection
              </Button>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={setEnabled.isPending}
                onClick={onToggleEnabled}
              >
                {installation.enabled ? (
                  <>
                    <Icon glyph={faPause} className="size-4" aria-hidden />
                    Pause
                  </>
                ) : (
                  <>
                    <Icon glyph={faPlay} className="size-4" aria-hidden />
                    Switch on
                  </>
                )}
              </Button>
            </>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex items-start gap-3">
            <span className="bg-base-200 flex size-11 shrink-0 items-center justify-center rounded-lg">
              <Icon glyph={KindIcon} className="size-6" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <Text className="text-sm">
                {kindLabel(installation.kind)}
                {metadata?.vendor ? ` · by ${metadata.vendor}` : ''} · Connected{' '}
                {formatDate(installation.installedAt)}
                {installation.lastHealthCheckAt
                  ? ` · Last checked ${formatDate(installation.lastHealthCheckAt)}`
                  : ''}
              </Text>
            </div>
          </div>

          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>{testFailure ?? state.detail}</AlertDescription>
            </AlertContent>
          </Alert>

          {metadata ? (
            <FormSection title="What this connection does">
              <Text className="text-sm">{kindHint(installation.kind)}</Text>
            </FormSection>
          ) : null}

          {canEdit && secretFields.length > 0 ? (
            <FormSection
              title="Update its details"
              description="Paste a fresh value only if you changed it at the other service — leave a box blank to keep what is stored now."
            >
              {secretFields.map((field) => (
                <ConfigFieldControl
                  key={field.key}
                  field={field}
                  value={secretValues[field.key] ?? ''}
                  secretPlaceholder="Leave blank to keep the current one"
                  onChange={(next) => {
                    setSecretValues((prev) => ({ ...prev, [field.key]: next }));
                  }}
                />
              ))}
              <div>
                <Button
                  size="sm"
                  color="module"
                  loading={updateConfig.isPending}
                  disabled={!secretDirty}
                  onClick={onSaveSecrets}
                >
                  Save details
                </Button>
              </div>
            </FormSection>
          ) : null}

          {canEdit ? (
            <FormSection title="Disconnect">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text className="text-sm">
                  Remove this connection entirely. Your account with the other service is not
                  touched.
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  loading={disconnect.isPending}
                  onClick={() => {
                    void onDisconnect();
                  }}
                >
                  <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                  Disconnect
                </Button>
              </div>
            </FormSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function IntegrationDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data: viewer } = useViewer();
  const editable = canManage(viewer?.role);

  const id = typeof ctx.params.id === 'string' ? ctx.params.id : undefined;
  const slug = typeof ctx.params.slug === 'string' ? ctx.params.slug : undefined;
  const kind = typeof ctx.params.kind === 'string' ? (ctx.params.kind as ProviderKind) : undefined;

  if (id) {
    return <ManageIntegration ctx={ctx} id={id} slug={slug} canEdit={editable} />;
  }
  if (slug) {
    if (!editable) {
      return (
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            title="Connecting a service is limited to admins"
            description="Ask an admin on your team to connect this one for you."
          />
        </Card>
      );
    }
    return <ConnectIntegration ctx={ctx} slug={slug} presetKind={kind} />;
  }

  return (
    <Card className="min-h-0 flex-1 items-center justify-center">
      <PaneLoadError
        reason="missing"
        title="Nothing chosen"
        description="Open a service from the Integrations list to set it up."
      />
    </Card>
  );
}
