// Renders one CMS page entry. Pulls the rich-text body through
// @sparx/cms-editor's serializer, which sanitizes and resolves blocks
// (callouts, embeds, code, tables) into safe HTML. Anything outside
// `body.content` falls through to a small default title heading.

import { renderDocToHtml } from '@sparx/cms-editor';
import type { ApiEntry, PageBody } from '@/lib/content';

export interface PageViewProps {
  entry: ApiEntry<PageBody>;
}

export function PageView({ entry }: PageViewProps) {
  const body = entry.body;
  const title = typeof body.title === 'string' ? body.title : undefined;
  const doc = body.content;
  const html = doc ? renderDocToHtml(doc) : '';

  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '4rem 1.5rem',
      }}
    >
      {entry.status !== 'published' && <PreviewBadge status={entry.status} />}
      {title && (
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            margin: '0 0 1.5rem',
          }}
        >
          {title}
        </h1>
      )}
      <article className="sparx-content" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

function PreviewBadge({ status }: { status: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.35rem 0.75rem',
        borderRadius: '9999px',
        background: 'var(--color-warning, #f59e0b)',
        color: '#0a0a0a',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        marginBottom: '1.5rem',
      }}
    >
      Preview · {status}
    </div>
  );
}
