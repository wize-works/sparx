'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@sparx/ui';

export function PageSlugForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [slug, setSlug] = React.useState(initial);

  const go = () => {
    const clean = slug.trim().replace(/^\/+|\/+$/g, '');
    if (clean) router.push(`/sitebuilder/pages?page=${encodeURIComponent(clean)}`);
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="sb-page-slug">Page slug</Label>
        <Input
          id="sb-page-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="e.g. about, lookbook, deals"
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
      </div>
      <Button onClick={go} disabled={!slug.trim()}>
        Edit sections
      </Button>
    </div>
  );
}
