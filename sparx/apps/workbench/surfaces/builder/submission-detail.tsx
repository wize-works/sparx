'use client';

// One submission — the whole of what a person typed into a form on your site.
//
// A READ-ONLY transaction record, not an editable entity: nobody edits what a
// visitor sent, so this keeps an identity heading (who sent it, which form, when)
// rather than opening on a rename field. Its body is SCHEMA-DRIVEN and arbitrary
// — a form's fields are whatever the author built — so every submitted value is
// rendered generically as label → value, with files as authenticated downloads.
//
// Triage (mark handled / spam) rides the toolbar; the rare, irreversible Delete
// sits in a plain row after the record, not as a card with equal weight to it.
// Opening a New submission quietly marks it Read — the expected inbox behaviour,
// and it keeps the list badge honest without a click.

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Heading,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Archive, Ban, Download, Mail, Phone, Trash2, Undo2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { downloadServerFile, saveBlob } from '../../lib/api/download';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useSites } from '../../lib/api/shell-data';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  formLabel,
  formatBytes,
  formatDateTime,
  humanizeKey,
  pageLabel,
  submissionCsvName,
  submissionErrorMessage,
  submissionState,
  submissionToCsv,
  submitterLabel,
  useDeleteSubmission,
  useSetSubmissionStatus,
  useSubmission,
  type FormSubmission,
  type SubmissionAttachment,
} from './form-submissions-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function SubmissionDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const { data, isPending, isError, error, isFetching, dataUpdatedAt, refetch } = useSubmission(id);

  useEffect(() => {
    if (data) ctx.setTitle(submitterLabel(data));
  }, [data, ctx]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="submission"
        title="Could not load this submission"
        description="This is a problem reaching the server. The submission itself is unaffected — nothing has been lost."
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

  return (
    <SubmissionBody
      ctx={ctx}
      id={id}
      submission={data}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
    />
  );
}

interface SubmissionBodyProps {
  ctx: SurfaceContext;
  id: string;
  submission: FormSubmission;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
}

