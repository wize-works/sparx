'use client';

// Instructions — the library of notes sparx follows when it uses the owner's OWN
// AI account to write for them: how to describe the business, what tone to use,
// what never to say.
//
// This is ONE of the two AI relationships, and the header says so out loud: this
// is writing (sparx → your AI account → words back), NOT letting an outside AI
// app reach into the business and act (that is "Permissions",
// ai.tools). The cross-pointer under the heading teaches the boundary by
// contrast.
//
// A list of one-line things grouped by what each instruction is FOR, so it is a
// card per group and a row per instruction — not a table (a table here would
// invent columns to justify themselves and repeat a header per group). The row's
// content is the instruction's own name; the only marks on the right are the
// exceptions worth seeing at a glance: turned off, or one of the starter samples.
//
// Writing and managing an instruction is the SAME shape, so "new" opens the
// editor pane in the `{ id: 'new' }` state rather than a create modal — a
// half-written instruction is then tracked as unsaved work like everything else.
// The editor docks BESIDE this list (like a conversation beside the inbox) so the
// library never leaves the screen.

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
  SearchInput,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Bot, Plus, Sparkles } from 'lucide-react';
import { useViewer } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  aiErrorMessage,
  canAdminAi,
  canEditPrompts,
  categoryHint,
  categoryLabel,
  PROMPT_CATEGORIES,
  useInstallDefaultPrompts,
  usePromptTemplates,
  type PromptCategory,
  type PromptTemplateDto,
} from './data';
import { RowOpenHint } from '../../components/row-open-hint';

const EDITOR_SURFACE = 'ai.prompts.edit';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function InstructionRow({
  prompt,
  onOpen,
}: {
  prompt: PromptTemplateDto;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <li className="border-base-300 border-b last:border-b-0">
      <button
        type="button"
        className="hover:bg-base-200 flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={onOpen}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate font-medium">{prompt.name}</span>
            {prompt.isSample ? (
              <Badge color="info" variant="soft" size="sm">
                Starter
              </Badge>
            ) : null}
            {!prompt.enabled ? (
              <Badge color="neutral" variant="outline" size="sm">
                Turned off
              </Badge>
            ) : null}
          </span>
          {prompt.description ? (
            <span className="line-clamp-1 text-sm">{prompt.description}</span>
          ) : (
            <span className="text-sm italic">No summary</span>
          )}
        </span>
      </button>
    </li>
  );
}

