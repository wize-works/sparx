'use client';

// Saved paragraphs — the sentences a business types over and over inside an
// email it is otherwise writing from scratch (docs/144 §5.4).
//
// A SEPARATE SURFACE FROM TEMPLATES, NOT A TAB BESIDE THEM. The workbench is a
// tabbed app and a pane sits in a strip already, so a strip inside one is a
// third layer that does not read as a choice. It is also the wrong grouping:
// these are two different things kept by different people. A template is a
// whole message somebody in sales owns; a paragraph is usually a FACT about the
// business — the opening hours, the returns policy, the lead time — and whoever
// knows that fact should be able to fix it in one place without opening a
// screen full of other people's sales emails. Open the two side by side if you
// want both; that is what panes are for.
//
// THE SHORTCUT NOW ACTUALLY EXPANDS. Every snippet has always carried one, and
// the composer listed them under the message box as though typing one did
// something — and nothing anywhere expanded anything. A business that carefully
// wrote `;hours` got a box advertising a feature the product did not have. The
// expansion lives in `expandShortcutBefore`, and each one counts a use, which
// is what floats the paragraphs people really reach for to the top.
//
// THE SHORTCUT CANNOT BE CHANGED AFTERWARDS, and that is deliberate rather than
// a missing form field — it is the thing people type without thinking, so
// changing it breaks the habit everywhere at once while the old muscle memory
// keeps producing nothing. Delete it and make another if it is genuinely wrong.
// (The server agrees: `UpdateSnippetInput` has no shortcut.)

import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Switch,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Pencil, Plus, TextQuote, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  engagementErrorMessage,
  useSalesSnippetMutations,
  useSalesSnippets,
  type SalesSnippet,
} from './engagement-data';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/** Typed with or without the leading `;`, stored without it — so a tenant who
 *  types one and a tenant who does not reach the same paragraph. Mirrors the
 *  server's `CreateSnippetInput`, which is the authority. */
