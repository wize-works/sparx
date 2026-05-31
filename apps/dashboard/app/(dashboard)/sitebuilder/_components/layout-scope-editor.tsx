'use client';

// The Layouts editor for a bound scope — a product or collection page layout
// (Phase 3 §7, §13.1). Wraps the shared SectionBuilder with two things the bound
// scopes need that home/pages don't:
//
//   • a sample-item picker — the canvas binds the live preview to a REAL
//     product/collection so the bound sections render against actual data; the
//     choice is editor-local (a UI preference), default = first item. This
//     component owns the canvas path (SectionBuilder runs with
//     manageCanvasPath={false}), so swapping the sample re-points the preview.
//   • the explicit "Customize this layout" gate — a never-customized scope has
//     NO template rows; we show the seeded code default read-only with a CTA.
//     Clicking it materializes the default into real sections and drops into the
//     normal editor (router.refresh re-renders the route with a templateId).

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, NativeSelect, Text } from '@sparx/ui';
import { Sparkles } from 'lucide-react';
import { DEFAULT_TEMPLATES, SECTION_REGISTRY } from '@sparx/sitebuilder-schemas';
import { materializeTemplate } from '../_lib/actions';
import type { SampleItem, SiteSectionDto } from '../_lib/types';
import { SectionBuilder } from './section-builder';
import { useEditorCanvas } from './editor-shell';

type BoundScope = 'product' | 'collection';

export interface LayoutScopeEditorProps {
  scope: BoundScope;
  /** The materialized template, or null when the scope is still on the seeded
   *  default (never customized). */
  templateId: string | null;
  sections: SiteSectionDto[];
  samples: SampleItem[];
}

export function LayoutScopeEditor({
  scope,
  templateId,
  sections,
  samples,
}: LayoutScopeEditorProps) {
  const canvas = useEditorCanvas();
  const [handle, setHandle] = React.useState(samples[0]?.handle ?? '');

  const base = scope === 'product' ? '/products' : '/collections';
  // With a sample, preview the real PDP/PLP; without one, fall back to the
  // catalog listing (product/collection context) rather than the marketing home.
  const previewPath = handle ? `${base}/${handle}` : base;

  // This component owns the canvas path for bound scopes (the sample drives it).
  React.useEffect(() => {
    canvas.setPreviewPath(previewPath);
  }, [canvas, previewPath]);

  return (
    <div className="flex flex-col gap-4">
      <SamplePicker scope={scope} samples={samples} value={handle} onChange={setHandle} />
      {templateId ? (
        <SectionBuilder
          templateId={templateId}
          scope={scope}
          sections={sections}
          manageCanvasPath={false}
        />
      ) : (
        <DefaultLayoutIntro scope={scope} />
      )}
    </div>
  );
}

function SamplePicker({
  scope,
  samples,
  value,
  onChange,
}: {
  scope: BoundScope;
  samples: SampleItem[];
  value: string;
  onChange: (handle: string) => void;
}) {
  const noun = scope === 'product' ? 'product' : 'collection';

  if (samples.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border-default)] px-3 py-2.5">
        <Text size="sm" variant="muted">
          No published {noun} yet, so the preview shows your {noun} catalog. Publish a {noun} to
          preview this layout against real {noun} data — you can edit the section list either way.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Text size="sm" variant="muted" className="shrink-0">
        Preview against
      </Text>
      <NativeSelect
        size="sm"
        className="w-auto min-w-48"
        aria-label={`Sample ${noun} to preview`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {samples.map((s) => (
          <option key={s.handle} value={s.handle}>
            {s.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function DefaultLayoutIntro({ scope }: { scope: BoundScope }) {
  const router = useRouter();
  const canvas = useEditorCanvas();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const noun = scope === 'product' ? 'product' : 'collection';
  const defaults = DEFAULT_TEMPLATES[scope];

  const customize = () => {
    setError(null);
    startTransition(async () => {
      const res = await materializeTemplate({ scope });
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
