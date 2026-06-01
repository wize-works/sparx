'use client';

// The Layouts editor for a bound scope — a product or collection page layout
// (Phase 3 §7, §13.1; sample-data preview doc 36 §9). Wraps the shared
// SectionBuilder with what the bound scopes need beyond home/pages:
//
//   • an ALWAYS-ON sample-data preview — the canvas binds to fixed sample
//     product/collection data (via the `sparxSampleData` flag) so the bound
//     sections render against believable data whether or not the store has any
//     products yet. Consistent by design: the merchant designs the same way on
//     day one and later. This component owns the canvas path + sample flag while
//     the scope is open, and clears the flag on the way out.
//   • the explicit "Customize this layout" gate — a never-customized scope has
//     NO template rows; we show the seeded code default read-only with a CTA.
//     Clicking it materializes the default into real sections and drops into the
//     normal editor (router.refresh re-renders the route with a pageLayoutId).

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Text } from '@sparx/ui';
import { Sparkles } from 'lucide-react';
import { DEFAULT_TEMPLATES, SECTION_REGISTRY } from '@sparx/sitebuilder-schemas';
import { materializeLayout } from '../_lib/actions';
import type { SiteSectionDto } from '../_lib/types';
import { SectionBuilder } from './section-builder';
import { useEditorCanvas } from './editor-shell';

type BoundTarget = 'commerce:product' | 'commerce:collection';

export interface LayoutScopeEditorProps {
  targetId: BoundTarget;
  /** The materialized layout, or null when the target is still on the seeded
   *  default (never customized). */
  pageLayoutId: string | null;
  sections: SiteSectionDto[];
}

export function LayoutScopeEditor({ targetId, pageLayoutId, sections }: LayoutScopeEditorProps) {
  const canvas = useEditorCanvas();
  const base = targetId === 'commerce:product' ? '/products' : '/collections';
  const noun = targetId === 'commerce:product' ? 'product' : 'collection';

  // Always preview against sample data: point the canvas at the bound route and
  // turn on the sample flag while this scope is open; clear it on the way out so
  // other scopes (home, pages) aren't affected. The handle is cosmetic — the
  // storefront skips the catalog fetch and uses the sample fixture.
  React.useEffect(() => {
    canvas.setSampleData(true);
    canvas.setPreviewPath(`${base}/sample`);
    return () => canvas.setSampleData(false);
  }, [canvas, base]);

  return (
    <div className="flex flex-col gap-4">
      <Text size="sm" variant="muted">
        Previewing with sample {noun} data, so you can design this layout before you have real{' '}
        {noun}s — every {noun} page renders through it.
      </Text>
      {pageLayoutId ? (
        <SectionBuilder
          pageLayoutId={pageLayoutId}
          targetId={targetId}
          sections={sections}
          manageCanvasPath={false}
        />
      ) : (
        <DefaultLayoutIntro targetId={targetId} />
      )}
    </div>
  );
}

function DefaultLayoutIntro({ targetId }: { targetId: BoundTarget }) {
  const router = useRouter();
  const canvas = useEditorCanvas();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const noun = targetId === 'commerce:product' ? 'product' : 'collection';
  const defaults = DEFAULT_TEMPLATES[targetId];

  const customize = () => {
    setError(null);
    startTransition(async () => {
      const res = await materializeLayout({ targetId });
      if (!res.ok) setError(res.error ?? 'Could not start customizing.');
      else {
        router.refresh();
        canvas.reload();
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Default {noun} layout
            </h2>
            <Text size="sm" variant="muted">
              Every {noun} page uses this layout. Customize it to reorder, hide, or add sections —
              your changes apply to all {noun} pages.
            </Text>
          </div>
          <Button
            leftIcon={<Sparkles className="h-4 w-4" />}
            onClick={customize}
            disabled={pending}
          >
            {pending ? 'Starting…' : 'Customize this layout'}
          </Button>
        </div>
        {error ? <span className="text-sm text-[var(--color-text-danger)]">{error}</span> : null}
      </div>

      <ul className="flex flex-col gap-2">
        {defaults.map((d, i) => {
          const def = SECTION_REGISTRY[d.sectionType];
          return (
            <li
              key={`${d.sectionType}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-default)] px-3 py-2.5 opacity-90"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {def.label}
                  {def.binding ? (
                    <Badge color="module" variant="soft" size="sm">
                      Bound
                    </Badge>
                  ) : null}
                </span>
                <span className="truncate text-xs text-[var(--color-text-muted)]">
                  {def.description}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
