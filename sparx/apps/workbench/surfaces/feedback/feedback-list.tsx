'use client';

// Everything you've told the sparx team, and where it got to.
//
// A SURFACE rather than a modal tab, which is the whole point: the reply you're
// reading is usually about a pane you still have open, and a dialog would cover
// the very thing under discussion. As a surface it opens beside that pane
// (⇧-click), tears off to a second monitor, survives in a saved layout, and can
// be starred — none of which an overlay can do.

import { Button, EmptyState, Table } from '@wizeworks/silicaui-react';
import { MessageSquarePlus } from 'lucide-react';
import { describeAgo } from '../../lib/api/activity';
import { useMyFeedback, type FeedbackSubmission } from '../../lib/api/feedback';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { CATEGORY_ICON, FeedbackStatusBadge, deriveTitle } from '../../components/feedback/format';
import { useFeedback } from '../../components/feedback/provider';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RowOpenHint } from '../../components/row-open-hint';
import { PaneLoadError } from '../../components/pane-load-error';

/** Same modifier contract as the launcher and every other list. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function FeedbackListSurface({ ctx }: { ctx: SurfaceContext }) {
  const feedback = useFeedback();
  const { data, isPending, isError, refetch } = useMyFeedback();

  const open = (submission: FeedbackSubmission, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('platform.feedback.thread', { id: submission.id }, { target: targetFor(event) });
  };

  if (isError) {
    return (
      <PaneLoadError
        icon={<MessageSquarePlus className="size-6" aria-hidden />}
        title="Could not load your feedback"
        description="This is a problem reaching the server, not a problem with anything you sent. Nothing was lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const rows = data?.items ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Feedback list controls"
        status={
          <p className="shrink-0 text-sm whitespace-nowrap">
            {rows.length === 1 ? '1 message' : `${String(rows.length)} messages`}
            {data && data.unreadCount > 0 ? ` · ${String(data.unreadCount)} with a new reply` : ''}
          </p>
        }
        primary={
          <Button
            color="module"
            size="sm"
            onClick={() => {
              feedback.openSend({ source: 'button' });
            }}
          >
            <MessageSquarePlus className="size-4" aria-hidden />
            Send feedback
          </Button>
        }
        controls={
          <>
            <div className="flex-1" />
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isPending ? (
          <p className="text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<MessageSquarePlus className="size-6" aria-hidden />}
            title="You haven’t sent anything yet"
            description="Tell us what’s broken, what’s missing, or what you wish worked differently. A real person reads every message, and replies land right here."
            actions={
              <Button
                color="module"
                size="sm"
                onClick={() => {
                  feedback.openSend({ source: 'button' });
                }}
              >
                Send your first message
              </Button>
            }
          />
        ) : (
          <div className="card bg-base-100 overflow-hidden">
            <Table size="sm" hover>
              <thead>
                <tr>
                  <th>Message</th>
                  <th>Sent</th>
                  <th>Replies</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((submission) => {
                  const Icon = CATEGORY_ICON[submission.category];
                  const replies = submission.messageCount ?? 0;
                  return (
                    <tr
                      key={submission.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      role="button"
                      onClick={(event) => {
                        open(submission, event);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        open(submission, event);
                      }}
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 shrink-0" aria-hidden />
                          <span className="min-w-0 truncate font-medium">
                            {deriveTitle(submission)}
                          </span>
                          {/* The only mark on the row, because it is the only
                              thing here addressed TO the reader. */}
                          {submission.userUnread ? (
                            <span
                              className="bg-primary size-2 shrink-0 rounded-full"
                              role="img"
                              aria-label="New reply"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="text-sm whitespace-nowrap">
                        {describeAgo(submission.createdAt)}
                      </td>
                      <td className="text-sm whitespace-nowrap">{replies === 0 ? '—' : replies}</td>
                      <td className="text-right">
                        <FeedbackStatusBadge status={submission.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      <RowOpenHint what="a message to read the conversation" />
    </div>
  );
}
