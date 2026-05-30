// Small helpers shared across Site Builder section components.

import Link from 'next/link';

/** True for an absolute external URL; internal links start with "/". */
function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** A CTA/link that uses next/link for internal paths and a plain anchor (with
 *  safe rel) for external URLs. Renders nothing when label or url is empty. */
export function SbLink({
  url,
  label,
  className,
}: {
  url: string;
  label: string;
  className?: string;
}) {
  if (!url || !label) return null;
  if (isExternal(url)) {
    return (
      <a href={url} className={className} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  return (
    <Link href={url} className={className}>
      {label}
    </Link>
  );
}