export function AiPromptsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = usePromptTemplates();
  const { data: viewer } = useViewer();
  const install = useInstallDefaultPrompts();

  const canEdit = canEditPrompts(viewer?.role);
  const canInstall = canAdminAi(viewer?.role);

  const [search, setSearch] = useState('');
  const [categoryValue, setCategoryValue] = useState<'all' | PromptCategory>('all');

  const prompts = data ?? [];

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return (data ?? []).filter((prompt) => {
      if (categoryValue !== 'all' && prompt.category !== categoryValue) return false;
      if (needle === '') return true;
      return (
        prompt.name.toLowerCase().includes(needle) ||
        prompt.key.toLowerCase().includes(needle) ||
        (prompt.description ?? '').toLowerCase().includes(needle) ||
        prompt.body.toLowerCase().includes(needle)
      );
    });
  }, [data, categoryValue, needle]);

  // Grouped in the fixed category order (persona first), skipping empty groups.
  const groups = useMemo(() => {
    return PROMPT_CATEGORIES.map((category) => ({
      category,
      items: filtered.filter((prompt) => prompt.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filtered]);

  const isFiltering = categoryValue !== 'all' || needle !== '';

  const openEditor = (prompt: PromptTemplateDto, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(EDITOR_SURFACE, { id: prompt.id }, { target: targetFor(event) });
  };

  const openNew = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(EDITOR_SURFACE, { id: 'new' }, { target: targetFor(event) });
  };

  const onInstall = () => {
    install.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title:
            result.added > 0
              ? `Added ${String(result.added)} starter instruction${result.added === 1 ? '' : 's'}`
              : 'The starter instructions were already here',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not add the starter instructions',
          description: aiErrorMessage(error, 'Nothing was changed. Try again.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Instructions list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search instructions"
              placeholder="Search by name or wording…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        controls={
          <>
            <div className="w-44 shrink-0">
              <Select
                color="module"
                size="sm"
                aria-label="Filter by what it is for"
                value={categoryValue}
                items={{
                  all: 'Every kind',
                  ...Object.fromEntries(PROMPT_CATEGORIES.map((c) => [c, categoryLabel(c)])),
                }}
                onValueChange={(next) => {
                  setCategoryValue(next as 'all' | PromptCategory);
                }}
              />
            </div>
            {canEdit ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto shrink-0"
                title="Write a new instruction — hold Shift to open alongside, Alt for a new window"
                onClick={openNew}
              >
                <Plus className="size-4" aria-hidden />
                New instruction
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className={canEdit ? undefined : 'ml-auto'}
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
                Instructions
              </Heading>
              <Text>
                The voice and rules sparx follows when it writes for you using your own AI account —
                how to sound, what to say, and what to never say, right down to your site’s chat
                personality. The ones you turn on are the ones it follows.
              </Text>
            </div>
            <div className="border-base-300 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border px-3 py-2">
              <Text as="span" className="text-sm">
                This is not about letting an outside AI app into your business to look things up or
                make changes — that’s in
              </Text>
              <Button
                variant="link"
                color="module"
                size="sm"
                className="h-auto p-0"
                onClick={(event) => {
                  ctx.open('ai.tools', {}, { target: targetFor(event) });
                }}
              >
                Permissions
              </Button>
              <Text as="span" className="text-sm">
                .
              </Text>
            </div>
          </div>

          {isError ? (
            <Card>
              <EmptyState
                icon={<Bot className="size-6" aria-hidden />}
                title="Could not load your instructions"
                description="This is a problem reaching the server. Your instructions are unaffected — nothing has been lost."
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
              Loading your instructions…
            </p>
          ) : prompts.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bot className="size-6" aria-hidden />}
                title="No instructions yet"
                description={
                  canInstall
                    ? 'Start with a ready-made set covering a support personality, product descriptions, email and more — then edit any of them. Or write your own from scratch.'
                    : canEdit
                      ? 'Write your first instruction to tell your own AI account how to sound and what to say when sparx writes for you.'
                      : 'Nobody has written any instructions yet for how sparx should write using your AI account. Ask an account admin to add some.'
                }
                actions={
                  canInstall ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        color="module"
                        loading={install.isPending}
                        onClick={onInstall}
                      >
                        <Sparkles className="size-4" aria-hidden />
                        Add the starter set
                      </Button>
                      <Button size="sm" variant="outline" color="neutral" onClick={openNew}>
                        <Plus className="size-4" aria-hidden />
                        Write one from scratch
                      </Button>
                    </div>
                  ) : canEdit ? (
                    <Button size="sm" color="module" onClick={openNew}>
                      <Plus className="size-4" aria-hidden />
                      Write your first instruction
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : groups.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bot className="size-6" aria-hidden />}
                title="Nothing matches that"
                description="No instruction matches your search or the kind you picked. Try different wording, or choose “Every kind”."
              />
            </Card>
          ) : (
            <>
              {/* One quiet line where the special category needs it: the persona is
                  the assistant's live personality, which is not obvious from a name. */}
              {!isFiltering && groups.some((group) => group.category === 'persona') ? (
                <Alert color="info">
                  <Bot className="size-5" aria-hidden />
                  <AlertContent>
                    <AlertTitle>Your live chat uses a personality</AlertTitle>
                    <AlertDescription>
                      The assistant that answers on your website follows whichever “Assistant
                      personality” instruction is turned on. Turn one off and it stops using it.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}

              {groups.map((group) => (
                <Card key={group.category} className="overflow-hidden">
                  <header className="border-base-300 flex flex-col gap-0.5 border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Heading level={2} className="text-base font-semibold">
                        {categoryLabel(group.category)}
                      </Heading>
                      <div className="flex-1" />
                      <Text className="text-sm">
                        {group.items.length === 1 ? '1' : String(group.items.length)}
                      </Text>
                    </div>
                    <Text className="text-sm">{categoryHint(group.category)}</Text>
                  </header>
                  <ul>
                    {group.items.map((prompt) => (
                      <InstructionRow
                        key={prompt.id}
                        prompt={prompt}
                        onOpen={(event) => {
                          openEditor(prompt, event);
                        }}
                      />
                    ))}
                  </ul>
                </Card>
              ))}

              <RowOpenHint />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
