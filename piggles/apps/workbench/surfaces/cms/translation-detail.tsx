'use client';

// One product, translated — its words in every language your customers read.
//
// The pane is the loader: it resolves the product and its languages, or explains
// why it could not. The editing lives in `translation-editor.tsx` (RULE #0.5).
//
// It reads COMMERCE product data from inside the Content module, so the whole
// surface wears the commerce hue via <ModuleScope module="commerce">: the pane's
// tab stays Content-teal, its content reads commerce-orange.

import { useEffect } from 'react';
import { Card } from '@wizeworks/silicaui-react';
import { faLanguage } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { Editor } from './translation-editor';
import {
  translationErrorMessage,
  useProductSource,
  useProductTranslations,
} from './translations-data';
import { PaneEmpty } from '../../components/pane-empty';
import { PaneLoadError } from '../../components/pane-load-error';
import { PaneWaiting } from '../../components/pane-waiting';

/** Registry module for this pane, so the brand draws Content's own picture
 *  rather than the generic one. */
const MODULE = 'cms';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/* ── The outer surface: load, or explain why not ────────────────────────── */

export function TranslationDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const productId = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const source = useProductSource(productId);
  const translations = useProductTranslations(productId);

  const title = source.data?.title ?? 'Translations';
  useEffect(() => {
    ctx.setTitle(title);
  }, [ctx, title]);

  const refresh = () => {
    void source.refetch();
    void translations.refetch();
  };

  // A failed load REPLACES the form — an empty form beside a dead Save is worse
  // than an honest "could not load".
  const failed = source.isError || translations.isError;
  const loading = source.isPending || translations.isPending;

  if (productId === '' || failed || loading) {
    return (
      <ModuleScope module="commerce" className={PANE_SHELL}>
        <PaneToolbar
          label="Product translations actions"
          refresh={
            <RefreshButton
              isFetching={source.isFetching || translations.isFetching}
              updatedAt={source.data ? source.dataUpdatedAt : undefined}
              onRefresh={refresh}
            />
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            {/* All three non-ready states are carded, matching the editor — a stack
                of FormSections, each already a card. */}
            {productId === '' ? (
              <Card>
                <PaneEmpty
                  module={MODULE}
                  icon={<Icon glyph={faLanguage} className="size-6" aria-hidden />}
                  title="No product chosen"
                  description="Open a product from the translations list to write its words in another language."
                />
              </Card>
            ) : failed ? (
              <Card>
                <PaneLoadError
                  module={MODULE}
                  error={source.error ?? translations.error}
                  noun="product"
                  icon={<Icon glyph={faLanguage} className="size-6" aria-hidden />}
                  title="Could not load this product"
                  description={translationErrorMessage(
                    source.error ?? translations.error,
                    'This is a problem reaching the server. None of your wording has been lost.'
                  )}
                  onRetry={refresh}
                />
              </Card>
            ) : (
              <Card>
                <PaneWaiting module={MODULE} />
              </Card>
            )}
          </div>
        </div>
      </ModuleScope>
    );
  }

  return (
    <Editor
      productId={productId}
      product={source.data}
      rows={translations.data}
      isFetching={translations.isFetching}
      dataUpdatedAt={translations.dataUpdatedAt}
      onRefresh={refresh}
    />
  );
}
