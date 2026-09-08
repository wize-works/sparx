'use client';

// One conversation with the sparx team.
//
// A surface, so it can sit beside the pane the conversation is about — which is
// the normal case: someone replies asking "which invoice?", and answering means
// looking at the invoice. In a dialog that question costs you the dialog.
//
// Opening this clears the unread flag server-side, so arriving here is what
// marks the reply read — for the row in the list AND for the notification bell.

import { useEffect, useState } from 'react';
import { Button, EmptyState, Loading, Textarea, useToast } from '@wizeworks/silicaui-react';
import { useQueryClient } from '@wizeworks/query';
import { MessageSquare } from 'lucide-react';
import { describeAgo } from '../../lib/api/activity';
import {
  MAX_FEEDBACK_BODY,
  useFeedbackThread,
  useReplyToFeedback,
  type FeedbackAuthorKind,
} from '../../lib/api/feedback';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { CATEGORY_ICON, FeedbackStatusBadge, deriveTitle } from '../../components/feedback/format';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';

/**
 * Read-only, deliberately: there is no `{id:'new'}` state here.
 *
 * The sites surface earns its create state because a site's create form IS its
 * manage form — one shape, two moments. Feedback is not that: you never re-edit
 * a subject or a category after sending, so the compose form exists exactly once
 * either way and there is nothing to keep in sync. Writing therefore stays a
 * dialog that disturbs no panes; this surface is only the conversation.
 */
export function FeedbackThreadSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = ctx.params.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');

  const { data, isPending, isError } = useFeedbackThread(id || null);
  const send = useReplyToFeedback(id);

  // The tab is born as "Feedback" and becomes the actual subject once it loads —
  // the registry can't know a record's name, only the surface's.
  const { setTitle } = ctx;
  useEffect(() => {
    if (data) setTitle(deriveTitle(data));
  }, [data, setTitle]);

  // Reading cleared `user_unread` server-side. Refresh the list and the bell so
  // nothing keeps advertising a reply that has just been read.
  useEffect(() => {
    if (!data) return;
    void queryClient.invalidateQueries({ queryKey: ['feedback', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['feedback', 'unread-count'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [data, queryClient]);

  const submitReply = () => {
    if (!reply.trim() || send.isPending) return;
    send.mutate(reply.trim(), {
      onSuccess: () => {
        setReply('');
        toast.add({ title: 'Reply sent.', type: 'success' });
      },
      onError: () => {
        toast.add({ title: 'Could not send your reply. Please try again.', type: 'error' });
      },
    });
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loading size="sm" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title="Could not load this conversation"
          description="Close this pane and open the message again from your feedback list."
        />
      </div>
    );
  }

  const Icon = CATEGORY_ICON[data.category];

  return (
    <div className={PANE_SHELL}>
      {/* Sized to the pane chrome, not to a document heading. The tab already
          carries this subject but truncates it, so the full text earns its place
          here — at the weight of a pane header, matching the list surface. */}
      <PaneToolbar
        label="Conversation header"
        controls={
          <>
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <h2 className="min-w-0 flex-1 text-base font-medium">{deriveTitle(data)}</h2>
            <FeedbackStatusBadge status={data.status} />
          </>
        }
      />

      <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <ThreadEntry author="You" when={describeAgo(data.createdAt)} body={data.body} />
        {data.messages.map((message) => (
          <ThreadEntry
            key={message.id}
            // The server stamps a user's own reply with their display name, so
            // rendering it raw labelled the same person "You" on the opening
            // message and "Dana Whitfield" three lines later. In your own
            // thread, you are always "You".
            author={message.authorKind === 'staff' ? message.authorName : 'You'}
            when={describeAgo(message.createdAt)}
            body={message.body}
            kind={message.authorKind}
          />
        ))}
      </ol>

      <form
        className="border-base-300 shrink-0 space-y-2 border-t p-4"
        onSubmit={(event) => {
          event.preventDefault();
          submitReply();
        }}
      >
        <Textarea
          value={reply}
          rows={2}
          maxLength={MAX_FEEDBACK_BODY}
          aria-label="Reply"
          placeholder="Add a reply…"
          onChange={(event) => {
            setReply(event.target.value);
          }}
        />
        <div className="flex justify-end">
          <Button type="submit" color="module" size="sm" disabled={!reply.trim() || send.isPending}>
            {send.isPending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * One message. A staff reply sits on a raised surface so the two voices are
 * distinguishable at a glance — an edge and a tone shift rather than colored
 * chat bubbles; this is correspondence, not a messaging app.
 */
function ThreadEntry({
  author,
  when,
  body,
  kind = 'user',
}: {
  author: string;
  when: string;
  body: string;
  kind?: FeedbackAuthorKind;
}) {
  const isStaff = kind === 'staff';
  return (
    <li
      className={`border-base-300 rounded-md border px-3 py-2 ${
        isStaff ? 'bg-base-200' : 'bg-base-100'
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-medium">{isStaff ? `${author} · sparx` : author}</span>
        <span className="shrink-0 text-sm">{when}</span>
      </div>
      <p className="whitespace-pre-wrap">{body}</p>
    </li>
  );
}
