'use client';

// Email templates — the messages a business writes once and sends a hundred
// times (docs/144 §5.4).
//
// THIS EXISTED ENTIRELY IN THE DATABASE. `/v1/crm/sales-templates` has carried
// create, change, put-away and a performance report since phase 3, the composer
// has always offered a "start from something you have written before" picker,
// and there was no screen anywhere that could write one — so the picker was
// permanently empty, and the counters behind the performance report could never
// move because nothing could ever be sent from a template.
//
// THE REPLY RATE IS THE REASON THIS IS NOT A TEXT EXPANDER. Saving typing is
// worth something; noticing that one follow-up gets answered a quarter of the
// time and another gets answered never is worth far more, because it tells a
// business which of its own words to stop using. That column is the one thing
// on this screen that changes what somebody does, so it is the one thing that
// wears a color.
//
// RATES ARE WITHHELD UNTIL A TEMPLATE HAS BEEN SENT ENOUGH TIMES, and the row
// says so in words rather than showing a dash. One send and one reply is not a
// 100% reply rate, and a business that standardised on that template would be
// standardising on a coincidence. The floor is the server's judgement, not
// ours — see `useTemplatePerformance`.
//
// PUT AWAY, NOT DELETED — and it comes back. The counters are the only record
// of what a business learned about its own messaging, so archiving keeps them;
// and because archiving is one press that hides a template from every picker in
// the company, the restore path exists too. Without it a mis-click costs the
// message itself, since retyping it under a new name orphans the history.

import { useEffect, useMemo, useState } from 'react';
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
  Heading,
  Input,
  Switch,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { FileText, Pencil, Plus, Undo2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  engagementErrorMessage,
  formatRate,
  replyRateTone,
  useSalesTemplateMutations,
  useSalesTemplates,
  useTemplatePerformance,
  type SalesTemplate,
} from './engagement-data';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';

interface Draft {
  name: string;
  folder: string;
  subject: string;
  body: string;
  isShared: boolean;
}

const BLANK: Draft = { name: '', folder: '', subject: '', body: '', isShared: false };