function SubmissionBody({
  ctx,
  id,
  submission,
  isFetching,
  dataUpdatedAt,
  refetch,
}: SubmissionBodyProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const setStatus = useSetSubmissionStatus(id);
  const del = useDeleteSubmission(id);

  const { data: sites } = useSites();
  const site =
    submission.propertyId != null
      ? ((sites ?? []).find((candidate) => candidate.id === submission.propertyId)?.name ?? null)
      : null;

  // Opening a New submission marks it Read — quietly, no toast. Fired once per id;
  // after it lands the status is no longer 'new', so the guard also stops a second
  // run from a background refetch.
  const autoReadRef = useRef(false);
  useEffect(() => {
    if (autoReadRef.current) return;
    if (submission.status !== 'new') return;
    autoReadRef.current = true;
    setStatus.mutate('read');
  }, [submission.status, setStatus]);

  const state = submissionState(submission.status);
  const isArchived = submission.status === 'archived';
  const isSpam = submission.status === 'spam';

  const changeStatus = (next: Parameters<typeof setStatus.mutate>[0], successTitle: string) => {
    setStatus.mutate(next, {
      onSuccess: () => {
        toast.add({ title: successTitle, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not change this',
          description: submissionErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onExport = () => {
    try {
      saveBlob(
        new Blob([submissionToCsv(submission, site)], { type: 'text/csv;charset=utf-8' }),
        submissionCsvName(submission)
      );
    } catch {
      toast.add({
        title: 'Could not export this',
        description: 'Your browser would not save the file. Try again.',
        type: 'error',
      });
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete this submission from ${submitterLabel(submission)}?`,
      description:
        'This removes it for good, along with anything they attached. This cannot be undone — if you only want it out of your inbox, mark it as handled instead.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: 'Submission deleted', type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this',
          description: submissionErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const busy = setStatus.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Submission actions"
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {isArchived ? (
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  disabled={busy}
                  onClick={() => {
                    changeStatus('read', 'Moved back to your inbox');
                  }}
                >
                  <Undo2 className="size-4" aria-hidden />
                  Back to inbox
                </Button>
              ) : (
                <Button
                  size="sm"
                  color="module"
                  disabled={busy}
                  onClick={() => {
                    changeStatus('archived', 'Marked as handled');
                  }}
                >
                  <Archive className="size-4" aria-hidden />
                  Mark as handled
                </Button>
              )}

              {isSpam ? (
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  disabled={busy}
                  onClick={() => {
                    changeStatus('read', 'No longer marked as spam');
                  }}
                >
                  Not spam
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  color="neutral"
                  disabled={busy}
                  onClick={() => {
                    changeStatus('spam', 'Marked as spam');
                  }}
                >
                  <Ban className="size-4" aria-hidden />
                  Spam
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                color="neutral"
                title="Download this as a spreadsheet"
                onClick={onExport}
              >
                <Download className="size-4" aria-hidden />
                Export
              </Button>
            </div>
          </>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={refetch} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* One status line, in plain words — the specific meaning of the badge above. */}
          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>{state.detail}</AlertDescription>
            </AlertContent>
          </Alert>

          <IdentityCard submission={submission} site={site} />

          <SubmittedFields submission={submission} />

          {submission.attachments.length > 0 ? (
            <Attachments id={id} attachments={submission.attachments} />
          ) : null}

          <SourceCard submission={submission} site={site} />

          {/* Destructive action as a plain row under a divider — not a card with
              equal weight to the record above it. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this submission</Text>
              <Text className="text-sm">
                Removes it for good. To only take it out of your inbox, mark it as handled above.
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="danger"
              loading={del.isPending}
              onClick={() => {
                void onDelete();
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Identity ───────────────────────────────────────────────────────────── */

function IdentityCard({ submission, site }: { submission: FormSubmission; site: string | null }) {
  const where = [formLabel(submission), pageLabel(submission.pageSlug), site]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <Card className="p-4">
      <Heading level={1} className="text-2xl font-semibold">
        {submitterLabel(submission)}
      </Heading>
      <Text className="mt-1">{where}</Text>
      <Text className="mt-1 text-sm">Received {formatDateTime(submission.createdAt)}</Text>

      {submission.email || submission.phone ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {submission.email ? (
            <Button
              size="sm"
              variant="soft"
              color="module"
              // eslint-disable-next-line jsx-a11y/anchor-has-content -- content is the Button's children; the anchor is the render target, and the a11y rule can't see through Button's render prop.
              render={<a href={`mailto:${submission.email}`} />}
            >
              <Mail className="size-4" aria-hidden />
              {submission.email}
            </Button>
          ) : null}
          {submission.phone ? (
            <Button
              size="sm"
              variant="soft"
              color="module"
              // eslint-disable-next-line jsx-a11y/anchor-has-content -- content is the Button's children; the anchor is the render target, and the a11y rule can't see through Button's render prop.
              render={<a href={`tel:${submission.phone}`} />}
            >
              <Phone className="size-4" aria-hidden />
              {submission.phone}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/* ── What they sent ─────────────────────────────────────────────────────── */

/** The verbatim field set. Prefers `fields` (the full authored set); on an older
 *  row that only stored the promoted columns, synthesises the list from those, so
 *  a submission never renders as an empty card. */
function fieldEntries(submission: FormSubmission): [string, string][] {
  const entries = Object.entries(submission.fields).filter(
    ([, value]) => typeof value === 'string' && value.trim() !== ''
  );
  if (entries.length > 0) return entries;
  const promoted: [string, string | null][] = [
    ['name', submission.name],
    ['email', submission.email],
    ['phone', submission.phone],
    ['message', submission.message],
  ];
  return promoted.filter((pair): pair is [string, string] => Boolean(pair[1]));
}

/** A long value (a message, an address) reads as a block; a short one as a row. */
function isBlockValue(value: string): boolean {
  return value.length > 60 || value.includes('\n');
}

function SubmittedFields({ submission }: { submission: FormSubmission }) {
  const entries = fieldEntries(submission);

  return (
    <Card className="overflow-hidden">
      <header className="border-base-300 border-b px-4 py-3">
        <Heading level={2} className="text-base font-semibold">
          What they sent
        </Heading>
      </header>
      {entries.length === 0 ? (
        <div className="p-4">
          <Text>This form was submitted with no filled-in fields.</Text>
        </div>
      ) : (
        <dl className="divide-base-300 flex flex-col divide-y">
          {entries.map(([key, value]) => {
            const block = isBlockValue(value);
            return (
              <div
                key={key}
                className={
                  block
                    ? 'flex flex-col gap-1 px-4 py-3'
                    : 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3'
                }
              >
                <dt className="text-sm font-medium">{humanizeKey(key)}</dt>
                <dd className={block ? 'whitespace-pre-wrap' : 'min-w-0 text-right break-words'}>
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}

/* ── Attachments ────────────────────────────────────────────────────────── */

function Attachments({ id, attachments }: { id: string; attachments: SubmissionAttachment[] }) {
  const toast = useToast();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);

  const download = async (attachment: SubmissionAttachment, index: number) => {
    setBusyIndex(index);
    try {
      await downloadServerFile(
        `/v1/forms/submissions/${id}/attachments/${String(index)}`,
        attachment.filename
      );
    } catch (error) {
      toast.add({
        title: 'Could not download this file',
        description: error instanceof Error ? error.message : 'Try again in a moment.',
        type: 'error',
      });
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <header className="border-base-300 border-b px-4 py-3">
        <Heading level={2} className="text-base font-semibold">
          Files they attached
        </Heading>
      </header>
      <ul className="divide-base-300 flex flex-col divide-y">
        {attachments.map((attachment, index) => (
          <li
            key={`${attachment.filename}-${String(index)}`}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 flex-col">
              <Text className="truncate font-medium">{attachment.filename}</Text>
              <Text className="text-sm">{formatBytes(attachment.byteSize)}</Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={busyIndex === index}
              onClick={() => {
                void download(attachment, index);
              }}
            >
              <Download className="size-4" aria-hidden />
              Download
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Where it came from ─────────────────────────────────────────────────── */

/** Turn a context value into readable text — nested objects and arrays are shown
 *  as compact JSON, never as `[object Object]`. Rendered as TEXT (React escapes
 *  it); this is untrusted public input and is never treated as HTML. */
function contextValue(key: string, value: unknown): string {
  if (value == null) return '';
  // A key that NAMES a moment ("submittedAt", "sent_at") reads as a formatted
  // time; a mere substring match ("category") must not, so anchor it to the end.
  if ((key.endsWith('At') || key.endsWith('_at')) && typeof value === 'string') {
    const formatted = formatDateTime(value);
    if (formatted !== '—') return formatted;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/** Friendly labels for the captured request context, in the words a business
 *  owner reads rather than the raw technical key. Anything unmapped falls back to
 *  a humanised key, so a future context field still shows up — just less prettily. */
const CONTEXT_LABELS: Record<string, string> = {
  referrer: 'Page they came from',
  userAgent: 'Their browser',
  ip: 'Their IP address',
};

function SourceCard({ submission, site }: { submission: FormSubmission; site: string | null }) {
  const rows: [string, string][] = [
    ['Form', formLabel(submission)],
    ['Page', pageLabel(submission.pageSlug)],
    ...(site ? ([['Site', site]] as [string, string][]) : []),
    ['Received', formatDateTime(submission.createdAt)],
  ];
  for (const [key, value] of Object.entries(submission.context)) {
    // `submittedAt` is the same instant as "Received" above — don't say it twice.
    if (key === 'submittedAt') continue;
    const text = contextValue(key, value);
    if (text.trim() !== '') rows.push([CONTEXT_LABELS[key] ?? humanizeKey(key), text]);
  }

  return (
    <Card className="overflow-hidden">
      <header className="border-base-300 border-b px-4 py-3">
        <Heading level={2} className="text-base font-semibold">
          Where this came from
        </Heading>
      </header>
      <dl className="divide-base-300 flex flex-col divide-y">
        {rows.map(([key, value]) => (
          <div
            key={key}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <dt className="text-sm font-medium">{key}</dt>
            <dd className="min-w-0 text-right break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
