'use client';

// AI connections — the credential home for everything AI, built around the one
// thing a non-technical owner must never conflate: the two AI plumbing concepts
// point in OPPOSITE directions.
//
//   • Your AI account (BYOK) — sparx uses YOUR Anthropic/OpenAI account to write
//     and answer FOR you. sparx never holds an AI key of its own. Its behaviour
//     is shaped by Instructions (ai.prompts).
//   • Apps you connect (MCP) — you point your OWN outside AI app (Claude,
//     ChatGPT, Copilot) AT sparx so it can reach in and act. Two credential
//     kinds: connected assistants (sign-in) and API keys (for apps that can't
//     sign in). What a connected app may DO is governed by Permissions (ai.tools).
//
// So the surface is three separately-headed sections in one capped column: the
// account (one direction) above, then the two credential kinds for apps reaching
// IN (the other direction). Each section's own words re-state its direction so
// the two are never read as one thing.
//
// One centred column, not EditorLayout: short forms and facts, no running
// summary to put in a rail. Everything that reveals or changes key material is
// admin — a non-admin sees the account read-only and a plain note on the rest.
//
// Key issuance stays INLINE in the pane, never a modal: the plaintext key is
// shown exactly once and is the only durable thing here worth returning to.
// A modal is invisible to the unsaved-work net (it evaporates on reload, site
// switch and tear-off), so a dismissed modal would lose the one copy of a
// just-minted secret irrecoverably. Inline, the reveal is dirty-tracked and the
// pane guards it like any other unsaved work.

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
  Heading,
  Input,
  NativeSelect,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@wizeworks/query';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useViewer, useModuleStates } from '../../lib/api/shell-data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  aiCredentialErrorMessage,
  apiKeyState,
  credentialState,
  providerKeyHelp,
  providerLabel,
  summariseScopes,
  useAiCredential,
  useApiKeys,
  useConnectAiCredential,
  useDisconnectAiCredential,
  useIssueApiKey,
  useMcpConnections,
  useRevokeApiKey,
  useRevokeMcpConnection,
  useScopeCatalog,
  useTestAiCredential,
  API_KEYS_KEY,
  AI_CREDENTIAL_KEY,
  MCP_CONNECTIONS_KEY,
  type AiCredential,
  type AiProvider,
  type ApiKeySummary,
  type IssuedKey,
  type McpConnection,
  type ScopeMeta,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const PROVIDER_ITEMS: Record<AiProvider, string> = {
  anthropic: providerLabel('anthropic'),
  openai: providerLabel('openai'),
};

/** How long a new key lasts. Presets rather than a date field — a non-technical
 *  owner picks "in 90 days", not a calendar. */
const EXPIRY_ITEMS: Record<string, string> = {
  '': 'Never expires',
  '30': 'In 30 days',
  '90': 'In 90 days',
  '365': 'In a year',
};

