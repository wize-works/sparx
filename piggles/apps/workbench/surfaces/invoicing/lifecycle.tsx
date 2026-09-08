'use client';

// The document's lifecycle, in the pane header.
//
// A billing document's life IS its workflow: draft → open → committed → final →
// paid, with void as the exit — whatever the tenant named those stages. So the
// header shows ONE control: the current stage, opening into the stages it can
// move to. Void is not a special button; it is a stage like any other, present
// exactly when the tenant's workflow defines one.
//
// Advancing is deliberately ceremonial when it needs to be. Entering a stage
// can assign the document's number, freeze a permanent record, or lock the
// lines — irreversible things — so the confirm names each effect in plain
// words before anything happens. A stage with no entry effects advances
// without interruption.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  faArrowUpRightFromSquare,
  faBoxCheck,
  faCheck,
  faChevronDown,
  faCopy,
  faEllipsis,
  faPaperPlane,
  faPrint,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { api } from '../../lib/api/client';
import { openServerHtml } from '../../lib/api/html-artifact';
import { deferTick } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  stageTone,
  type BillingDocument,
  type DocumentStage,
  type DocumentWorkflowDetail,
} from './types';

/** The document's workflow — names + entry effects for every stage it can hold. */
export function useDocumentWorkflow(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['invoicing', 'workflow', workflowId],
    queryFn: () => api.get<DocumentWorkflowDetail>(`/v1/invoicing/workflows/${workflowId}`),
    enabled: Boolean(workflowId),
    // Workflow topology changes rarely — an operator reconfiguring stages and
    // editing an invoice in the same minute can refresh.
    staleTime: 300_000,
  });
}

/** What entering a stage will do, in the operator's words. Empty = free move. */
function entryEffects(stage: DocumentStage): string[] {
  const effects: string[] = [];
  if (stage.numberOnEnter) effects.push('assign its number');
  if (stage.snapshotOnEnter) effects.push('freeze a permanent record of it');
  if (stage.locksEditing) effects.push('lock it from further edits');
  return effects;
}

function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? '';
  return `${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1] ?? ''}`;
}

interface StageControlProps {
  doc: BillingDocument;
  stages: DocumentStage[];
}

