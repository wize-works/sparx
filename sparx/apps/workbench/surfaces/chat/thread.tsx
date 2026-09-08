'use client';

// One conversation — the messages, who you are talking to, and the moves you can
// make on it.
//
// A PANE opened BESIDE the inbox, never a modal. It is a durable thing you return
// to and deep-link, comparing two conversations side by side is useful, and above
// all opening it must not cost the operator their view of the queue — the whole
// reason it docks alongside rather than taking over.
//
// Opening it clears the staff-unread flag (mark-read on mount), so arriving here
// is what marks the conversation read for the row in the inbox and the count on
// it. Live-ish without a socket: the detail query polls, so a reply typed by the
// visitor — or by a teammate in another window — appears within seconds.
//
// Deliberately NOT EditorLayout: there is no form with a summary rail here. One
// column — a compact "who is this" card, the messages, and the composer pinned at
// the bottom — which is what a chat actually is.

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ChatTypingIndicator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Loading,
  Select,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  Ban,
  CheckCircle2,
  MessageSquare,
  MoreHorizontal,
  RotateCcw,
  Send,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useTeamRoster } from '../../lib/api/team';
import { useViewer, useSites } from '../../lib/api/shell-data';
import { describeAgo } from '../../lib/api/activity';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  chatErrorMessage,
  conversationName,
  formatMessageTime,
  formatMoney,
  senderLabel,
  sourceLabel,
  statusLabel,
  statusTone,
  useConversation,
  useCustomerContext,
  useMarkRead,
  useQuickReplies,
  useSendMessage,
  useUpdateConversation,
  type ChatMessage,
  type ConversationDetail,
} from './data';
import { emitTyping, useChatLive, useTypingIndicator } from './live';

/* ── The "who you're talking to" card ─────────────────────────────────────── */

