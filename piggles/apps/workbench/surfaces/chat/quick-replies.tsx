'use client';

// Quick replies — the saved answers your team can send with one click from a
// conversation.
//
// Authoring and managing them is ONE pane, not a list plus a create modal: there
// is no per-reply detail surface to return to, and keeping the compose form in
// the pane means a half-written reply is tracked as unsaved work like everything
// else here — abandon the pane with text in the box and it asks first. (A modal
// would be invisible to that safety net.)
//
// A reply can belong to THIS site or to every site you run (docs/131 §3.7): a
// note about fresh-baked donuts has no place in a machine-shop thread, but plenty
// of replies ("thanks, one moment") are genuinely generic. This site is the
// default, so business-specific copy stays with its business unless you say
// otherwise.

import { useEffect, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Select,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { faMessageLines, faPlus, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  chatErrorMessage,
  useCreateQuickReply,
  useDeleteQuickReply,
  useQuickReplies,
  type QuickReply,
} from './data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

type Scope = 'site' | 'all';

function QuickReplyRow({
  reply,
  onDelete,
  deleting,
}: {
  reply: QuickReply;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="border-base-300 flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <Text as="span" className="font-medium">
            {reply.title}
          </Text>
          {reply.shortcut ? (
            <Badge color="module" variant="soft" size="sm">
              /{reply.shortcut}
            </Badge>
          ) : null}
        </div>
        <Text className="text-sm whitespace-pre-wrap">{reply.body}</Text>
      </div>
      <Button
        size="sm"
        variant="ghost"
        color="danger"
        shape="square"
        aria-label={`Delete “${reply.title}”`}
        title={`Delete “${reply.title}”`}
        loading={deleting}
        onClick={onDelete}
      >
        <Icon glyph={faTrashCan} className="size-4" aria-hidden />
      </Button>
    </li>
  );
}

export function ChatQuickRepliesSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useQuickReplies();
  const create = useCreateQuickReply();
  const remove = useDeleteQuickReply();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [scope, setScope] = useState<Scope>('site');

  useEffect(() => {
    ctx.setTitle('Quick replies');
  }, [ctx]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canAdd = title.trim() !== '' && body.trim() !== '';
  const draftStarted = title.trim() !== '' || body.trim() !== '' || shortcut.trim() !== '';

  useDirtySource(
    draftStarted && !create.isPending,
    "You've started a quick reply but haven't added it yet. Close anyway?"
  );

  const resetForm = () => {
    setTitle('');
    setBody('');
    setShortcut('');
    setScope('site');
  };

  const add = () => {
    if (!canAdd || create.isPending) return;
    create.mutate(
      {
        title: title.trim(),
        body: body.trim(),
        ...(shortcut.trim() !== '' ? { shortcut: shortcut.trim() } : {}),
        // Omitted = this site (the route stamps it); explicit null = every site.
        ...(scope === 'all' ? { propertyId: null } : {}),
      },
      {
        onSuccess: () => {
          // Both the reset AND the toast run one macrotask later, not in the
          // mutation's own onSuccess. onSuccess fires in the query client's
          // microtask (not a React event), so resetting the scope Select there
          // re-renders it mid-flush and its layout effect trips React's flushSync
          // guard — the same reason a post-commit toast has to be deferred. By
          // the macrotask the invalidation re-render has settled and React is
          // idle, so the Select and the toast both commit cleanly.
          afterPaneChange(() => {
            resetForm();
            toast.add({ title: 'Quick reply added', type: 'success' });
          });
        },
        onError: (error) => {
          afterPaneChange(() => {
            toast.add({
              title: 'Could not add that quick reply',
              description: chatErrorMessage(error, 'Nothing was saved. Try again.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  const onDelete = async (reply: QuickReply) => {
    const ok = await confirm({
      title: `Delete “${reply.title}”?`,
      description:
        'Your team will no longer be able to send this saved reply. This cannot be undone.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    setDeletingId(reply.id);
    remove.mutate(reply.id, {
      onSuccess: () => {
        setDeletingId(null);
        afterPaneChange(() => {
          toast.add({ title: `“${reply.title}” deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        setDeletingId(null);
        afterPaneChange(() => {
          toast.add({
            title: 'Could not delete that quick reply',
            description: chatErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        });
      },
    });
  };

  const replies = data ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Quick replies actions"
        status={
          <Text as="span" className="text-sm font-medium">
            Quick replies
          </Text>
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
        <div className={COLUMN}>
          <Text>
            Save the answers you send again and again, then drop one into a conversation with a
            single click.
          </Text>

          <FormSection title="Add a quick reply">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={title}
                    maxLength={100}
                    placeholder="e.g. Shipping times"
                    onChange={(event) => {
                      setTitle(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                What you will recognize it by in the list — the visitor never sees this.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Message</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    value={body}
                    rows={3}
                    maxLength={8000}
                    placeholder="The reply your team sends…"
                    onChange={(event) => {
                      setBody(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>This is the text that gets sent to the visitor.</FieldDescription>
            </Field>

            <div className="grid gap-4 @md:grid-cols-2">
              <Field>
                <FieldLabel>Shortcut (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={shortcut}
                      maxLength={50}
                      placeholder="shipping"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setShortcut(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>A short word to find it faster.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Where it is offered</FieldLabel>
                <Select
                  color="module"
                  aria-label="Which sites this reply is offered on"
                  value={scope}
                  items={{ site: 'This site only', all: 'All my sites' }}
                  onValueChange={(next) => {
                    setScope(next as Scope);
                  }}
                />
                <FieldDescription>
                  Keep business-specific wording to this site; use “All my sites” for generic
                  replies.
                </FieldDescription>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button
                color="module"
                size="sm"
                loading={create.isPending}
                disabled={!canAdd}
                onClick={add}
              >
                <Icon glyph={faPlus} className="size-4" aria-hidden />
                Add quick reply
              </Button>
            </div>
          </FormSection>

          <Card className="overflow-hidden">
            <header className="border-base-300 flex items-center gap-2 border-b px-4 py-3">
              <Heading level={2} className="text-base font-semibold">
                Your saved replies
              </Heading>
              <div className="flex-1" />
              <Text className="text-sm">
                {replies.length === 1 ? '1 reply' : `${String(replies.length)} replies`}
              </Text>
            </header>
            {isError ? (
              <div className="p-4">
                <Text className="text-sm">
                  Could not load your saved replies. This is a problem reaching the server — try
                  refreshing.
                </Text>
              </div>
            ) : isPending ? (
              <PaneWaiting />
            ) : replies.length === 0 ? (
              <EmptyState
                icon={<Icon glyph={faMessageLines} className="size-6" aria-hidden />}
                title="No quick replies yet"
                description="Add your first one above — the answers you send most often are the ones worth saving."
              />
            ) : (
              <ul>
                {replies.map((reply) => (
                  <QuickReplyRow
                    key={reply.id}
                    reply={reply}
                    deleting={deletingId === reply.id}
                    onDelete={() => {
                      void onDelete(reply);
                    }}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