export function TemplatesListSurface({ ctx }: { ctx: SurfaceContext }) {
  // Archived ones are asked for deliberately: this is the screen that OWNS
  // them, so hiding what was put away here would leave it nowhere at all.
  const templates = useSalesTemplates({ includeArchived: true });
  const performance = useTemplatePerformance();
  const { create, update, archive, restore } = useSalesTemplateMutations();
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    ctx.setTitle('Email templates');
  }, [ctx]);

  const [open, setOpen] = useState(false);
  /** The template being changed, or null while the dialog writes a new one. */
  const [editing, setEditing] = useState<SalesTemplate | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  // A written email is real work, and a dialog is invisible to the workbench's
  // unsaved-work guard — so the PANE registers on its behalf, exactly as the
  // composer does. Without this, closing the tab with a half-written template
  // open loses it silently.
  //
  // Against the SAVED template, not against blank. Opening one to re-read it
  // filled the draft with its own contents, which marked the pane dirty and put
  // "1 unsaved change" in the status bar for somebody who had changed nothing —
  // and a guard that cries wolf is one people learn to click through.
  useDirtySource(
    open &&
      (editing
        ? draft.name !== editing.name ||
          draft.folder !== (editing.folder ?? '') ||
          draft.subject !== editing.subject ||
          draft.body !== editing.bodyHtml ||
          draft.isShared !== editing.isShared
        : draft.subject.trim() !== '' || draft.body.trim() !== ''),
    'You have a template written here that has not been saved. Close anyway?'
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

  const startEdit = (template: SalesTemplate): void => {
    setEditing(template);
    setDraft({
      name: template.name,
      folder: template.folder ?? '',
      subject: template.subject,
      body: template.bodyHtml,
      isShared: template.isShared,
    });
    setOpen(true);
  };

  /** How each template is doing, by id — the rates are the server's, floor and
   *  all, so nothing here recomputes them from the counts beside them. */
  const rates = useMemo(
    () => new Map((performance.data?.items ?? []).map((row) => [row.id, row])),
    [performance.data]
  );

  const rows = templates.data?.items ?? [];
  const live = rows.filter((row) => row.archivedAt === null);
  const putAway = rows.filter((row) => row.archivedAt !== null);

  const canSubmit =
    draft.name.trim() !== '' && draft.subject.trim() !== '' && draft.body.trim() !== '';

  const submit = (): void => {
    const fields = {
      name: draft.name.trim(),
      folder: draft.folder.trim() === '' ? null : draft.folder.trim(),
      subject: draft.subject.trim(),
      bodyHtml: draft.body,
      isShared: draft.isShared,
    };

    if (editing) {
      update.mutate(
        { id: editing.id, patch: fields },
        {
          onSuccess: () => {
            close();
            toast.add({ title: 'Template saved', type: 'success' });
          },
          onError: (error) => {
            toast.add({
              title: 'Could not save that template',
              description: engagementErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          },
        }
      );
      return;
    }

    create.mutate(fields, {
      onSuccess: () => {
        close();
        toast.add({
          title: 'Template written',
          description: 'It is in the picker the next time anyone emails a customer.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save that template',
          description: engagementErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const putItAway = async (template: SalesTemplate): Promise<void> => {
    const ok = await confirm({
      title: `Put "${template.name}" away?`,
      description:
        template.sendCount > 0
          ? `It disappears from everyone's picker. What it has already done — ${String(template.sendCount)} sent, ${String(template.replyCount)} answered — is kept, and you can bring it back at any time.`
          : 'It disappears from everyone’s picker. You can bring it back at any time.',
      confirmLabel: 'Put it away',
      cancelLabel: 'Keep using it',
      color: 'danger',
    });
    if (!ok) return;
    archive.mutate(template.id, {
      onSuccess: () => {
        toast.add({ title: `${template.name} put away`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not put that away',
          description: engagementErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Email template actions"
        status={
          <Text as="span" className="text-sm">
            {/* "No templates YET" is only true the first time. Once something has
          been put away it is a lie sitting directly above the thing it
          says does not exist. */}
            {live.length === 0
              ? putAway.length === 0
                ? 'No templates yet'
                : 'None in use'
              : live.length === 1
                ? '1 template'
                : `${String(live.length)} templates`}
          </Text>
        }
        primary={
          <Button color="module" size="sm" className="ml-auto shrink-0" onClick={startNew}>
            <Plus className="size-4" aria-hidden />
            New template
          </Button>
        }
        controls={
          <>
            <FileText className="size-4 shrink-0" aria-hidden />
          </>
        }
        refresh={
          <RefreshButton
            isFetching={templates.isFetching}
            updatedAt={templates.dataUpdatedAt}
            onRefresh={() => {
              void templates.refetch();
              void performance.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {rows.length === 0 ? (
            <ListEmptyState
              filtered={false}
              noResults={{ title: 'No templates match' }}
              firstRun={{
                title: 'Write the email you keep retyping',
                description:
                  'A template is a subject and a message your team can pick when they email a customer, so the fourth follow-up this week reads exactly like the first three. sparx then counts how many were sent, opened and answered — which is how you find out which of your own words work.',
                actions: (
                  <Button color="module" onClick={startNew}>
                    <Plus className="size-4" aria-hidden />
                    Write your first template
                  </Button>
                ),
              }}
            />
          ) : null}

          {live.length > 0 ? (
            <Card className="p-0">
              <Table>
                <thead>
                  <tr>
                    <th>Template</th>
                    <th className="hidden @2xl:table-cell">Subject</th>
                    <th className="hidden @lg:table-cell">Sent</th>
                    <th>Answered</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {live.map((template) => {
                    const rate = rates.get(template.id);
                    const replyRate = formatRate(rate?.replyRate ?? null);
                    return (
                      <tr key={template.id}>
                        <td>
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Text as="span" className="font-medium">
                                {template.name}
                              </Text>
                              {/* Who can use it is a fact ABOUT the template, and
                                  the two states are genuinely different things —
                                  so they are different colors rather than one
                                  badge that appears and disappears. */}
                              {template.isShared ? (
                                <Badge color="info" variant="soft" size="sm">
                                  Whole team
                                </Badge>
                              ) : (
                                <Badge color="neutral" variant="soft" size="sm">
                                  Just you
                                </Badge>
                              )}
                              {template.folder ? (
                                <Badge color="module" variant="outline" size="sm">
                                  {template.folder}
                                </Badge>
                              ) : null}
                            </div>
                            <Text className="text-sm @2xl:hidden">{template.subject}</Text>
                          </div>
                        </td>
                        <td className="hidden @2xl:table-cell">
                          <Text as="span" className="text-sm">
                            {template.subject}
                          </Text>
                        </td>
                        <td className="hidden @lg:table-cell">
                          <Text as="span">{template.sendCount}</Text>
                        </td>
                        <td>
                          {replyRate ? (
                            <Badge
                              color={replyRateTone(rate?.replyRate ?? null)}
                              variant="soft"
                              size="sm"
                            >
                              {replyRate} answered
                            </Badge>
                          ) : (
                            // Not a dash. A dash reads as "we have no idea",
                            // when the truth is specific and useful: it has not
                            // been used enough for the number to mean anything.
                            <Text as="span" className="text-sm">
                              {template.sendCount === 0 ? 'Not used yet' : 'Too soon to tell'}
                            </Text>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              color="module"
                              variant="ghost"
                              size="sm"
                              aria-label={`Change ${template.name}`}
                              title="Change it"
                              onClick={() => {
                                startEdit(template);
                              }}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              color="danger"
                              variant="ghost"
                              size="sm"
                              onClick={() => void putItAway(template)}
                            >
                              <Text as="span" className="text-sm">
                                Put away
                              </Text>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          ) : null}

          {putAway.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Heading level={2} className="text-base">
                Put away
              </Heading>
              <Text className="text-sm">
                Out of everyone&rsquo;s picker, with everything they did still counted. Bring one
                back and it is available again immediately.
              </Text>
              <Card className="p-0">
                <Table>
                  <tbody>
                    {putAway.map((template) => (
                      <tr key={template.id}>
                        <td>
                          <Text as="span" className="font-medium">
                            {template.name}
                          </Text>
                        </td>
                        <td className="hidden @md:table-cell">
                          <Text as="span" className="text-sm">
                            {template.sendCount === 0
                              ? 'Never sent'
                              : `Sent ${String(template.sendCount)}×, answered ${String(template.replyCount)}×`}
                          </Text>
                        </td>
                        <td>
                          <div className="flex items-center justify-end">
                            <Button
                              color="module"
                              variant="soft"
                              size="sm"
                              loading={restore.isPending}
                              onClick={() => {
                                restore.mutate(template.id, {
                                  onSuccess: () => {
                                    toast.add({
                                      title: `${template.name} is back`,
                                      type: 'success',
                                    });
                                  },
                                  onError: (error) => {
                                    toast.add({
                                      title: 'Could not bring that back',
                                      description: engagementErrorMessage(
                                        error,
                                        'Nothing was changed.'
                                      ),
                                      type: 'error',
                                    });
                                  },
                                });
                              }}
                            >
                              <Undo2 className="size-4" aria-hidden />
                              Bring it back
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      {/* Portalled into THIS pane so the dialog belongs to the document that
          opened it — outside PaneScope it would render in the original window
          after a tear-off, and every module-colored control in it would fall
          back to the brand primary. */}
      <PaneScope>
        <Dialog
          open={open}
          onOpenChange={(next: boolean) => {
            if (!next) close();
          }}
        >
          {/* `@container` is load-bearing, not decoration. A PaneScope'd dialog
              portals to the PANE HOST — which sits outside the `@container` on
              PANE_SHELL — so every `@md:`/`@lg:` inside a dialog matches
              nothing and silently collapses to the one-column fallback. Naming
              the dialog itself as a container is also the honest scope: what a
              form in here has to fit is the dialog's width, not the pane's. */}
          <DialogContent className="@container flex max-h-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden">
            <DialogTitle>{editing ? `Change ${editing.name}` : 'A new email template'}</DialogTitle>
            <DialogDescription>
              Write it the way you would write it to a real customer. Whoever picks it in a
              conversation can still change every word before it goes.
            </DialogDescription>

            <form
              id="template-form"
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) submit();
              }}
            >
              <div className="grid gap-4 @md:grid-cols-2">
                <Field>
                  <FieldLabel>What you will call it</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        value={draft.name}
                        placeholder="Second follow-up after a quote"
                        onChange={(event) => {
                          set('name', event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    Only your team sees this — it is what they pick from a list, so say when to use
                    it.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Group it under</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        value={draft.folder}
                        placeholder="Follow-ups"
                        onChange={(event) => {
                          set('folder', event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    Optional. One word that keeps similar templates together once you have a few.
                  </FieldDescription>
                </Field>
              </div>

              <Field>
                <FieldLabel>Subject</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.subject}
                      placeholder="Following up on your quote"
                      onChange={(event) => {
                        set('subject', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  The line that decides whether it gets opened at all — it is counted separately
                  from replies for exactly that reason.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Message</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={10}
                      value={draft.body}
                      placeholder={
                        'Hi — just checking whether you had a chance to look at the numbers we sent over.\n\nHappy to walk through any of it, or to adjust the quantities if that helps.'
                      }
                      onChange={(event) => {
                        set('body', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Leave out the greeting name if you want to type it each time — nothing here is
                  filled in automatically.
                </FieldDescription>
              </Field>

              <Field>
                <div className="flex items-start gap-3">
                  <Switch
                    color="module"
                    aria-label="Let the whole team use this template"
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
                      Off, it stays in your own picker — which is what you want while you are still
                      deciding whether it works. Turn it on and everyone gets it, and its
                      send/answer counts start describing the whole business rather than just you.
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
                form="template-form"
                color="module"
                size="sm"
                loading={editing ? update.isPending : create.isPending}
                disabled={!canSubmit}
              >
                {editing ? 'Save changes' : 'Save template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PaneScope>
    </div>
  );
}
