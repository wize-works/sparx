'use client';

// The group editor itself — create and manage, which are the same form at
// two ages. The write side is ./collection-editor-writes.ts.

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Text } from '@wizeworks/silicaui-react';
import { faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { emptyDraft, sameSet, toDraft, type Draft } from './collection-draft';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { CollectionBasics } from './collection-detail-basics';
import { CollectionMembers } from './collection-detail-members';
import { CollectionExtras } from './collection-detail-extras';
import { useCollectionWrites } from './collection-editor-writes';
import { slugifyHandle, type CollectionDetail } from './collections-data';
import { SaveFailure } from '@/components/save-failure';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function CollectionEditor({
  ctx,
  id,
  collection,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  collection?: CollectionDetail;
  /** Only the saved-collection state has a query behind it; "new" has none. */
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';

  const saved = useMemo(() => (collection ? toDraft(collection) : emptyDraft()), [collection]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  const [handleTouched, setHandleTouched] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New group' : (collection?.name ?? 'Group of products'));
  }, [ctx, isNew, collection]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const effectiveHandle = isNew && !handleTouched ? slugifyHandle(draft.name) : draft.handle;
  const nameError = draft.name.trim() === '' ? 'Give the group a name.' : null;

  const membershipChanged = draft.type === 'manual' && !sameSet(draft.productIds, saved.productIds);
  const rulesChanged =
    draft.type === 'rules' && JSON.stringify(draft.ruleSet) !== JSON.stringify(saved.ruleSet);

  const dirty = isNew
    ? draft.name.trim() !== '' ||
      handleTouched ||
      draft.description.trim() !== '' ||
      draft.featured ||
      draft.heroMediaId !== null ||
      draft.seoTitle.trim() !== '' ||
      draft.seoDescription.trim() !== '' ||
      draft.ogImageId !== null ||
      draft.propertyIds.length > 0 ||
      draft.productIds.length > 0 ||
      draft.ruleSet.predicates.length > 0
    : draft.name !== saved.name ||
      draft.handle !== saved.handle ||
      draft.description !== saved.description ||
      draft.featured !== saved.featured ||
      draft.heroMediaId !== saved.heroMediaId ||
      draft.seoTitle !== saved.seoTitle ||
      draft.seoDescription !== saved.seoDescription ||
      draft.ogImageId !== saved.ogImageId ||
      !sameSet(draft.propertyIds, saved.propertyIds) ||
      membershipChanged ||
      rulesChanged;

  const writes = useCollectionWrites({
    ctx,
    id,
    isNew,
    draft,
    savedProductIds: saved.productIds,
    handle: effectiveHandle,
    collection: collection ?? null,
    nameError,
    setRuleError,
    onSaved: () => {
      setTouched(false);
    },
  });

  useDirtySource(
    dirty && !writes.created,
    isNew
      ? 'This group has not been created yet. Close anyway?'
      : 'This group has unsaved changes. Close anyway?'
  );

  const isRules = draft.type === 'rules';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Group actions"
        status={
          !isNew ? (
            <Badge color={isRules ? 'info' : 'module'} variant="soft" size="sm">
              {isRules ? 'Automatic' : 'Hand-picked'}
            </Badge>
          ) : null
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={writes.saving}
            disabled={Boolean(nameError) || (!isNew && !dirty)}
            onClick={writes.submit}
          >
            {isNew ? 'Create the group' : 'Save'}
          </Button>
        }
        refresh={
          onRefresh ? (
            <RefreshButton
              isFetching={isFetching ?? false}
              updatedAt={updatedAt}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <Text>
              A group is a set of products you show together — a summer sale, a gift guide, this
              month&apos;s arrivals. Unlike a category, it is not part of your menu: it is a set you
              can place anywhere on your site.
            </Text>
          ) : null}

          <SaveFailure title="Could not save this group" message={writes.failure} />

          <CollectionBasics
            draft={draft}
            set={set}
            effectiveHandle={effectiveHandle}
            setHandleTouched={setHandleTouched}
            nameError={nameError}
            touched={touched}
          />

          <CollectionMembers
            id={id}
            isNew={isNew}
            isRules={isRules}
            collection={collection ?? null}
            draft={draft}
            set={set}
            ruleError={ruleError}
            setRuleError={setRuleError}
            reindexing={writes.reindexing}
            onReindex={writes.onReindex}
          />

          <CollectionExtras draft={draft} set={set} />

          {!isNew && collection ? (
            <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
              <Text className="text-sm">
                A group&apos;s kind — hand-picked or automatic — is fixed once it is created. To
                switch, delete this one and make a new one.
              </Text>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Deleting removes this group from your website. The products in it are kept — only
                  the grouping goes.
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  loading={writes.deleting}
                  onClick={() => {
                    void writes.onDelete();
                  }}
                >
                  <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                  Delete this group
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
