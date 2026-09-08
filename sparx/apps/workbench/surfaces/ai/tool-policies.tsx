'use client';

// Permissions — the one screen where you decide which parts of
// your business an outside AI app you have CONNECTED is allowed to look at or
// change.
//
// This is ONE of the two AI relationships, and the opposite of Instructions: here
// an outside app reaches INTO sparx and acts on your data (an app you connect →
// sparx → reads/changes your data), rather than sparx writing FOR you with your
// own AI account. The header says so out loud and points across to Instructions,
// so the two never read as one ambient "the AI".
//
// "MCP" and "tools" never appear as jargon: to the owner these are just the
// things a connected app can do on their behalf. Each tool is either something
// that only READS (looks something up) or something that CAN CHANGE data — the
// distinction that matters most below the primary separation, so it is badged on
// every row and the changing ones wear a caution color. Everything is available
// by default; a switch turned off hides that tool from every connected app.
//
// A singleton — one policy per site. Grouped by the part of the business each
// tool belongs to, and each group wears THAT part's color (nested ModuleScope),
// so the screen reads as "your business, with a switch on each capability" rather
// than a flat list of jargon. Changing exposure is a security control, so it is
// admin-only: everyone else sees the state, read-only.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  Switch,
  Text,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { KeyRound, RotateCcw, ShieldCheck, Wrench } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useViewer } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { moduleIcon, moduleLabel } from '../../lib/surfaces/nav';
import {
  ModuleScope,
  WORKBENCH_MODULES,
  type WorkbenchModule,
} from '../../components/module-scope';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  aiErrorMessage,
  canAdminAi,
  useResetAllToolPolicies,
  useResetToolPolicy,
  useSetToolPolicy,
  useToolPolicies,
  type ToolPolicyDto,
} from './data';

/** A tool with no business area works across the whole account (search, task
 *  automation, web addresses). Its own bucket, shown last. */
const PLATFORM_KEY = '__platform__';

const MODULE_SET = new Set<string>(WORKBENCH_MODULES);
function isWorkbenchModule(value: string): value is WorkbenchModule {
  return MODULE_SET.has(value);
}

interface ToolGroup {
  /** A real module slug, or PLATFORM_KEY for the account-wide bucket. */
  key: string;
  label: string;
  module: WorkbenchModule | null;
  tools: ToolPolicyDto[];
}

function groupTools(tools: ToolPolicyDto[]): ToolGroup[] {
  const byKey = new Map<string, ToolPolicyDto[]>();
  for (const tool of tools) {
    const key = tool.module ?? PLATFORM_KEY;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(tool);
    else byKey.set(key, [tool]);
  }

  const groups: ToolGroup[] = [];
  for (const [key, groupTools_] of byKey) {
    if (key === PLATFORM_KEY) continue;
    groups.push({
      key,
      label: isWorkbenchModule(key) ? moduleLabel(key) : key,
      module: isWorkbenchModule(key) ? key : null,
      tools: groupTools_,
    });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));

  const platform = byKey.get(PLATFORM_KEY);
  if (platform) {
    groups.push({
      key: PLATFORM_KEY,
      label: 'Works across your whole account',
      module: null,
      tools: platform,
    });
  }
  return groups;
}

/* ── One tool row ──────────────────────────────────────────────────────────── */

