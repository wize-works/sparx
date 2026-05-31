'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button } from '@sparx/ui';
import { selectTheme } from '../_lib/actions';
import type { ThemeDto } from '../_lib/types';

const SWATCH_KEYS = ['colorPrimary', 'colorAccent', 'colorBackground', 'colorForeground'];

export function ThemeGallery({ themes, current }: { themes: ThemeDto[]; current: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState(current);

  const apply = (key: string) => {
    setSelected(key);
    startTransition(async () => {
      await selectTheme(key);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {themes.map((t) => {
        const isCurrent = t.key === selected;
        return (
          <div
            key={t.key}
            className="flex flex-col gap-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-default)] p-4"
          >
            <div className="flex h-20 overflow-hidden rounded-lg">
              {SWATCH_KEYS.map((k) => (
                <div
                  key={k}
                  className="flex-1"
                  style={{ backgroundColor: (t.tokenDefaults.light as Record<string, string>)[k] }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--color-text-primary)]">{t.name}</span>
              <Badge variant="outline">{t.category}</Badge>
            </div>
            <p className="min-h-[2.5rem] text-sm text-[var(--color-text-muted)]">{t.description}</p>
            <Button
              color={isCurrent ? 'neutral' : 'primary'}
              variant={isCurrent ? 'outline' : 'solid'}
              disabled={pending || isCurrent}
              onClick={() => apply(t.key)}
            >
              {isCurrent ? 'Current theme' : 'Apply theme'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
