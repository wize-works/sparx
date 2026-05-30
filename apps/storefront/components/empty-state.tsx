// Friendly empty state with an icon, title, copy, and optional CTA.

import Link from 'next/link';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="sf-empty">
      {icon ? (
        <span className="sf-empty__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="sf-h3" style={{ color: 'var(--sf-text)' }}>
        {title}
      </h3>
      {description ? <p style={{ margin: 0, maxWidth: '40ch' }}>{description}</p> : null}
      {action ? (
        <Link href={action.href} className="sf-btn sf-btn--primary" style={{ marginTop: '0.5rem' }}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