function ToolRow({
  tool,
  canManage,
  busy,
  onToggle,
  onReset,
}: {
  tool: ToolPolicyDto;
  canManage: boolean;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onReset: () => void;
}) {
  return (
    <li className="border-base-300 flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Text className="font-medium">{tool.description}</Text>
        <div className="flex flex-wrap items-center gap-2">
          {tool.write ? (
            <Badge color="warning" variant="soft" size="sm">
              Can make changes
            </Badge>
          ) : (
            <Badge color="neutral" variant="soft" size="sm">
              Only looks things up
            </Badge>
          )}
          {tool.explicit ? (
            <Text as="span" className="text-sm">
              Changed from the default
            </Text>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {tool.explicit && canManage ? (
          <Tooltip content="Put this tool back to its default (on)">
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              shape="square"
              aria-label={`Reset “${tool.description}” to its default`}
              loading={busy}
              onClick={onReset}
            >
              <RotateCcw className="size-4" aria-hidden />
            </Button>
          </Tooltip>
        ) : null}

        {canManage ? (
          <Switch
            color="module"
            checked={tool.enabled}
            disabled={busy}
            aria-label={
              tool.enabled
                ? `Allowed: ${tool.description}. Switch off to block it.`
                : `Blocked: ${tool.description}. Switch on to allow it.`
            }
            onCheckedChange={onToggle}
          />
        ) : (
          <Badge color={tool.enabled ? 'success' : 'neutral'} variant="soft" size="sm">
            {tool.enabled ? 'Allowed' : 'Blocked'}
          </Badge>
        )}
      </div>
    </li>
  );
}

/* ── The surface ───────────────────────────────────────────────────────────── */

/** Same modifier contract as every other launch in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function AiToolPoliciesSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useToolPolicies();
  const { data: viewer } = useViewer();
  const canManage = canAdminAi(viewer?.role);

  const setPolicy = useSetToolPolicy();
  const resetOne = useResetToolPolicy();
  const resetAll = useResetAllToolPolicies();

  // Which single tool is mid-flight, so only its own controls read as busy.
  const [pendingTool, setPendingTool] = useState<string | null>(null);

  const tools = data ?? [];
  const groups = useMemo(() => groupTools(data ?? []), [data]);
  const blockedCount = tools.filter((t) => !t.enabled).length;
  const changedCount = tools.filter((t) => t.explicit).length;

  const onToggle = (tool: ToolPolicyDto, enabled: boolean) => {
    setPendingTool(tool.name);
    setPolicy.mutate(
      { tool: tool.name, enabled },
      {
        onSuccess: () => {
          toast.add({
            title: enabled ? 'Tool switched on' : 'Tool switched off',
            description: enabled
              ? 'A connected AI assistant can use this again.'
              : 'A connected AI assistant can no longer use this.',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not change that',
            description: aiErrorMessage(error, 'Nothing was changed. Try again.'),
            type: 'error',
          });
        },
        onSettled: () => {
          setPendingTool(null);
        },
      }
    );
  };

  const onReset = (tool: ToolPolicyDto) => {
    setPendingTool(tool.name);
    resetOne.mutate(tool.name, {
      onSuccess: () => {
        toast.add({ title: 'Put back to its default', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not reset that',
          description: aiErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
      onSettled: () => {
        setPendingTool(null);
      },
    });
  };

  const onResetAll = async () => {
    const ok = await confirm({
      title: 'Turn every tool back on?',
      description:
        'This removes all the restrictions you have set here and lets a connected AI assistant use every tool again. You can switch individual ones back off afterwards.',
      confirmLabel: 'Turn them all on',
      cancelLabel: 'Keep my restrictions',
      color: 'danger',
    });
    if (!ok) return;
    resetAll.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title:
            result.cleared > 0
              ? 'All restrictions removed'
              : 'There were no restrictions to remove',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not reset your tools',
          description: aiErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Connected app access controls"
        status={
          <Text as="span" className="text-sm font-medium">
            Permissions
          </Text>
        }
        primary={
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            className="ml-auto shrink-0"
            title="Connect an app and manage its keys"
            onClick={(event) => {
              ctx.open('platform.settings.ai', {}, { target: targetFor(event) });
            }}
          >
            <KeyRound className="size-4" aria-hidden />
            AI connections
          </Button>
        }
        controls={
          <>
            {blockedCount > 0 ? (
              <Badge color="warning" variant="soft" size="sm">
                {blockedCount === 1 ? '1 switched off' : `${String(blockedCount)} switched off`}
              </Badge>
            ) : null}
            {canManage ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                className="shrink-0"
                loading={resetAll.isPending}
                disabled={changedCount === 0}
                title={
                  changedCount === 0
                    ? 'Nothing to reset — every tool is at its default'
                    : 'Remove every restriction and turn all tools back on'
                }
                onClick={() => {
                  void onResetAll();
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                Reset all
              </Button>
            ) : null}
          </>
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
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Permissions
              </Heading>
              <Text>
                What an AI app you’ve connected — like an assistant on your own computer — may look
                up or change in your business, tool by tool. Everything is available by default;
                switch off anything it shouldn’t reach. You connect an app and manage its keys in AI
                connections.
              </Text>
            </div>
            <div className="border-base-300 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border px-3 py-2">
              <Text as="span" className="text-sm">
                This is about an outside app reaching into your business and acting. It’s not the
                writing help sparx does with your own AI account — that’s in
              </Text>
              <Button
                variant="link"
                color="module"
                size="sm"
                className="h-auto p-0"
                onClick={(event) => {
                  ctx.open('ai.prompts', {}, { target: targetFor(event) });
                }}
              >
                Instructions
              </Button>
              <Text as="span" className="text-sm">
                .
              </Text>
            </div>
          </div>

          {!canManage && !isError && !isPending ? (
            <Alert color="info">
              <ShieldCheck className="size-5" aria-hidden />
              <AlertContent>
                <AlertTitle>You can see these but not change them</AlertTitle>
                <AlertDescription>
                  Deciding what an AI assistant may touch is a security setting, so only an account
                  admin or owner can change it. Ask one of them if something here needs adjusting.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {isError ? (
            <Card>
              <EmptyState
                icon={<Wrench className="size-6" aria-hidden />}
                title="Could not load your tool settings"
                description="This is a problem reaching the server. Your current settings are unaffected."
                actions={
                  <Button
                    size="sm"
                    color="module"
                    variant="soft"
                    onClick={() => {
                      void refetch();
                    }}
                  >
                    Try again
                  </Button>
                }
              />
            </Card>
          ) : isPending ? (
            <p className="p-4 text-sm" role="status">
              Loading your tool settings…
            </p>
          ) : groups.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Wrench className="size-6" aria-hidden />}
                title="No tools available yet"
                description="There is nothing here for a connected app to use yet. This usually fills in as you turn on more parts of your business."
              />
            </Card>
          ) : (
            groups.map((group) => {
              const card = (
                <Card key={group.key} className="overflow-hidden">
                  <header className="border-base-300 flex items-center gap-2 border-b px-4 py-3">
                    <GroupIcon module={group.module} />
                    <Heading level={2} className="text-base font-semibold">
                      {group.label}
                    </Heading>
                    <div className="flex-1" />
                    <Text className="text-sm">
                      {group.tools.length === 1 ? '1 tool' : `${String(group.tools.length)} tools`}
                    </Text>
                  </header>
                  <ul>
                    {group.tools.map((tool) => (
                      <ToolRow
                        key={tool.name}
                        tool={tool}
                        canManage={canManage}
                        busy={pendingTool === tool.name}
                        onToggle={(enabled) => {
                          onToggle(tool, enabled);
                        }}
                        onReset={() => {
                          onReset(tool);
                        }}
                      />
                    ))}
                  </ul>
                </Card>
              );
              // Each business area wears its own color so the screen reads as a
              // map of the business. The account-wide bucket keeps the pane's hue.
              return group.module ? (
                <ModuleScope key={group.key} module={group.module}>
                  {card}
                </ModuleScope>
              ) : (
                card
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function GroupIcon({ module }: { module: WorkbenchModule | null }) {
  const Icon = module ? moduleIcon(module) : null;
  if (!Icon) return <Wrench className="text-module size-5 shrink-0" aria-hidden />;
  return <Icon className="text-module size-5 shrink-0" aria-hidden />;
}