function canManageAi(role: string | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** A value someone copies into another company's website or AI app, character
 *  for character — so it is monospaced, selectable, and has a copy button. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      toast.add({
        title: 'Could not copy that',
        description: 'Select the text and copy it manually.',
        type: 'error',
      });
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <code className="bg-base-200 min-w-0 flex-1 rounded px-2 py-1 font-mono text-sm break-all">
        {value}
      </code>
      <Button
        size="sm"
        variant="ghost"
        color="neutral"
        shape="square"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={() => {
          void copy();
        }}
      >
        {copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}

/** One clickable cross-pointer to the surface that governs a connection's
 *  BEHAVIOUR — Instructions for the account, Permissions for connected apps. */
function CrossPointer({
  ctx,
  surface,
  title,
  detail,
}: {
  ctx: SurfaceContext;
  surface: string;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      className="border-base-300 hover:bg-base-200 flex items-start gap-3 rounded-lg border p-3 text-left"
      onClick={(event) => {
        ctx.open(surface, {}, { target: targetFor(event) });
      }}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <Text as="span" className="text-sm">
          {detail}
        </Text>
      </span>
      <ArrowRight className="text-module mt-1 size-4 shrink-0" aria-hidden />
    </button>
  );
}

/* ── Section 1: Your AI account (BYOK) ──────────────────────────────────────── */

/** The provider + key form, shared by first-time connect and later replace.
 *  Owns its own dirty registration so leaving with a half-typed key asks first. */
function KeyForm({
  submitLabel,
  connecting,
  failure,
  onSubmit,
  onCancel,
}: {
  submitLabel: string;
  connecting: boolean;
  failure: string | null;
  onSubmit: (provider: AiProvider, apiKey: string) => void;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const trimmed = apiKey.trim();

  useDirtySource(
    trimmed !== '' && !connecting,
    'You have typed an AI key but not saved it yet. Close anyway?'
  );

  const help = providerKeyHelp(provider);
  const submit = () => {
    if (trimmed === '') return;
    onSubmit(provider, trimmed);
  };

  return (
    <div className="flex flex-col gap-4">
      <SaveFailure title="That key could not be used" message={failure} />

      <Field>
        <FieldLabel>Which AI service is it?</FieldLabel>
        <Select
          color="module"
          items={PROVIDER_ITEMS}
          value={provider}
          aria-label="AI service"
          onValueChange={(next) => {
            setProvider(next as AiProvider);
          }}
        />
        <FieldDescription>
          The company you have an AI account with. Choose the one your key came from.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Your key</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              type="password"
              value={apiKey}
              placeholder="Paste your key here"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setApiKey(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          }
        />
        <FieldDescription>
          A long secret code from your AI account — find it at {help.where}. We check it works, then
          store it encrypted. It is never shown again, only its last few characters.{' '}
          <a href={help.url} target="_blank" rel="noreferrer" className="link">
            Open {providerLabel(provider)}
            <ExternalLink className="ml-0.5 inline size-3" aria-hidden />
          </a>
        </FieldDescription>
      </Field>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          color="module"
          size="sm"
          loading={connecting}
          disabled={trimmed === ''}
          onClick={submit}
        >
          <Link2 className="size-4" aria-hidden />
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            disabled={connecting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AiAccountSection({
  ctx,
  credential,
  canManage,
  aiOn,
}: {
  ctx: SurfaceContext;
  credential: AiCredential | null;
  canManage: boolean;
  aiOn: boolean | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const connect = useConnectAiCredential();
  const test = useTestAiCredential();
  const disconnect = useDisconnectAiCredential();
  const [replacing, setReplacing] = useState(false);

  const onConnect = (provider: AiProvider, apiKey: string) => {
    connect.mutate(
      { provider, apiKey },
      {
        onSuccess: () => {
          setReplacing(false);
          afterPaneChange(() => {
            toast.add({
              title: `${providerLabel(provider)} connected`,
              description: 'Your AI features can now use your account.',
              type: 'success',
            });
          });
        },
      }
    );
  };

  const onCheck = () => {
    test.mutate(undefined, {
      // Deferred: the shared hook invalidates the credential query on settle, so
      // raising a toast in the same continuation lands its flushSync inside a
      // render commit ("flushSync was called from inside a lifecycle method").
      onSuccess: (result) => {
        afterPaneChange(() => {
          if (result.ok) {
            toast.add({
              title: 'Your AI account is working',
              description: 'It answered just now.',
              type: 'success',
            });
          } else {
            toast.add({
              title: 'Your AI account did not answer',
              description: result.error,
              type: 'error',
            });
          }
        });
      },
    });
  };

  const onDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect your AI account?',
      description:
        'The AI features will stop working until you connect an account again. Your stored key is deleted — you will need to paste it again to reconnect. This does not touch your account with the AI provider itself.',
      confirmLabel: 'Disconnect it',
      cancelLabel: 'Keep it connected',
      color: 'danger',
    });
    if (!ok) return;
    disconnect.mutate(undefined, {
      onSuccess: () => {
        setReplacing(false);
        afterPaneChange(() => {
          toast.add({ title: 'Your AI account was disconnected', type: 'success' });
        });
      },
      onError: (error) => {
        afterPaneChange(() => {
          toast.add({
            title: 'Could not disconnect that account',
            description: aiCredentialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        });
      },
    });
  };

  const failure = connect.isError
    ? aiCredentialErrorMessage(
        connect.error,
        credential
          ? 'Could not use that key. Your existing account is unchanged.'
          : 'Could not connect that account. Nothing was saved.'
      )
    : null;

  const state = credential ? credentialState(credential) : null;

  return (
    <FormSection
      title="Your AI account"
      description="sparx uses this account to write and answer for you — it is the AI service you already pay for. sparx never uses AI on your behalf without it, and the work is billed to your provider, never to sparx."
    >
      {credential && state ? (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <KeyRound className="text-module size-5 shrink-0" aria-hidden />
              <Heading level={3} className="text-lg font-semibold">
                Connected to {providerLabel(credential.provider)}
              </Heading>
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            </div>
            <Text className="text-sm">
              Key ending {credential.keyLast4 || '••••'} · Connected{' '}
              {formatDate(credential.connectedAt)}
              {credential.lastVerifiedAt
                ? ` · Last checked ${formatDate(credential.lastVerifiedAt)}`
                : ''}
            </Text>
          </div>

          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>{state.detail}</AlertDescription>
            </AlertContent>
          </Alert>

          {aiOn === false ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>The AI features are switched off right now</AlertTitle>
                <AlertDescription>
                  Your account is connected, but nothing will use it until you turn on the AI part
                  of sparx under Modules.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {canManage ? (
            replacing ? (
              <KeyForm
                submitLabel="Save new key"
                connecting={connect.isPending}
                failure={failure}
                onSubmit={onConnect}
                onCancel={() => {
                  setReplacing(false);
                }}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" color="module" loading={test.isPending} onClick={onCheck}>
                  <RefreshCw className="size-4" aria-hidden />
                  Check now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  onClick={() => {
                    setReplacing(true);
                  }}
                >
                  Replace key
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  loading={disconnect.isPending}
                  onClick={() => {
                    void onDisconnect();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Disconnect
                </Button>
              </div>
            )
          ) : (
            <Text className="text-sm">Only an account admin can change or disconnect this.</Text>
          )}
        </>
      ) : canManage ? (
        <>
          <Text className="text-sm">
            No AI account is connected yet. The AI features need one to work — add the service you
            pay for and paste its key below.
          </Text>
          {aiOn === false ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>The AI features are switched off right now</AlertTitle>
                <AlertDescription>
                  You can connect your account now, but nothing will use it until you turn on the AI
                  part of sparx under Modules.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
          <KeyForm
            submitLabel="Connect account"
            connecting={connect.isPending}
            failure={failure}
            onSubmit={onConnect}
          />
        </>
      ) : (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>No AI account is connected yet</AlertTitle>
            <AlertDescription>
              Connecting the AI account is limited to account admins. Ask an admin on your team to
              add the service you pay for.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <CrossPointer
        ctx={ctx}
        surface="ai.prompts"
        title="How it writes for you → Instructions"
        detail="Set the voice, rules and facts sparx follows when it writes with your account."
      />
    </FormSection>
  );
}

/* ── Section 2: Connected assistants (MCP OAuth) ────────────────────────────── */

function ConnectionRow({
  connection,
  catalog,
  canManage,
  onRevoke,
  revoking,
}: {
  connection: McpConnection;
  catalog: ScopeMeta[] | undefined;
  canManage: boolean;
  onRevoke: () => void;
  revoking: boolean;
}) {
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text className="font-semibold">{connection.clientName ?? 'A connected AI app'}</Text>
        <Text className="text-sm">
          Can reach {summariseScopes(connection.scopes, catalog)} · Connected{' '}
          {formatDate(connection.firstAuthorizedAt)}
        </Text>
      </div>
      {canManage ? (
        <Button size="sm" variant="ghost" color="danger" loading={revoking} onClick={onRevoke}>
          <Trash2 className="size-4" aria-hidden />
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function ConnectedAssistantsSection({
  ctx,
  canManage,
  endpoint,
  catalog,
}: {
  ctx: SurfaceContext;
  canManage: boolean;
  endpoint: string;
  catalog: ScopeMeta[] | undefined;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isPending, isError, refetch } = useMcpConnections(canManage);
  const revoke = useRevokeMcpConnection();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const onRevoke = async (connection: McpConnection) => {
    const name = connection.clientName ?? 'this AI app';
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: `${name} will lose access to your business immediately and cannot reach it again until you approve it afresh from inside the app. Nothing in your business is changed or deleted.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it connected',
      color: 'danger',
    });
    if (!ok) return;
    setRevokingId(connection.clientId);
    revoke.mutate(connection.clientId, {
      // Toast deferred past the list re-render the revoke invalidation triggers,
      // so its flushSync doesn't land inside a commit while the confirm closes.
      onSuccess: () => {
        setRevokingId(null);
        afterPaneChange(() => {
          toast.add({ title: `${name} removed`, type: 'success' });
        });
      },
      onError: () => {
        setRevokingId(null);
        afterPaneChange(() => {
          toast.add({
            title: 'Could not remove that app',
            description: 'Nothing was changed. Try again.',
            type: 'error',
          });
        });
      },
    });
  };

  return (
    <FormSection
      title="Connected assistants"
      description="The other direction: an outside AI app you point at your business — Claude, ChatGPT, Copilot — so it can look things up and make changes for you. These connect by signing in and approving access."
    >
      <div className="flex flex-col gap-1">
        <Text className="text-sm font-semibold">The address to give your AI app</Text>
        <CopyValue value={endpoint} label="connection address" />
        <Text className="text-sm">
          Paste this into your AI app when it asks where to connect (some apps call this an “MCP
          server”). It will send you here to sign in and approve access — nothing reaches your
          business until you do.
        </Text>
      </div>

      {!canManage ? (
        <Text className="text-sm">
          Only an account admin can see and remove connected apps. Ask an admin on your team.
        </Text>
      ) : isError ? (
        <Alert color="error">
          <AlertContent>
            <AlertTitle>Could not load your connected apps</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server, not your apps.
            </AlertDescription>
          </AlertContent>
          <Button
            size="sm"
            color="error"
            variant="soft"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : data.length === 0 ? (
        <div className="border-base-300 rounded-lg border border-dashed p-4">
          <Text className="text-sm">
            No AI apps are connected yet. Add sparx as a connector inside your AI app using the
            address above and approve access — it will appear here once you do.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((connection) => (
            <ConnectionRow
              key={connection.clientId}
              connection={connection}
              catalog={catalog}
              canManage={canManage}
              revoking={revokingId === connection.clientId}
              onRevoke={() => {
                void onRevoke(connection);
              }}
            />
          ))}
        </div>
      )}

      <CrossPointer
        ctx={ctx}
        surface="ai.tools"
        title="What connected apps can do → Permissions"
        detail="Choose exactly which tools a connected app may use, and switch any of them off at any time."
      />
    </FormSection>
  );
}

/* ── Section 3: API keys ────────────────────────────────────────────────────── */

/** The role-capped scope picker, grouped by the part of the business each
 *  permission touches. Modules are shown in the catalog's own order. */
function ScopePicker({
  catalog,
  selected,
  onToggle,
}: {
  catalog: ScopeMeta[];
  selected: Set<string>;
  onToggle: (scope: string, on: boolean) => void;
}) {
  const groups = useMemo(() => {
    const order: string[] = [];
    const byModule = new Map<string, ScopeMeta[]>();
    for (const meta of catalog) {
      if (!byModule.has(meta.module)) {
        byModule.set(meta.module, []);
        order.push(meta.module);
      }
      byModule.get(meta.module)?.push(meta);
    }
    return order.map((module) => ({ module, scopes: byModule.get(module) ?? [] }));
  }, [catalog]);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.module} className="flex flex-col gap-2">
          <Text className="text-sm font-semibold">{group.module}</Text>
          {group.scopes.map((meta) => (
            <label
              key={meta.scope}
              className="border-base-300 hover:bg-base-200 flex items-start gap-3 rounded-lg border p-3"
            >
              <Checkbox
                color="module"
                className="mt-0.5"
                checked={selected.has(meta.scope)}
                aria-label={meta.label}
                onChange={(event) => {
                  onToggle(meta.scope, event.target.checked);
                }}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {meta.label}
                  {meta.sensitive ? (
                    <Badge color="warning" variant="soft" size="sm">
                      Powerful
                    </Badge>
                  ) : null}
                </span>
                <Text as="span" className="text-sm">
                  {meta.description}
                </Text>
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The one-time reveal. The plaintext key is shown once and never returns, so
 *  this panel is dirty-tracked by its parent until the operator confirms they've
 *  saved it. */
function KeyReveal({ issued, onDone }: { issued: IssuedKey; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert color="success" variant="soft">
        <AlertContent>
          <AlertTitle>Your new key is ready</AlertTitle>
          <AlertDescription>
            Copy it now and store it somewhere safe. For your security it is shown only this once —
            we cannot show it again, and if you lose it you will simply make a new one.
          </AlertDescription>
        </AlertContent>
      </Alert>
      <CopyValue value={issued.plaintext} label="new API key" />
      <div>
        <Button color="module" size="sm" onClick={onDone}>
          <Check className="size-4" aria-hidden />
          I&apos;ve saved it
        </Button>
      </div>
    </div>
  );
}

function KeyRow({
  apiKey,
  catalog,
  canManage,
  onRevoke,
  revoking,
}: {
  apiKey: ApiKeySummary;
  catalog: ScopeMeta[] | undefined;
  canManage: boolean;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const state = apiKeyState(apiKey);
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="font-semibold">{apiKey.name}</Text>
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        </div>
        <code className="text-sm break-all">{apiKey.keyPrefix}…</code>
        <Text className="text-sm">
          Can reach {summariseScopes(apiKey.scopes, catalog)}
          {apiKey.expiresAt && !apiKey.revokedAt
            ? ` · Expires ${formatDate(apiKey.expiresAt)}`
            : ''}
          {apiKey.lastUsedAt ? ` · Last used ${formatDate(apiKey.lastUsedAt)}` : ' · Never used'}
        </Text>
      </div>
      {canManage && state.active ? (
        <Button size="sm" variant="ghost" color="danger" loading={revoking} onClick={onRevoke}>
          <Trash2 className="size-4" aria-hidden />
          Revoke
        </Button>
      ) : null}
    </div>
  );
}

function ApiKeysSection({
  canManage,
  catalog,
  catalogLoading,
}: {
  canManage: boolean;
  catalog: ScopeMeta[] | undefined;
  catalogLoading: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isPending, isError, refetch } = useApiKeys(canManage);
  const issue = useIssueApiKey();
  const revoke = useRevokeApiKey();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<string>>(new Set());
  const [expiryDays, setExpiryDays] = useState('');
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const trimmedName = name.trim();
  const drafting = creating && !issued && (trimmedName !== '' || scopes.size > 0);
  // The reveal is unsaved work of the strongest kind: closing loses the ONLY
  // copy of a secret that can never be shown again.
  useDirtySource(
    issued !== null,
    "You haven't saved your new key yet — it can't be shown again. Close anyway?"
  );
  useDirtySource(drafting, 'You have started a new key but not created it yet. Close anyway?');

  const reset = () => {
    setCreating(false);
    setName('');
    setScopes(new Set());
    setExpiryDays('');
    setIssued(null);
    issue.reset();
  };

  const onIssue = () => {
    if (trimmedName === '' || scopes.size === 0) return;
    const expiresAt =
      expiryDays === ''
        ? null
        : new Date(Date.now() + Number(expiryDays) * 86_400_000).toISOString();
    issue.mutate(
      { name: trimmedName, scopes: [...scopes], expiresAt },
      {
        onSuccess: (result) => {
          setIssued(result);
        },
      }
    );
  };

  const onRevoke = async (apiKey: ApiKeySummary) => {
    const ok = await confirm({
      title: `Revoke “${apiKey.name}”?`,
      description:
        'Any AI app using this key stops reaching your business immediately. This cannot be undone — if you need access again you will make a new key. Nothing in your business is changed or deleted.',
      confirmLabel: 'Revoke it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    setRevokingId(apiKey.id);
    revoke.mutate(apiKey.id, {
      // Toast deferred past the list re-render the revoke invalidation triggers,
      // so its flushSync doesn't land inside a commit while the confirm closes.
      onSuccess: () => {
        setRevokingId(null);
        afterPaneChange(() => {
          toast.add({ title: `“${apiKey.name}” revoked`, type: 'success' });
        });
      },
      onError: () => {
        setRevokingId(null);
        afterPaneChange(() => {
          toast.add({
            title: 'Could not revoke that key',
            description: 'Nothing was changed. Try again.',
            type: 'error',
          });
        });
      },
    });
  };

  const issueFailure = issue.isError
    ? aiCredentialErrorMessage(issue.error, 'Could not create that key. Nothing was changed.')
    : null;

  const headerAction =
    canManage && !creating && !issued ? (
      <Button
        size="sm"
        color="module"
        onClick={() => {
          setCreating(true);
        }}
      >
        <Plus className="size-4" aria-hidden />
        New key
      </Button>
    ) : undefined;

  return (
    <FormSection
      title="API keys"
      description="For an AI app that can't sign in the usual way, a key does the same job — it lets one specific app reach into your business with only the permissions you choose. Treat a key like a password."
      action={headerAction}
    >
      {!canManage ? (
        <Text className="text-sm">
          Only an account admin can see and manage API keys, because a key is a password to your
          business. Ask an admin on your team.
        </Text>
      ) : issued ? (
        <KeyReveal issued={issued} onDone={reset} />
      ) : creating ? (
        <div className="border-base-300 flex flex-col gap-4 rounded-lg border p-4">
          <Heading level={3} className="text-base font-semibold">
            Create an API key
          </Heading>
          <SaveFailure title="That key could not be created" message={issueFailure} />

          <Field>
            <FieldLabel>What is it for?</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={name}
                  placeholder="e.g. Claude on my laptop"
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              }
            />
            <FieldDescription>
              A name only you see, so you can recognise this key later and revoke the right one.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>What may it do?</FieldLabel>
            {catalogLoading ? (
              <Text className="text-sm" role="status">
                Loading permissions…
              </Text>
            ) : catalog && catalog.length > 0 ? (
              <ScopePicker
                catalog={catalog}
                selected={scopes}
                onToggle={(scope, on) => {
                  setScopes((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(scope);
                    else next.delete(scope);
                    return next;
                  });
                }}
              />
            ) : (
              <Text className="text-sm">
                No permissions are available for your role to grant. An owner or admin can issue
                keys with wider access.
              </Text>
            )}
            <FieldDescription>
              Pick only what this app actually needs. You can only grant permissions your own role
              already has.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel>When should it stop working?</FieldLabel>
            <NativeSelect
              color="module"
              aria-label="When the key expires"
              value={expiryDays}
              onChange={(event) => {
                setExpiryDays(event.target.value);
              }}
            >
              {Object.entries(EXPIRY_ITEMS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>
              A key that expires is safer. You can always make a new one when it does.
            </FieldDescription>
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              color="module"
              size="sm"
              loading={issue.isPending}
              disabled={trimmedName === '' || scopes.size === 0}
              onClick={onIssue}
            >
              <KeyRound className="size-4" aria-hidden />
              Create key
            </Button>
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              disabled={issue.isPending}
              onClick={reset}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : isError ? (
        <Alert color="error">
          <AlertContent>
            <AlertTitle>Could not load your keys</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server, not your keys.
            </AlertDescription>
          </AlertContent>
          <Button
            size="sm"
            color="error"
            variant="soft"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : data.length === 0 ? (
        <div className="border-base-300 flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
          <Text className="text-sm">
            No API keys yet. Create one for an AI app that can&apos;t sign in the usual way — you
            choose exactly what it may reach.
          </Text>
          <Button
            size="sm"
            color="module"
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Create your first key
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((apiKey) => (
            <KeyRow
              key={apiKey.id}
              apiKey={apiKey}
              catalog={catalog}
              canManage={canManage}
              revoking={revokingId === apiKey.id}
              onRevoke={() => {
                void onRevoke(apiKey);
              }}
            />
          ))}
        </div>
      )}
    </FormSection>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────────── */

export function AiConnectionsSurface({ ctx }: { ctx: SurfaceContext }) {
  const queryClient = useQueryClient();
  const { data: viewer } = useViewer();
  const canManage = canManageAi(viewer?.role);

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAiCredential();
  const modules = useModuleStates();
  const aiOn = modules.data ? (modules.data.find((m) => m.slug === 'ai')?.enabled ?? false) : null;
  // The scope catalog is a viewer-safe vocabulary lookup, fetched here so both
  // the keys section (for the picker) and the connections/keys rows (to name
  // scopes in plain words) can share one copy.
  const scopeCatalog = useScopeCatalog(true);

  useEffect(() => {
    ctx.setTitle('AI connections');
  }, [ctx]);

  if (isError) {
    return (
      <PaneLoadError
        title="Could not load your AI connections"
        description="This is a problem reaching the server. Your connected account, apps and keys, if you have any, are unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !data) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const refreshAll = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: AI_CREDENTIAL_KEY });
    void queryClient.invalidateQueries({ queryKey: MCP_CONNECTIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="AI connection controls"
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={dataUpdatedAt}
            onRefresh={refreshAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              AI connections
            </Heading>
            <Text>
              Two separate things live here. Above is the AI account sparx uses to write and answer{' '}
              <span className="font-semibold">for you</span>. Below are the outside AI apps you let
              reach <span className="font-semibold">into your business</span> to look things up and
              make changes. They point in opposite directions, so they are kept apart.
            </Text>
          </div>

          <AiAccountSection
            ctx={ctx}
            credential={data.credential}
            canManage={canManage}
            aiOn={aiOn}
          />

          <ConnectedAssistantsSection
            ctx={ctx}
            canManage={canManage}
            endpoint={data.mcpEndpoint}
            catalog={scopeCatalog.data}
          />

          <ApiKeysSection
            canManage={canManage}
            catalog={scopeCatalog.data}
            catalogLoading={scopeCatalog.isPending && scopeCatalog.fetchStatus !== 'idle'}
          />
        </div>
      </div>
    </div>
  );
}
