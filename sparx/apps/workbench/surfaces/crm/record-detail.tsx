'use client';

// One row of a tenant-invented object (docs/144 §3.6).
//
// ONE SURFACE FOR EVERY CUSTOM OBJECT, the same way the list is. Create and
// manage are the same pane ({id:'new'} → {id}), per the workbench rule — so the
// form is written once and a business inventing a fifth record type gets it for
// nothing.
//
// THE WHOLE RECORD IS ITS PROPERTIES. Unlike a contact or a deal — which carry a
// fixed spine of indexed columns with tenant properties added on top — a custom
// record IS its object's schema and nothing else. So this pane has no identity
// header of its own: `PropertyFields` renders the lot, and the title comes from
// whichever property the business nominated.
//
// It reuses the SAME renderer the "More details" panel uses on contacts and
// deals rather than a second one. One field engine means a date field behaves
// identically wherever it appears, and a fix to a repeater is a fix everywhere.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Heading,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Table2, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PropertyFields } from './custom-properties-panel';
import { useObjectType } from './object-types-data';
import { AssociationsPanel } from './associations-panel';
import { recordErrorMessage, recordTitle, useRecord, useRecordMutations } from './records-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function sameBag(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function RecordDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const objectKey = String(ctx.params.objectKey ?? '');
  const id = String(ctx.params.id ?? 'new');
  const isNew = id === 'new';

  const type = useObjectType(objectKey);
  const record = useRecord(id);
  const { create, update, remove } = useRecordMutations(objectKey);
  const toast = useToast();
  const confirm = useConfirm();

  const saved = useMemo<Record<string, unknown>>(() => record.data?.values ?? {}, [record.data]);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    if (record.data && !loaded) {
      setDraft(saved);
      setLoaded(true);
    }
  }, [isNew, record.data, saved, loaded]);

  const label = type.data?.label ?? 'Record';
  const title = record.data ? recordTitle(record.data, type.data?.primaryFieldKey ?? null) : '';

  useEffect(() => {
    ctx.setTitle(isNew ? `New ${label.toLowerCase()}` : title || label);
  }, [ctx, isNew, label, title]);

  const dirty = isNew ? Object.keys(draft).length > 0 : !sameBag(draft, saved);
  useDirtySource(
    dirty,
    isNew
      ? `This ${label.toLowerCase()} has not been created yet. Close anyway?`
      : `This ${label.toLowerCase()} has unsaved changes. Close anyway?`
  );

  const fields = type.data?.propertySchema?.fields ?? [];
  const saving = create.isPending || update.isPending;

  const submit = (): void => {
    if (isNew) {
      create.mutate(draft, {
        onSuccess: (created) => {
          toast.add({ title: `${label} added`, type: 'success' });
          // Become the record we just made, rather than opening a second pane
          // for it — the person is already looking at this one.
          ctx.open('crm.record.detail', { id: created.id, objectKey }, { target: 'replace' });
        },
        onError: (error) => {
          toast.add({
            title: `Could not add this ${label.toLowerCase()}`,
            description: recordErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
      return;
    }
    update.mutate(
      { id, values: draft },
      {
        onSuccess: () => {
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: recordErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async (): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${title || `this ${label.toLowerCase()}`}?`,
      description:
        'It comes out of your lists. Anything linked to it keeps its own history, and you can add it again later.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(id, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${label} removed`, type: 'success' });
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${label} actions`}
        status={
          <Text as="span" className="truncate text-sm">
            {isNew ? `New ${label.toLowerCase()}` : title}
          </Text>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={saving}
            disabled={!isNew && !dirty}
            onClick={submit}
          >
            {isNew ? `Add ${label.toLowerCase()}` : 'Save'}
          </Button>
        }
        controls={
          <>
            <Table2 className="size-4 shrink-0" aria-hidden />
            {!isNew ? (
              <Button
                color="danger"
                variant="ghost"
                size="sm"
                aria-label={`Remove this ${label.toLowerCase()}`}
                title="Remove it"
                onClick={() => void onDelete()}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {record.isError ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>Could not load this {label.toLowerCase()}</AlertTitle>
                <AlertDescription>
                  {recordErrorMessage(record.error, 'It may have been removed.')}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {fields.length === 0 && type.isSuccess ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>This record type has no details on it yet</AlertTitle>
                <AlertDescription>
                  Add some fields to &ldquo;{type.data?.label}&rdquo; under record types, and they
                  will appear here.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {fields.length > 0 ? (
            <FormSection
              title={label}
              description="Everything this business chose to track on these records."
            >
              <PropertyFields fields={fields} values={draft} onChange={setDraft} />
            </FormSection>
          ) : null}

          {!isNew ? (
            <>
              <Heading level={2} className="sr-only">
                Who else is involved
              </Heading>
              <AssociationsPanel objectKey={objectKey} recordId={id} ctx={ctx} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
