'use client';

// The submissions inbox — what people typed into the forms on your site.
//
// A table, because submissions are genuinely tabular: every row has the same
// facts (who sent it, which form, when, whether it's been dealt with) and people
// scan DOWN a column — "what's still New", "what came through the contact form".
// This is the INBOX, not the form designer; form design lives in the visual
// editor.
//
// The inbox is TENANT-WIDE (across every site), so a row names the site it came
// from. Paging is a keyset CURSOR, not offset: new submissions arrive at the top
// while an operator reads, and offset paging would re-show rows already passed
// (see form-submissions-data.ts, and the activity feed for the same reasoning).

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
  Filter,
  FilterItem,
  NativeSelect,
  Table,
} from '@wizeworks/silicaui-react';
import { Inbox } from 'lucide-react';
import { ListPagination, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useSites } from '../../lib/api/shell-data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  formLabel,
  formatDate,
  submissionState,
  submitterLabel,
  useSubmissions,
  type FormSubmission,
  type SubmissionStatus,
} from './form-submissions-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** The chips ARE the questions people open this inbox to answer. */
const STATUS_FILTERS = [
  { value: 'all', label: 'All', status: undefined },
  { value: 'new', label: 'New', status: 'new' },
  { value: 'read', label: 'Read', status: 'read' },
  { value: 'archived', label: 'Handled', status: 'archived' },
  { value: 'spam', label: 'Spam', status: 'spam' },
] as const satisfies readonly {
  value: string;
  label: string;
  status: SubmissionStatus | undefined;
}[];