export function StageControl({ doc, stages }: StageControlProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const advance = useMutation({
    mutationFn: (stageId: string) =>
      api.post<BillingDocument>(`/v1/invoicing/documents/${doc.id}/advance`, { stageId }),
    onSuccess: (moved, stageId) => {
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
      const stage = stages.find((candidate) => candidate.id === stageId);
      toast.add({
        title: stage ? `Moved to ${stage.customerLabel}` : 'Stage updated',
        // The number is minted server-side on entry — surfacing it here is how
        // the operator learns "it's INV-000005 now" without hunting for it.
        ...(moved.number && !doc.number ? { description: `This is now ${moved.number}.` } : {}),
        type: 'success',
      });
    },
    onError: () => {
      toast.add({
        title: 'Could not move the document',
        description: 'It may have changed underneath you — it will refresh and you can retry.',
        type: 'error',
      });
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
    },
  });

  const current = stages.find((stage) => stage.id === doc.stageId);
  if (!current) return null;

  const move = async (stage: DocumentStage) => {
    // Yield so the menu's close commit finishes before the dialog opens —
    // both use flushSync, and overlapping them is a React error. lib/defer.ts.
    await deferTick();
    const effects = entryEffects(stage);
    if (effects.length > 0) {
      // Async, never window.confirm: a blocking confirm inside a menu-item
      // click freezes Base UI's close mid-flight (flushSync-in-render errors).
      const ok = await confirm({
        title: `Move ${doc.number ?? 'this document'} to "${stage.customerLabel}"?`,
        description: `Entering this stage will ${joinClauses(effects)}.`,
        confirmLabel: 'Move it',
        cancelLabel: 'Not yet',
        ...(stage.stageType === 'void' ? { color: 'danger' as const } : {}),
      });
      if (!ok) return;
    }
    advance.mutate(stage.id);
  };

  return (
    <DropdownMenu>
      <Tooltip content="Where this document is in its life — open to move it">
        <DropdownMenuTrigger>
          <Button
            color={stageTone(current.stageType)}
            variant="soft"
            size="sm"
            className="gap-1.5"
            disabled={advance.isPending}
          >
            {current.customerLabel}
            <Icon glyph={faChevronDown} className="size-3" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
          {stages.map((stage) => {
            const isCurrent = stage.id === current.id;
            const effects = entryEffects(stage);
            return (
              <DropdownMenuItem
                key={stage.id}
                disabled={isCurrent}
                onClick={() => {
                  void move(stage);
                }}
              >
                <span className="flex w-full items-start gap-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      {stage.customerLabel}
                      <Badge color={stageTone(stage.stageType)} variant="soft" size="xs">
                        {stage.stageType}
                      </Badge>
                    </span>
                    {effects.length > 0 ? (
                      <span className="text-sm">Will {joinClauses(effects)}</span>
                    ) : null}
                  </span>
                  {isCurrent ? (
                    <Icon glyph={faCheck} className="size-4 shrink-0" aria-hidden />
                  ) : null}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Same shape the payments and signature rows use — medium date, no time. When
 *  it was sent matters to the day, not the minute. */
function sentOn(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'an earlier date';
  return new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Give the document to the person who owes the money.
 *
 * This is the one thing invoicing could not do. It could create, number, total,
 * snapshot, print and take payment on a document, and the editor's email box
 * even says "Where the invoice gets sent" — a promise nothing kept. The only
 * outbound actions were Print and Copy payment link, both of which hand the job
 * back to the operator's own mail client.
 *
 * It sits in the TOOLBAR, not the overflow menu. Making an invoice and sending
 * it is one errand, and the second half of it is not a thing to go hunting for.
 */
export function SendButton({ doc, dirty }: { doc: BillingDocument; dirty: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const send = useMutation({
    mutationFn: () =>
      api.post<{ to: string; documentNumber: string }>(
        `/v1/invoicing/documents/${doc.id}/send`,
        {}
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
      toast.add({
        title: `Sent to ${result.to}`,
        description: 'The invoice is in their inbox, with the lines and the total on it.',
        type: 'success',
      });
    },
    onError: (error) => {
      toast.add({
        title: 'Could not send it',
        // The server refuses with sentences somebody can act on ("add an email
        // address under Bill to"), so they are shown as written.
        description:
          error instanceof Error && error.message.length < 300
            ? error.message
            : 'Nothing was sent. Try again in a moment.',
        type: 'error',
      });
    },
  });

  const metadata = (doc.metadata ?? {}) as { sentAt?: unknown; sentTo?: unknown };
  const sentAt = typeof metadata.sentAt === 'string' ? metadata.sentAt : null;
  const sentTo = typeof metadata.sentTo === 'string' ? metadata.sentTo : null;

  // Never email a version that is not the saved one — what lands in their inbox
  // has to be the document this pane can still show her afterwards.
  const blockedReason = dirty
    ? 'Save your changes first — otherwise they would get a different invoice from the one you are looking at.'
    : null;

  const onSend = async () => {
    // The server's answer, not a second guess at it: an invoice with no address
    // of its own still goes to the customer on it. A blank string counts as no
    // address, which is why this is a first-non-empty rather than a `??` chain.
    const to =
      [doc.billTo?.email, doc.billedToEmail]
        .map((value) => (value ?? '').trim())
        .find((value) => value.length > 0) ?? '';
    const ok = await confirm({
      title: sentAt ? 'Send this invoice again?' : 'Send this invoice?',
      description: to
        ? `${doc.number ?? 'This invoice'} goes to ${to}, with its lines, its total and anything you wrote in Notes.` +
          // Sending fills in an empty deadline, so say so BEFORE she clicks. A
          // date she never typed appearing in a field she can see is a small
          // surprise, and a deadline is the one thing on a bill she may want to
          // choose herself.
          (doc.dueAt ? '' : ' It has no deadline yet, so it will be due when they get it.') +
          (sentAt ? ' They already have a copy; this sends another.' : '')
        : 'There is no email address on this invoice yet. Add one under Bill to first.',
      confirmLabel: sentAt ? 'Send it again' : 'Send it',
      cancelLabel: 'Not yet',
      color: 'module',
    });
    if (!ok) return;
    await deferTick();
    send.mutate();
  };

  return (
    <Tooltip
      content={
        blockedReason ??
        (sentAt && sentTo
          ? `Last sent to ${sentTo} on ${sentOn(sentAt)}`
          : 'Email it to the customer')
      }
    >
      <Button
        color="module"
        variant="outline"
        size="sm"
        disabled={Boolean(blockedReason) || send.isPending}
        onClick={() => {
          void onSend();
        }}
      >
        <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
        {send.isPending ? 'Sending…' : sentAt ? 'Send again' : 'Send'}
      </Button>
    </Tooltip>
  );
}

interface DocumentActionsProps {
  doc: BillingDocument;
  stage: DocumentStage | undefined;
  ctx: SurfaceContext;
}

/**
 * The overflow actions — everything document-level that isn't the stage move
 * or Save. Each item appears only when it can actually work, so the menu is
 * the document's real capabilities, not a list of greyed-out wishes.
 */
export function DocumentActions({ doc, stage, ctx }: DocumentActionsProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const paymentLink = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>(`/v1/invoicing/documents/${doc.id}/payment-link`, {
        // Where the customer lands after paying. There is no public invoice
        // page yet, so this mirrors the dashboard's convention (the document's
        // own URL) — a known platform-wide gap, not a workbench invention.
        successUrl: window.location.origin,
      }),
    onSuccess: async ({ url }) => {
      await navigator.clipboard.writeText(url);
      toast.add({
        title: 'Payment link copied',
        description: 'Paste it into an email or message — it collects the amount still owed.',
        type: 'success',
      });
    },
    onError: (error) => {
      toast.add({
        title: 'Could not create a payment link',
        description:
          error instanceof Error && error.message.length < 200
            ? error.message
            : 'Check that a payment gateway is set up in Settings → Payments.',
        type: 'error',
      });
    },
  });

  const convert = useMutation({
    mutationFn: () =>
      api.post<{ document: BillingDocument; order: { id: string; orderNumber: string } }>(
        `/v1/invoicing/documents/${doc.id}/convert-to-order`,
        {}
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
      toast.add({
        title: `Order ${result.order.orderNumber} created`,
        description: 'The accepted quote is now a real order, ready to fulfil.',
        type: 'success',
      });
    },
    onError: () => {
      toast.add({ title: 'Could not convert this document to an order', type: 'error' });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/v1/invoicing/documents/${doc.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
      toast.add({ title: 'Draft deleted', type: 'success' });
      ctx.close();
    },
    onError: () => {
      toast.add({ title: 'Could not delete this draft', type: 'error' });
    },
  });

  const canDelete = stage?.stageType === 'draft';
  const canConvert = stage?.stageType === 'committed' && !doc.convertedOrder;
  const canPaymentLink = doc.balance > 0;

  return (
    <DropdownMenu>
      <Tooltip content="More actions">
        <DropdownMenuTrigger>
          <Button
            color="neutral"
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="More actions"
          >
            <Icon glyph={faEllipsis} className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        {/* Always available on a saved document, so the menu is never empty.
            The print routes need the Authorization header, hence the fetch →
            blob → tab helper rather than a plain link. NOT window.print(): that
            would print the editor chrome, not the branded document. */}
        <DropdownMenuItem
          onClick={() => {
            openServerHtml(`/v1/invoicing/documents/${doc.id}/pdf`).catch((error: unknown) => {
              toast.add({
                title: 'Could not open the print view',
                description: error instanceof Error ? error.message : 'Try again in a moment.',
                type: 'error',
              });
            });
          }}
        >
          <Icon glyph={faPrint} className="size-4" aria-hidden />
          Print or save as PDF
        </DropdownMenuItem>

        {canPaymentLink || canConvert || doc.convertedOrder ? <DropdownMenuSeparator /> : null}

        {canPaymentLink ? (
          <DropdownMenuItem
            disabled={paymentLink.isPending}
            onClick={() => {
              paymentLink.mutate();
            }}
          >
            <Icon glyph={faCopy} className="size-4" aria-hidden />
            Copy payment link
          </DropdownMenuItem>
        ) : null}

        {canConvert ? (
          <DropdownMenuItem
            disabled={convert.isPending}
            onClick={() => {
              convert.mutate();
            }}
          >
            <Icon glyph={faBoxCheck} className="size-4" aria-hidden />
            Convert to order
          </DropdownMenuItem>
        ) : null}

        {doc.convertedOrder ? (
          <DropdownMenuItem disabled>
            <Icon glyph={faArrowUpRightFromSquare} className="size-4" aria-hidden />
            Order {doc.convertedOrder.orderNumber} exists
          </DropdownMenuItem>
        ) : null}

        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={remove.isPending}
              onClick={() => {
                // Destructive: the confirm names exactly what is being lost.
                // Deferred so the menu's close doesn't collide with the
                // dialog's open (both flushSync) — lib/defer.ts.
                void deferTick()
                  .then(() =>
                    confirm({
                      title: 'Delete this draft?',
                      description:
                        'Its line items go with it, and there is no undo. Nothing has been sent to the customer.',
                      confirmLabel: 'Delete it',
                      cancelLabel: 'Keep it',
                      color: 'danger',
                    })
                  )
                  .then((ok) => {
                    if (ok) remove.mutate();
                  });
              }}
            >
              <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              Delete draft
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
