'use client';

// The signing secret in a box. `onCopy` is present only when the value is the
// real, full secret — copying a redacted preview is pointless.

import { Button } from '@wizeworks/silicaui-react';
import { faCopy } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';

export function WebhookSecret({ value, onCopy }: { value: string; onCopy?: () => void }) {
  return (
    <div className="border-base-300 bg-base-200 flex items-center gap-2 rounded-md border p-3">
      <code className="min-w-0 flex-1 font-mono text-sm break-all">{value}</code>
      {onCopy ? (
        <Button size="sm" variant="soft" color="module" className="shrink-0" onClick={onCopy}>
          <Icon glyph={faCopy} className="size-4" aria-hidden />
          Copy
        </Button>
      ) : null}
    </div>
  );
}