type StatusFilterValue = (typeof STATUS_FILTERS)[number]['value'];

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A one-line preview of what they actually wrote, for the table. */
function previewOf(submission: FormSubmission): string {
  if (submission.message && submission.message.trim() !== '') return submission.message.trim();
  for (const value of Object.values(submission.fields)) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

function emptyAdvice(statusLabel: string | null, formName: string | null): string {
  const parts: string[] = [];
  if (statusLabel) {
    parts.push(`You are only seeing “${statusLabel}” — switch to All to see the rest.`);
  }
  if (formName) {
    parts.push(`Only submissions from “${formName}” are showing — choose All forms to widen it.`);
  }
  return parts.join(' ');
}

export function FormSubmissionsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [formNodeId, setFormNodeId] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  // One cursor per step back through the inbox. Empty = the newest window.
  // A stack, so "Newer" is a pop — stepping back needs the boundary of the
  // previous window, which only the stack remembers.
  const [cursors, setCursors] = useState<string[]>([]);

  const activeStatus =
    STATUS_FILTERS.find((entry) => entry.value === statusFilter) ?? STATUS_FILTERS[0];
  const cursor = cursors[cursors.length - 1];

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useSubmissions({
    ...(activeStatus.status ? { status: activeStatus.status } : {}),
    ...(formNodeId ? { formNodeId } : {}),
    ...(cursor ? { cursor } : {}),
    limit: pageSize,
  });

  const { data: sites } = useSites();
  const siteName = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites ?? []) map.set(site.id, site.name);
    return map;
  }, [sites]);

  const rows = data?.submissions ?? [];
  const forms = data?.forms ?? [];
  // A full window means there is (probably) another one behind it — the same
  // "the window came back full" signal the activity feed walks on.
  const hasMore = rows.length === pageSize;
  const firstRow = cursors.length * pageSize + 1;
  const narrowed = statusFilter !== 'all' || formNodeId !== '';
  const staleAfterFailure = Boolean(error) && rows.length > 0;

  const resetWindow = () => {
    setCursors([]);
  };

  const open = (submission: FormSubmission, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('builder.submission', { id: submission.id }, { target: targetFor(event) });
  };

  const activeFormName = formNodeId
    ? (forms.find((form) => form.formNodeId === formNodeId)?.formName ?? 'this form')
    : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Submissions inbox controls"
        controls={
          <>
            <Filter
              color="module"
              value={statusFilter}
              onValueChange={(next) => {
                setStatusFilter((next as StatusFilterValue | null) ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((entry) => (
                <FilterItem key={entry.value} value={entry.value}>
                  {entry.label}
                </FilterItem>
              ))}
            </Filter>
            {/* Only worth showing once more than one form has ever been submitted —
            with a single form the picker chooses nothing. */}
            {forms.length > 1 ? (
              <label className="hidden items-center @xl:flex">
                <span className="sr-only">Which form</span>
                <NativeSelect
                  size="sm"
                  color="module"
                  value={formNodeId}
                  aria-label="Which form"
                  onChange={(event) => {
                    setFormNodeId(event.target.value);
                    resetWindow();
                  }}
                >
                  <option value="">All forms</option>
                  {forms.map((form) => (
                    <option key={form.formNodeId} value={form.formNodeId}>
                      {(form.formName ?? 'Untitled form') + ` (${String(form.count)})`}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {staleAfterFailure ? (
          <Alert color="warning" className="m-2">
            <AlertContent>
              <AlertTitle>Could not check for new submissions just now</AlertTitle>
              <AlertDescription>
                This is a problem reaching the server. What you see below is what loaded last, and
                may be out of date.
              </AlertDescription>
            </AlertContent>
            <Button
              size="sm"
              color="warning"
              variant="soft"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          </Alert>
        ) : null}

        {error && !staleAfterFailure ? (
          // A failed load REPLACES the table — "nothing submitted yet" over a
          // connection failure is a lie about their enquiries, the worst one to tell.
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title="Could not load your submissions"
            description="This is a problem reaching the server. Nothing anyone sent has been lost — none of it is affected."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title={narrowed ? 'Nothing matches that' : 'No submissions yet'}
            description={
              narrowed
                ? emptyAdvice(statusFilter === 'all' ? null : activeStatus.label, activeFormName)
                : 'When someone fills in a form on your site — a contact request, an enquiry, a sign-up — it lands here. Add a form to a page in the editor and its submissions will show up in this inbox.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>From</th>
                <th className="hidden @lg:table-cell">Form</th>
                <th className="hidden @3xl:table-cell">Site</th>
                <th className="hidden @2xl:table-cell">What they sent</th>
                <th className="hidden @xl:table-cell">Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((submission) => {
                const state = submissionState(submission.status);
                const site = submission.propertyId
                  ? (siteName.get(submission.propertyId) ?? '—')
                  : '—';
                const preview = previewOf(submission);
                const isNew = submission.status === 'new';
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
                      <span
                        className={`block max-w-56 truncate ${isNew ? 'font-semibold' : 'font-medium'}`}
                      >
                        {submitterLabel(submission)}
                      </span>
                      {/* Only when the primary line is a NAME — otherwise the label
                          already IS the email, and repeating it is noise. */}
                      {submission.name && submission.email ? (
                        <span className="block max-w-56 truncate text-sm">{submission.email}</span>
                      ) : null}
                    </td>
                    <td className="hidden max-w-40 truncate @lg:table-cell">
                      {formLabel(submission)}
                    </td>
                    <td className="hidden max-w-32 truncate @3xl:table-cell">{site}</td>
                    <td className="hidden max-w-72 @2xl:table-cell">
                      <span className="block truncate">{preview || '—'}</span>
                    </td>
                    <td className="hidden text-sm whitespace-nowrap @xl:table-cell">
                      {formatDate(submission.createdAt)}
                    </td>
                    <td>
                      <Badge color={state.tone} variant="soft" size="sm">
                        {state.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : firstRow}
          page={cursors.length + 1}
          pageSize={pageSize}
          busy={isFetching}
          hasMore={hasMore}
          onOlder={() => {
            const last = rows[rows.length - 1];
            if (last) setCursors((current) => [...current, last.id]);
          }}
          {...(cursors.length > 0
            ? {
                onNewer: () => {
                  setCursors((current) => current.slice(0, -1));
                },
              }
            : {})}
          onPageSizeChange={(size) => {
            // Window boundaries move with the size, so every stored cursor is
            // meaningless — return to the newest window rather than resuming at a
            // boundary that no longer lines up with anything.
            setPageSize(size);
            setCursors([]);
          }}
        />
        <RowOpenHint />
      </div>
    </div>
  );
}
