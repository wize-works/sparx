'use client';

// The invoice editor — and the clearest example of what this app changes.
//
// The dashboard's version of this screen renders the form and a live preview
// side by side, permanently, because someone had to decide and that was the
// decision. It costs every operator half their screen whether or not they care
// about the preview, and it can't be undone without the layout feeling broken.
//
// Here the editor is just the editor. "Preview" opens a pane. Put it beside the
// form, on a second monitor, behind the form as a tab you check occasionally, or
// never open it at all. The editor doesn't know which you chose and has no
// opinion about it — it publishes its draft to the shared store and moves on.
//
// Saving is genuinely two-phase (header, then lines); the mechanics and the
// reasons live in ./save.ts.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import {
  Alert,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Select,
  Textarea,
} from '@wizeworks/silicaui-react';
import { faEye, faFloppyDisk } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { EditorLayout } from '../../components/editor-layout';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { api } from '../../lib/api/client';
import { clearDraft, draftKey, publishDraft } from '../../lib/drafts';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { BillTo } from './bill-to';
import { LineItems } from './line-items';
import { InvoiceSummary } from './invoice-summary';
import { HistorySection } from './history';
import { DocumentActions, SendButton, StageControl, useDocumentWorkflow } from './lifecycle';
import { PaymentsSection } from './payments';
import { SignaturesSection } from './signatures';
import { InvoiceValidationError, listDocumentWorkflows, saveInvoice } from './save';
import { newLineKey, type DraftLine } from './totals';
import type { LineTypeOption } from './line-editor-modal';
import type { MarkupRuleSummary } from './line-markup';
import { normalizeDocument, type BillingDocument } from './types';

interface DraftShape {
  customerId: string | null;
  billTo: { name: string; email: string; address: string };
  taxRate: number;
  notes: string;
  /** `YYYY-MM-DD`, or '' for no due date. */
  dueAt: string;
  lines: DraftLine[];
}

const EMPTY_DRAFT: DraftShape = {
  customerId: null,
  billTo: { name: '', email: '', address: '' },
  taxRate: 0,
  notes: '',
  dueAt: '',
  // No starter row: lines are added through the modal, so a fresh invoice shows
  // the empty state + Add button rather than a stray blank line.
  lines: [],
};

interface LineTypeApi extends LineTypeOption {
  isActive: boolean;
}

/** A markup rule as GET /v1/markup-rules returns it — with the scope flag we use
 *  to keep only the ones a document line may apply. */
interface MarkupRuleApi extends MarkupRuleSummary {
  appliesTo: string;
  isActive: boolean;
}

/** Server lines carry ids; local rows need a key too. */
function toDraftLines(doc: BillingDocument | undefined): DraftLine[] {
  return (doc?.lines ?? []).map((line) => ({
    key: newLineKey(),
    ...(line.id ? { id: line.id } : {}),
    lineTypeId: line.lineTypeId ?? null,
    description: line.description,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice ?? 0),
    discountAmount: Number(line.discountAmount ?? 0),
    taxable: line.taxable ?? true,
    productId: line.productId ?? null,
    variantId: line.variantId ?? null,
    costCents: line.costCents ?? null,
    appliedMarkup: line.appliedMarkup ?? null,
  }));
}