function normaliseShortcut(raw: string): string {
  return raw
    .replace(/^[;:/]/, '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 63);
}

interface Draft {
  shortcut: string;
  name: string;
  body: string;
  isShared: boolean;
}

const BLANK: Draft = { shortcut: '', name: '', body: '', isShared: true };

export function SnippetsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const snippets = useSalesSnippets();
  const { create, update, remove } = useSalesSnippetMutations();
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    ctx.setTitle('Saved paragraphs');
  }, [ctx]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesSnippet | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  // Shorter than a template, but a paragraph somebody has just worded carefully
  // is still worth asking about — and a dialog cannot ask on its own behalf.
  // Measured against the SAVED paragraph, so re-reading one does not mark the
  // pane dirty for somebody who changed nothing.
  useDirtySource(
    open &&
      (editing
        ? draft.name !== editing.name ||
          draft.body !== editing.body ||
          draft.isShared !== editing.isShared
        : draft.body.trim() !== ''),
    'You have a paragraph written here that has not been saved. Close anyway?'
  );

  const close = (): void => {
    setOpen(false);
    setEditing(null);
    setDraft(BLANK);
  };

  const startNew = (): void => {
    setEditing(null);
    setDraft(BLANK);
    setOpen(true);
  };

  const startEdit = (snippet: SalesSnippet): void => {
    setEditing(snippet);
    setDraft({
      shortcut: snippet.shortcut,
      name: snippet.name,
      body: snippet.body,
      isShared: snippet.isShared,
    });
    setOpen(true);
  };

  const rows = snippets.data?.items ?? [];

  const canSubmit =
    draft.name.trim() !== '' &&
    draft.body.trim() !== '' &&
    (editing !== null || draft.shortcut.trim().length >= 2);

  const submit = (): void => {
    if (editing) {
      update.mutate(
        {
          id: editing.id,
          patch: { name: draft.name.trim(), body: draft.body, isShared: draft.isShared },
        },
        {
          onSuccess: () => {
            close();
            toast.add({ title: 'Paragraph saved', type: 'success' });
          },
          onError: (error) => {
            toast.add({
              title: 'Could not save that paragraph',
              description: engagementErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          },
        }
      );
      return;
    }

    create.mutate(
      {
        shortcut: draft.shortcut.trim(),
        name: draft.name.trim(),
        body: draft.body,
        isShared: draft.isShared,
      },
      {
        onSuccess: () => {
          const typed = draft.shortcut.trim();
          close();
          toast.add({
            title: 'Paragraph saved',
            description: `Type ;${typed} in a message and press space to drop it in.`,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that paragraph',
            description: engagementErrorMessage(
              error,
              'That shortcut may already be in use. Nothing was changed.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  const destroy = async (snippet: SalesSnippet): Promise<void> => {
    const ok = await confirm({
      title: `Delete "${snippet.name}"?`,
      description: `Anyone still typing ;${snippet.shortcut} will get nothing back. Messages already sent are untouched.`,
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(snippet.id, {
      onSuccess: () => {
        toast.add({ title: `${snippet.name} deleted`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete that',
          description: engagementErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Saved paragraph actions"
        status={
          <Text as="span" className="text-sm">
            {rows.length === 0
              ? 'No saved paragraphs yet'
              : rows.length === 1
                ? '1 saved paragraph'
                : `${String(rows.length)} saved paragraphs`}
          </Text>
        }
        primary={
          <Button color="module" size="sm" className="ml-auto shrink-0" onClick={startNew}>
            <Plus className="size-4" aria-hidden />
            New paragraph
          </Button>
        }
        controls={
          <>
            <TextQuote className="size-4 shrink-0" aria-hidden />
          </>
        }
        refresh={
          <RefreshButton
            isFetching={snippets.isFetching}
            updatedAt={snippets.dataUpdatedAt}
            onRefresh={() => void snippets.refetch()}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {rows.length === 0 ? (
            <ListEmptyState
              filtered={false}
              noResults={{ title: 'No paragraphs match' }}
              firstRun={{
                title: 'Stop retyping your own opening hours',
                description:
                  'Save a paragraph once — your hours, your returns policy, your usual lead time — give it a short name like hours, and anyone writing an email can type ;hours and press space to drop the whole thing in. Change the wording here and everybody is saying the new version from the next email onwards.',
                actions: (
                  <Button color="module" onClick={startNew}>
                    <Plus className="size-4" aria-hidden />
                    Save your first paragraph
                  </Button>
                ),
              }}
            />
          ) : (
            <Card className="p-0">
              <Table>
                <thead>
                  <tr>
                    {/* No wrap: the column is as narrow as its shortest badge,
                        so "Type this" broke across two lines and read as two
                        headings. */}
                    <th className="whitespace-nowrap">Type this</th>
                    <th>Paragraph</th>
                    <th className="hidden @lg:table-cell">Used</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((snippet) => (
                    <tr key={snippet.id}>
                      <td>
                        {/* The shortcut IS the thing you use, so it gets the
                            module hue and the leading `;` people actually
                            type — a bare word here would read as a category. */}
                        <Badge color="module" variant="soft" size="sm">
                          ;{snippet.shortcut}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Text as="span" className="font-medium">
                              {snippet.name}
                            </Text>
                            {snippet.isShared ? (
                              <Badge color="info" variant="soft" size="sm">
                                Whole team
                              </Badge>
                            ) : (
                              <Badge color="neutral" variant="soft" size="sm">
                                Just you
                              </Badge>
                            )}
                          </div>
                          <Text className="line-clamp-2 text-sm">{snippet.body}</Text>
                        </div>
                      </td>
                      <td className="hidden @lg:table-cell">
                        <Text as="span">
                          {snippet.useCount === 0 ? 'Never' : `${String(snippet.useCount)}×`}
                        </Text>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            color="module"
                            variant="ghost"
                            size="sm"
                            aria-label={`Change ${snippet.name}`}
                            title="Change it"
                            onClick={() => {
                              startEdit(snippet);
                            }}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            color="danger"
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${snippet.name}`}
                            title="Delete it"
                            onClick={() => void destroy(snippet)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>

      <PaneScope>
        <Dialog
          open={open}
          onOpenChange={(next: boolean) => {
            if (!next) close();
          }}
        >
          <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden">
            <DialogTitle>
              {editing ? `Change ${editing.name}` : 'A new saved paragraph'}
            </DialogTitle>
            <DialogDescription>
              Something you find yourself typing again and again. Anyone writing an email can drop
              it in with a few keystrokes.
            </DialogDescription>

            <form
              id="snippet-form"
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) submit();
              }}
            >
              {/* On an existing paragraph this is NOT A FIELD, so it is not
                  drawn as one. A disabled input still looks like somewhere to
                  type, and greys out the one word somebody opened this dialog
                  to check — the same badge the row wears says "this is what it
                  is" instead of "this is broken". */}
              {editing ? (
                <div className="flex flex-col gap-1">
                  <Text as="span" className="font-medium">
                    What people type to get it
                  </Text>
                  <div>
                    <Badge color="module" variant="soft" size="sm">
                      ;{editing.shortcut}
                    </Badge>
                  </div>
                  <Text className="text-sm">
                    Fixed once it is in use: this is what people type without thinking, so changing
                    it would break the habit while the old one quietly stopped working. Delete it
                    and make another if it is genuinely wrong.
                  </Text>
                </div>
              ) : (
                <Field>
                  <FieldLabel>What to type to get it</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        value={draft.shortcut}
                        placeholder="hours"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => {
                          set('shortcut', normaliseShortcut(event.target.value));
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    {`In a message you will type ;${draft.shortcut || 'hours'} and press space. Letters, numbers, - and _ only.`}
                  </FieldDescription>
                </Field>
              )}

              <Field>
                <FieldLabel>What to call it</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.name}
                      placeholder="Our opening hours"
                      onChange={(event) => {
                        set('name', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Only your team sees this — it is how you find the right one in this list later.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>The paragraph</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={5}
                      value={draft.body}
                      placeholder="We are open Monday to Friday, 7am to 5pm, and Saturday mornings until noon. The counter closes half an hour before the workshop does."
                      onChange={(event) => {
                        set('body', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Goes in exactly as written, so word it as a sentence in the middle of an email
                  rather than as a note to yourself.
                </FieldDescription>
              </Field>

              <Field>
                <div className="flex items-start gap-3">
                  <Switch
                    color="module"
                    aria-label="Let the whole team use this paragraph"
                    checked={draft.isShared}
                    onCheckedChange={(checked) => {
                      set('isShared', checked === true);
                    }}
                  />
                  <div className="flex flex-col gap-1">
                    <Text as="span" className="font-medium">
                      Let the whole team use it
                    </Text>
                    <Text className="text-sm">
                      On by default, because a saved paragraph is usually a fact about the business
                      — your hours, your terms — and everybody should be quoting the same one. Turn
                      it off for something only you would ever send.
                    </Text>
                  </div>
                </div>
              </Field>
            </form>

            <DialogFooter>
              <Button color="neutral" variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="snippet-form"
                color="module"
                size="sm"
                loading={editing ? update.isPending : create.isPending}
                disabled={!canSubmit}
              >
                {editing ? 'Save changes' : 'Save paragraph'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PaneScope>
    </div>
  );
}
