'use client';

// Header / footer / announcement editor. Each slot has a small known field set
// plus an optional reference to a CMS navigation menu (sitebuilder only points
// at menus — the CMS owns editing them). Saving upserts the slot's layout block.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Heading, Input, Label, Text } from '@sparx/ui';
import type { SectionField } from '@sparx/sitebuilder-schemas';
import { upsertLayout } from '../_lib/actions';
import type { SiteLayoutBlockDto } from '../_lib/types';
import { FieldControl } from './field-control';

type Slot = 'header' | 'footer' | 'announcement';

const FIELDS: Record<Slot, SectionField[]> = {
  announcement: [
    { key: 'enabled', label: 'Show announcement bar', type: 'boolean' },
    { key: 'text', label: 'Text', type: 'text' },
    { key: 'linkUrl', label: 'Link (optional)', type: 'url' },
  ],
  header: [
    { key: 'sticky', label: 'Sticky header', type: 'boolean' },
    { key: 'showSearch', label: 'Show search', type: 'boolean' },
    {
      key: 'logoPlacement',
      label: 'Logo placement',
      type: 'select',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
      ],
    },
  ],
  footer: [
    { key: 'copyright', label: 'Copyright text', type: 'text' },
    { key: 'showPaymentIcons', label: 'Show payment icons', type: 'boolean' },
  ],
};

const HAS_MENU: Record<Slot, boolean> = { header: true, footer: true, announcement: false };

export function LayoutEditor({ blocks }: { blocks: SiteLayoutBlockDto[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Card variant="module" padding="md">
        <Text size="xs" variant="muted">
          Menus
        </Text>
        <Text variant="muted">
          Header and footer menus are managed in the CMS.{' '}
          <Link href="/cms/navigation" className="text-[var(--module-active)] hover:underline">
            Edit navigation menus →
          </Link>
        </Text>
      </Card>

      {(['announcement', 'header', 'footer'] as Slot[]).map((slot) => (
        <SlotEditor key={slot} slot={slot} block={blocks.find((b) => b.slot === slot)} />
      ))}
    </div>
  );
}

function SlotEditor({ slot, block }: { slot: Slot; block?: SiteLayoutBlockDto }) {
  const router = useRouter();
  const [config, setConfig] = React.useState<Record<string, unknown>>(block?.config ?? {});
  const [menuId, setMenuId] = React.useState(block?.navigationMenuId ?? '');
  const [pending, startTransition] = React.useTransition();

  const save = () =>
    startTransition(async () => {
      await upsertLayout(slot, {
        config,
        navigationMenuId: HAS_MENU[slot] && menuId ? menuId : null,
      });
      router.refresh();
    });

  return (
    <Card variant="module" padding="md">
      <Heading level={3} className="capitalize">
        {slot}
      </Heading>
      <div className="mt-3 flex flex-col gap-4">
        {FIELDS[slot].map((f) => (
          <FieldControl
            key={f.key}
            field={f}
            value={config[f.key]}
            onChange={(v) => setConfig((c) => ({ ...c, [f.key]: v }))}
          />
        ))}
        {HAS_MENU[slot] ? (
          <div className="flex flex-col gap-1.5">
            <Label>Navigation menu id (optional)</Label>
            <Input value={menuId} onChange={(e) => setMenuId(e.target.value)} placeholder="menu uuid" />
          </div>
        ) : null}
        <Button className="self-start" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  );
}