export function InvoiceEditorSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = ctx.params.id ?? 'new';
  const isNew = id === 'new';
  const key = draftKey('invoice', id);
  const queryClient = useQueryClient();

  const {
    data: doc,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['invoicing', 'document', id],
    queryFn: () =>
      api.get<BillingDocument>(`/v1/invoicing/documents/${id}`).then(normalizeDocument),
    enabled: !isNew,
  });

  // Only a brand-new invoice needs a workflow resolved; an existing one already
  // belongs to whichever workflow created it.
  const { data: workflows } = useQuery({
    queryKey: ['invoicing', 'workflows'],
    queryFn: listDocumentWorkflows,
    enabled: isNew,
    staleTime: 300_000,
  });

  // The line composer's vocabulary: the tenant's line types (each carries a
  // pricing mode + tax default) and the markup rules a document line may use.
  // Both are small, change rarely, and are needed the moment the modal opens.
  const { data: lineTypes = [] } = useQuery({
    queryKey: ['invoicing', 'line-types'],
    queryFn: () => api.get<LineTypeApi[]>('/v1/invoicing/line-types'),
    staleTime: 300_000,
  });
  const activeLineTypes: LineTypeOption[] = lineTypes.filter((type) => type.isActive);

  // Commerce may be off on a services-only tenant, in which case /v1/markup-rules
  // 404s — degrade to ad-hoc markup only rather than failing the editor.
  const { data: markupRules = [] } = useQuery({
    queryKey: ['invoicing', 'markup-rules'],
    queryFn: () =>
      api
        .get<MarkupRuleApi[]>('/v1/markup-rules', { is_active: true })
        .catch(() => [] as MarkupRuleApi[]),
    staleTime: 300_000,
  });
  const documentMarkupRules: MarkupRuleSummary[] = markupRules.filter(
    (rule) => rule.appliesTo === 'document' || rule.appliesTo === 'both'
  );

  const [draft, setDraft] = useState<DraftShape>(EMPTY_DRAFT);
  const [original, setOriginal] = useState<DraftLine[]>([]);
  const [dirty, setDirty] = useState(false);
  // null until the operator chooses; falls back to the first workflow so a
  // single-workflow tenant never sees a decision it doesn't have.
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  // Seed the form once the document arrives, and remember the lines it came
  // with — that snapshot is the only way to tell later that one was deleted.
  useEffect(() => {
    if (!doc) return;
    const lines = toDraftLines(doc);
    setDraft({
      customerId: doc.customerId ?? null,
      billTo: {
        name: doc.billTo?.name ?? '',
        email: doc.billTo?.email ?? '',
        address: doc.billTo?.address ?? '',
      },
      taxRate: doc.taxRate,
      // The note the customer reads, as stored. It used to be hardcoded to `''`,
      // which made the box look empty on every load AND wiped the stored note on
      // the next save (`headerBody` sends `notes || null`). So a note could be
      // written, saved, and was gone the moment the pane reloaded — with the save
      // reporting success both times.
      notes: doc.notes ?? '',
      // Seeded from the document for the same reason `notes` is: a field the
      // editor does not read is a field the next save WIPES, and the save
      // reports success while doing it.
      dueAt: doc.dueAt ? doc.dueAt.slice(0, 10) : '',
      lines,
    });
    setOriginal(lines.filter((line) => line.id));
    setDirty(false);
  }, [doc]);

  // The document's own workflow — stage names, entry effects, and whether the
  // current stage locks editing. Not fetched for a new document (it has no
  // stage yet; it enters the chosen workflow's first stage on save).
  const { data: docWorkflow } = useDocumentWorkflow(doc?.workflowId);
  const currentStage = docWorkflow?.stages.find((stage) => stage.id === doc?.stageId);

  const currency = doc?.currency ?? 'USD';
  // Locked is a STAGE fact, not a status fact: a finalized invoice is locked
  // long before it is void. Status stays as the fallback for the moment between
  // the document arriving and its workflow arriving.
  const readOnly = currentStage ? currentStage.locksEditing : doc?.status === 'void';

  // Publish on every change so any open preview — in this window or another —
  // follows along. Cleared when the pane closes so a stale draft can't outlive it.
  useEffect(() => {
    publishDraft(key, { ...draft, currency });
  }, [draft, key, currency]);

  useEffect(() => () => clearDraft(key), [key]);

  // Registers with the pane so closing, replacing, or tearing it off confirms
  // first — and, in a detached window, so does the browser's own close button.
  //
  // This covers the HEADER form only. The line composer holds its own
  // uncommitted state and registers separately (line-editor-modal.tsx), which
  // is why a pane can be dirty while everything on this screen looks saved.
  useDirtySource(dirty, 'This invoice has unsaved changes. Close it anyway?');

  useEffect(() => {
    ctx.setTitle(isNew ? 'New invoice' : (doc?.number ?? 'Invoice'));
  }, [ctx, isNew, doc?.number]);

  const save = useMutation({
    mutationFn: () =>
      saveInvoice({
        id,
        workflowId: workflowId ?? workflows?.[0]?.id ?? null,
        header: { ...draft, currency },
        lines: draft.lines,
        original,
      }),
    onSuccess: (saved) => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['invoicing'] });
      // A new document has a real id now — retarget this pane at it so the
      // preview and any subsequent save address the saved document.
      if (isNew) ctx.open('invoicing.invoice.edit', { id: saved.id }, { target: 'replace' });
    },
  });

  const update = (patch: Partial<DraftShape>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  // A validation error is the operator's to fix and says so in their words; any
  // other failure is ours and shouldn't pretend to be actionable.
  const failure = save.error
    ? save.error instanceof InvoiceValidationError
      ? save.error.message
      : 'This invoice could not be saved. It may be a temporary problem — try again in a moment.'
    : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Editor actions"
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={doc ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      >
        {/* Toolbar chrome, so no color: a bare `.btn` resolves to base ink and
            stays right in both themes. `variant` without a color is nothing to
            apply, and `neutral` is not a choice to make unasked (RULE #4). */}
        <Button
          size="sm"
          onClick={() => {
            // 'beside' is a suggestion, not a layout: it splits the current group
            // once. The operator can move it anywhere afterwards and it stays put.
            ctx.open('invoicing.invoice.preview', { id }, { target: 'beside' });
          }}
        >
          <Icon glyph={faEye} className="size-4" aria-hidden />
          Preview
        </Button>
        <div className="flex-1" />
        {/* Lifecycle lives in the header (docs/86 §5.1): the stage control IS
            the document's status and its actions, one control. Only for saved
            documents — a new draft has no stage until it enters its workflow. */}
        {doc && docWorkflow ? <StageControl doc={doc} stages={docWorkflow.stages} /> : null}
        {doc ? <DocumentActions doc={doc} stage={currentStage} ctx={ctx} /> : null}
        {/* Sending is the second half of the errand, so it is a real control
            rather than an overflow item. Only on a saved document — a draft that
            has never been written down has nothing to send. */}
        {doc ? <SendButton doc={doc} dirty={dirty} /> : null}
        <Button
          color="module"
          size="sm"
          disabled={!dirty || save.isPending || readOnly}
          onClick={() => {
            save.mutate();
          }}
        >
          <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </PaneToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* A bento, laid out by container width — never viewport. A narrow
            pane collapses to one column even on a wide monitor, because pane
            width and screen width are unrelated here (EditorLayout owns the
            @container + the collapse). */}
        <div className="p-4">
          <EditorLayout
            banner={
              failure || readOnly ? (
                <div className="flex flex-col gap-3">
                  {failure ? (
                    <Alert color="danger" variant="soft">
                      {failure}
                    </Alert>
                  ) : null}
                  {readOnly ? (
                    <Alert color="info" variant="soft">
                      {currentStage
                        ? `This document is at "${currentStage.customerLabel}", which locks it from edits. Recording a payment still works.`
                        : 'This document has been voided, so it can no longer be changed.'}
                    </Alert>
                  ) : null}
                </div>
              ) : null
            }
            main={
              <>
                {/* Only offered while the document is new: the workflow decides
                    the stages it moves through, and changing that under a
                    document that has already entered one of them is not a
                    form field. */}
                {isNew && workflows && workflows.length > 1 ? (
                  <FormSection
                    title="Document type"
                    description="Decides the stages this document moves through, and how it gets numbered."
                  >
                    <Select
                      items={Object.fromEntries(workflows.map((w) => [w.id, w.name]))}
                      value={workflowId ?? workflows[0]?.id}
                      aria-label="Document type"
                      className="max-w-sm"
                      onValueChange={(next) => {
                        setWorkflowId(next as string);
                        setDirty(true);
                      }}
                    />
                  </FormSection>
                ) : null}

                <FormSection title="Bill to">
                  <BillTo
                    customerId={draft.customerId}
                    value={draft.billTo}
                    dueAt={draft.dueAt}
                    readOnly={readOnly}
                    onChange={update}
                  />
                </FormSection>

                <FormSection
                  title="Line items"
                  description="What is being charged for. The summary updates as you type."
                >
                  <LineItems
                    lines={draft.lines}
                    taxRate={draft.taxRate}
                    currency={currency}
                    lineTypes={activeLineTypes}
                    markupRules={documentMarkupRules}
                    readOnly={readOnly}
                    onChange={(lines) => {
                      update({ lines });
                    }}
                  />
                </FormSection>

                <FormSection title="Notes">
                  <Field>
                    <FieldLabel className="sr-only">Notes</FieldLabel>
                    <FieldControl
                      render={
                        <Textarea
                          color="module"
                          rows={3}
                          value={draft.notes}
                          disabled={readOnly}
                          placeholder="Payment terms, a thank you, anything the customer should read."
                          onChange={(event) => {
                            update({ notes: event.target.value });
                          }}
                        />
                      }
                    />
                    <FieldDescription>Shown on the invoice the customer receives</FieldDescription>
                  </Field>
                </FormSection>
              </>
            }
            rail={
              <>
                <InvoiceSummary
                  lines={draft.lines}
                  taxRate={draft.taxRate}
                  currency={currency}
                  readOnly={readOnly}
                  onTaxRateChange={(taxRate) => {
                    update({ taxRate });
                  }}
                  shippingTotal={doc?.shippingTotal ?? 0}
                  surchargeTotal={doc?.surchargeTotal ?? 0}
                  {...(doc
                    ? {
                        saved: {
                          total: doc.total,
                          balance: doc.balance,
                          amountPaid: doc.amountPaid,
                        },
                      }
                    : {})}
                />

                {/* Only for saved documents — you can't take money against a
                    draft that doesn't exist yet. Deliberately OUTSIDE the
                    read-only rule: a locked/finalized invoice is exactly the
                    one getting paid. */}
                {/* Asking the customer to accept it, and what came back
                    (docs/144 §12). Saved documents only — there is nothing to
                    sign until the thing exists, and a link to a draft that is
                    still being edited is a link to a moving target. */}
                {doc ? (
                  <SignaturesSection doc={doc} isDraft={currentStage?.stageType === 'draft'} />
                ) : null}

                {doc ? <PaymentsSection doc={doc} /> : null}

                {/* Frozen records — an appendix about the past. Renders
                    nothing until the first stage move freezes one. */}
                {doc ? <HistorySection doc={doc} /> : null}
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
