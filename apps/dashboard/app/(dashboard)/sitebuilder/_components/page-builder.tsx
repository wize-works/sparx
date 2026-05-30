'use client';

// Splits a page builder into the section editor (left) and a live storefront
// preview (right). Each section mutation bumps a nonce so the preview reloads
// to reflect the freshly-saved draft.

import * as React from 'react';
import type { SiteSectionDto } from '../_lib/types';
import { SectionBuilder } from './section-builder';
import { PreviewFrame } from './preview-frame';

export interface PageBuilderProps {
  pageKey: string;
  sections: SiteSectionDto[];
  storefrontUrl: string;
  slug: string;
  /** Storefront path this page renders at ("/" for home, "/<slug>" otherwise). */
  previewPath?: string;
}

export function PageBuilder({
  pageKey,
  sections,
  storefrontUrl,
  slug,
  previewPath = '/',
}: PageBuilderProps) {
  const [nonce, setNonce] = React.useState(0);
  const bumpPreview = React.useCallback(() => setNonce((n) => n + 1), []);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_1fr]">
      <div className="flex max-h-[calc(100vh-220px)] flex-col gap-3 overflow-y-auto pr-1">
        <SectionBuilder pageKey={pageKey} sections={sections} onMutate={bumpPreview} />
      </div>
      <PreviewFrame
        storefrontUrl={storefrontUrl}
        slug={slug}
        path={previewPath}
        refreshKey={nonce}
      />
    </div>
  );
}
