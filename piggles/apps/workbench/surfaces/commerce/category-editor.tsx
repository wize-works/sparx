'use client';

// The category editor — create and manage, which are the same form at two ages.
// The write side is ./category-detail-writes.ts.

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Text } from '@wizeworks/silicaui-react';
import { faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { slugifyHandle, type CategoryDetail } from './categories-data';
import { emptyDraft, sameSet, toDraft, type Draft } from './category-draft';
import { useCategoryWrites } from './category-detail-writes';
import { CategoryBasics } from './category-detail-basics';
import { CategoryExtras } from './category-detail-extras';
import { SaveFailure } from '@/components/save-failure';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function CategoryEditor({
  ctx,
  id,
  category,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  category?: CategoryDetail;
  /** Only the saved-category state has a query behind it; "new" has none. */
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';

  const saved = useMemo(() => (category ? toDraft(category) : emptyDraft()), [category]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  const [handleTouched, setHandleTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New category' : (category?.name ?? 'Category'));
  }, [ctx, isNew, category]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // The web address follows the name until someone edits it themselves.
  const effectiveHandle = isNew && !handleTouched ? slugifyHandle(draft.name) : draft.handle;

  const nameError = draft.name.trim() === '' ? 'Give the category a name.' : null;

  const dirty = isNew
    ? draft.name.trim() !== '' ||
      handleTouched ||
      draft.description.trim() !== '' ||
      draft.parentId !== null ||
      draft.featured ||
      draft.iconMediaId !== null ||
      draft.heroMediaId !== null ||
      draft.seoTitle.trim() !== '' ||
      draft.seoDescription.trim() !== '' ||
      draft.ogImageId !== null ||
      draft.propertyIds.length > 0
    : draft.name !== saved.name ||
      draft.handle !== saved.handle ||
      draft.description !== saved.description ||
      draft.parentId !== saved.parentId ||
      draft.position !== saved.position ||
      draft.featured !== saved.featured ||
      draft.iconMediaId !== saved.iconMediaId ||
      draft.heroMediaId !== saved.heroMediaId ||
      draft.seoTitle !== saved.seoTitle ||
      draft.seoDescription !== saved.seoDescription ||
      draft.ogImageId !== saved.ogImageId ||
      !sameSet(draft.propertyIds, saved.propertyIds);

  const writes = useCategoryWrites({
    ctx,
    id,
    isNew,
    draft,
    saved,
    handle: effectiveHandle,
    category: category ?? null,
    nameError,
    onSaved: () => {
      setTouched(false);
    },
  });

  useDirtySource(
    dirty && !writes.created,
    isNew
      ? 'This category has not been created yet. Close anyway?'
      : 'This category has unsaved changes. Close anyway?'
  );

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Category actions"
        status={
          !isNew && category?.featured ? (
            <Badge color="info" variant="soft" size="sm">
              Featured
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
            {isNew ? 'Create category' : 'Save'}
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
              A category is a part of your website&apos;s menu — an aisle shoppers browse down.
              Categories can sit inside one another, so &ldquo;Cookware&rdquo; can live under
              &ldquo;Camping&rdquo;.
            </Text>
          ) : null}

          <SaveFailure title="Could not save this category" message={writes.failure} />

          <CategoryBasics
            draft={draft}
            set={set}
            effectiveHandle={effectiveHandle}
            setHandleTouched={setHandleTouched}
            nameError={nameError}
            touched={touched}
            selfId={isNew ? null : id}
            selfPath={category?.path ?? null}
            isNew={isNew}
          />

          <CategoryExtras draft={draft} set={set} />

          {!isNew && category ? (
            <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Deleting takes this category off your website menu. Products filed here are kept —
                  they just stop appearing under this heading.
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
                  Delete this category
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