function ContextCard({
  conversation,
  siteName,
}: {
  conversation: ConversationDetail;
  siteName: string | null;
}) {
  const context = useCustomerContext(conversation.id);
  const name = conversationName(conversation);
  const data = context.data;

  return (
    <section className="card bg-base-100 flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Text as="span" className="text-base font-semibold">
          {name}
        </Text>
        {data?.linked ? (
          <Badge color="module" variant="soft" size="sm">
            Customer
          </Badge>
        ) : (
          <Badge color="neutral" variant="outline" size="sm">
            Visitor
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
        {(data?.email ?? conversation.customerEmail) ? (
          <span className="break-all">{data?.email ?? conversation.customerEmail}</span>
        ) : null}
        {data?.phone ? <span>{data.phone}</span> : null}
        {data?.company ? <span>{data.company}</span> : null}
        <span>
          {sourceLabel(conversation.source)}
          {siteName ? ` · ${siteName}` : ''}
        </span>
      </div>

      {/* Only a linked customer has a spend history worth pulling up — an
          anonymous visitor's numbers would all be zero and say nothing. */}
      {data?.linked ? (
        <div className="border-base-300 flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-sm">
          <span>
            <span className="font-semibold tabular-nums">{data.orderCount}</span>{' '}
            {data.orderCount === 1 ? 'order' : 'orders'}
          </span>
          <span>
            <span className="font-semibold tabular-nums">{formatMoney(data.lifetimeValue)}</span>{' '}
            spent
          </span>
          {data.lastOrderAt ? <span>Last ordered {describeAgo(data.lastOrderAt)}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

/* ── One message ──────────────────────────────────────────────────────────── */

function MessageBubble({
  message,
  customerName,
}: {
  message: ChatMessage;
  customerName: string | null;
}) {
  const fromCustomer = message.senderType === 'customer';
  const isAi = message.senderType === 'ai' || message.aiGenerated;

  return (
    <li className={`flex flex-col ${fromCustomer ? 'items-start' : 'items-end'}`}>
      <div
        className={`flex max-w-[85%] flex-col gap-1 rounded-lg border px-3 py-2 ${
          fromCustomer ? 'border-base-300 bg-module bg-soft' : 'border-base-300 bg-base-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <Text as="span" className="text-sm font-semibold">
            {senderLabel(message, customerName)}
          </Text>
          {isAi ? (
            <Badge color="info" variant="soft" size="sm">
              <Sparkles className="size-3" aria-hidden />
              AI
            </Badge>
          ) : null}
          <Text as="span" className="text-xs whitespace-nowrap">
            {formatMessageTime(message.createdAt)}
          </Text>
        </div>
        <p className="text-base whitespace-pre-wrap">{message.body}</p>
      </div>
    </li>
  );
}

/* ── The reply composer ───────────────────────────────────────────────────── */

function Composer({ id, disabled }: { id: string; disabled: boolean }) {
  const toast = useToast();
  const send = useSendMessage(id);
  const quickReplies = useQuickReplies();
  const [body, setBody] = useState('');

  // The typed-but-unsent reply is real work — closing or tearing off the pane
  // with it in the box should ask first.
  useDirtySource(
    body.trim() !== '' && !send.isPending,
    "You've typed a reply but haven't sent it. Close anyway?"
  );

  const submit = () => {
    const text = body.trim();
    if (text === '' || send.isPending) return;
    send.mutate(text, {
      onSuccess: () => {
        setBody('');
      },
      onError: (error) => {
        // Deferred out of the mutation's commit — the same write invalidates the
        // thread this pane is showing, and a toast in that flush trips React.
        afterPaneChange(() => {
          toast.add({
            title: 'Could not send your reply',
            description: chatErrorMessage(error, 'Nothing was sent. Try again in a moment.'),
            type: 'error',
          });
        });
      },
    });
  };

  const insertQuickReply = (text: string) => {
    setBody((current) => (current.trim() === '' ? text : `${current.trimEnd()}\n\n${text}`));
  };

  return (
    <form
      className="border-base-300 bg-base-100 shrink-0 rounded-lg border p-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        value={body}
        rows={3}
        maxLength={8000}
        aria-label="Write a reply"
        placeholder={disabled ? 'This conversation is marked spam' : 'Write a reply…'}
        disabled={disabled}
        onChange={(event) => {
          setBody(event.target.value);
          // Let the visitor's widget show "Agent is typing" — throttled in live.ts.
          if (event.target.value.trim() !== '') emitTyping(id);
        }}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter is a new line — the chat convention.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button size="sm" variant="ghost" color="neutral" disabled={disabled}>
              <MessageSquare className="size-4" aria-hidden />
              Quick replies
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(quickReplies.data ?? []).length === 0 ? (
              <DropdownMenuItem disabled>
                No saved replies yet — add them in Chat settings
              </DropdownMenuItem>
            ) : (
              (quickReplies.data ?? []).map((reply) => (
                <DropdownMenuItem
                  key={reply.id}
                  onClick={() => {
                    insertQuickReply(reply.body);
                  }}
                >
                  <span className="font-medium">{reply.title}</span>
                  {reply.shortcut ? (
                    <span className="ml-auto font-mono text-xs">/{reply.shortcut}</span>
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Text as="span" className="hidden text-xs @md:inline">
          Enter to send · Shift+Enter for a new line
        </Text>

        <Button
          type="submit"
          color="module"
          size="sm"
          className="ml-auto"
          loading={send.isPending}
          disabled={disabled || body.trim() === ''}
        >
          <Send className="size-4" aria-hidden />
          Send
        </Button>
      </div>
    </form>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function ChatThreadSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const toast = useToast();
  const confirm = useConfirm();

  // Hold the socket open for this thread and join its room, so inbound messages,
  // status changes, and the visitor's typing arrive live rather than on a poll.
  useChatLive(id);
  const otherTyping = useTypingIndicator(id === '' ? undefined : id);

  const { data, isPending, isError, refetch } = useConversation(id);
  const { data: sites } = useSites();
  const { members } = useTeamRoster();
  const { data: viewer } = useViewer();
  const update = useUpdateConversation(id);
  const markRead = useMarkRead(id);

  const scrollRef = useRef<HTMLOListElement | null>(null);
  const markedRef = useRef(false);
  const lastCountRef = useRef(0);

  const { setTitle } = ctx;
  useEffect(() => {
    if (data) setTitle(conversationName(data));
  }, [data, setTitle]);

  // Clear the unread flag once, when the thread first loads with unread inbound
  // messages. A ref rather than a dependency so a poll that re-reports the same
  // count doesn't fire a second write.
  useEffect(() => {
    if (!data || markedRef.current) return;
    markedRef.current = true;
    if (data.unreadStaff > 0) markRead.mutate();
  }, [data, markRead]);

  // Keep the newest message in view as they arrive — but only when the count
  // actually grew, so a background poll doesn't yank a scrolled-up reader down.
  useEffect(() => {
    const count = data?.messages.length ?? 0;
    if (count > lastCountRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    lastCountRef.current = count;
  }, [data?.messages.length]);

  if (id === '') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert color="warning" className="max-w-md">
          <AlertContent>
            <AlertTitle>No conversation to show</AlertTitle>
            <AlertDescription>Open a conversation from the inbox to see it here.</AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

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
        <Alert color="error" className="max-w-md">
          <AlertContent>
            <AlertTitle>Could not load this conversation</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server. The conversation itself is unaffected.
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
      </div>
    );
  }

  const siteName = data.propertyId
    ? (sites?.find((site) => site.id === data.propertyId)?.name ?? null)
    : null;
  const isResolved = data.status === 'resolved';
  const isSpam = data.status === 'spam';

  const assignItems: Record<string, string> = { '': 'Unassigned' };
  for (const member of members) {
    assignItems[member.userId] = member.name ?? member.email;
  }
  // A saved assignee who has since left the team still needs a label, or the
  // Select shows a blank current value.
  if (data.assignedToId && !assignItems[data.assignedToId]) {
    assignItems[data.assignedToId] = 'A former teammate';
  }

  const onAssign = (next: string) => {
    update.mutate(
      { assignedToId: next === '' ? null : next },
      {
        onError: (error) => {
          afterPaneChange(() => {
            toast.add({
              title: 'Could not change who this is assigned to',
              description: chatErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  // The update invalidates the thread this pane is showing, so its refetch
  // re-renders here — the toast is deferred a macrotask out of that commit to
  // stay clear of React's flushSync guard.
  const setStatus = (status: 'open' | 'resolved' | 'spam', success: string, failure: string) => {
    update.mutate(
      { status },
      {
        onSuccess: () => {
          afterPaneChange(() => {
            toast.add({ title: success, type: 'success' });
          });
        },
        onError: (error) => {
          afterPaneChange(() => {
            toast.add({ title: failure, description: chatErrorMessage(error, ''), type: 'error' });
          });
        },
      }
    );
  };

  const onResolve = () => {
    setStatus('resolved', 'Marked as resolved', 'Could not resolve this conversation');
  };
  const onReopen = () => {
    setStatus('open', 'Reopened', 'Could not reopen this conversation');
  };

  const onMarkSpam = async () => {
    const ok = await confirm({
      title: 'Mark this conversation as spam?',
      description:
        'It moves out of your open queue into Spam, and its reply box is turned off. You can move it back later if it turns out to be genuine.',
      confirmLabel: 'Mark as spam',
      cancelLabel: 'Leave it',
      color: 'danger',
    });
    if (!ok) return;
    setStatus('spam', 'Moved to spam', 'Could not mark this as spam');
  };

  const onAssignToMe = () => {
    if (viewer?.userId) onAssign(viewer.userId);
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Conversation actions"
        controls={
          <>
            <Badge color={statusTone(data.status)} variant="soft" size="sm">
              {statusLabel(data.status)}
            </Badge>
            <div className="flex-1" />
            {isResolved ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={update.isPending}
                onClick={onReopen}
              >
                <RotateCcw className="size-4" aria-hidden />
                Reopen
              </Button>
            ) : isSpam ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={update.isPending}
                onClick={onReopen}
              >
                <RotateCcw className="size-4" aria-hidden />
                Not spam
              </Button>
            ) : (
              <Button size="sm" color="module" loading={update.isPending} onClick={onResolve}>
                <CheckCircle2 className="size-4" aria-hidden />
                Resolve
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  shape="square"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {viewer?.userId && data.assignedToId !== viewer.userId ? (
                  <DropdownMenuItem onClick={onAssignToMe}>
                    <UserCheck className="size-4" aria-hidden />
                    Assign to me
                  </DropdownMenuItem>
                ) : null}
                {!isSpam ? (
                  <DropdownMenuItem
                    onClick={() => {
                      void onMarkSpam();
                    }}
                  >
                    <Ban className="size-4" aria-hidden />
                    Mark as spam
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <ContextCard conversation={data} siteName={siteName} />

        {/* Assigning lives here, beside the identity, rather than crowding the
            action bar — it is a property of the conversation, not a lifecycle
            move you make and move on from. */}
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Text as="span" className="text-sm font-medium">
            Assigned to
          </Text>
          <div className="min-w-40">
            <Select
              size="sm"
              color="module"
              aria-label="Who is handling this conversation"
              value={data.assignedToId ?? ''}
              items={assignItems}
              onValueChange={(next) => {
                onAssign(next as string);
              }}
            />
          </div>
        </div>

        <ol ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-1">
          {data.messages.length === 0 ? (
            <li>
              <Text className="text-sm">
                No messages yet. Send the first one below to start the conversation.
              </Text>
            </li>
          ) : (
            data.messages.map((message) => (
              <MessageBubble key={message.id} message={message} customerName={data.customerName} />
            ))
          )}
          {otherTyping ? (
            <li>
              <ChatTypingIndicator side="start" name={`${conversationName(data)} is typing`} />
            </li>
          ) : null}
        </ol>

        <Composer id={id} disabled={isSpam} />
      </div>
    </div>
  );
}
