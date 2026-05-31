'use client';

// Header / footer / announcement editor. Each slot has a small known field set
// plus, for header/footer, a reference to one of the CMS-owned navigation menus
// (read-only here; edited under /cms/navigation). Saving upserts the slot's
// layout block.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  Heading,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sparx/ui';
import type { SectionField } from '@sparx/sitebuilder-schemas';
import { upsertLayout } from '../_lib/actions';
import type { NavMenuDto, SiteLayoutBlockDto } from '../_lib/types';
import { FieldControl } from './field-control';
import { useEditorCanvas } from './editor-shell';

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

// Sentinel for the Select's "no menu" choice (Radix Select disallows an
// empty-string value).
const NO_MENU = '__none__';

export function LayoutEditor({
  blocks,
  menus,
}: {
  blocks: SiteLayoutBlockDto[];
  menus: NavMenuDto[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {(['announcement', 'header', 'footer'] as Slot[]).map((slot) => (
        <SlotEditor
          key={slot}
          slot={slot}
          block={blocks.find((b) => b.slot === slot)}
          menus={menus}
        />
      ))}
    </div>
  );
}

function SlotEditor({
  slot,
  block,
  menus,
}: {
  slot: Slot;
  block?: SiteLayoutBlockDto;
  menus: NavMenuDto[];
}) {
  const router = useRouter();
  const canvas = useEditorCanvas();
  const [config, setConfig] = React.useState<Record<string, unknown>>(block?.config ?? {});
  const [menuId, setMenuId] = React.useState(block?.navigationMenuId ?? NO_MENU);
  const [pending, startTransition] = React.useTransition();

  const save = () =>
    startTransition(async () => {
      await upsertLayout(slot, {
        config,
        navigationMenuId: HAS_MENU[slot] && menuId !== NO_MENU ? menuId : null,
      });
      router.refresh();
      // Slot config is a structural draft change — reload the live canvas so the
      // header/footer/announcement chrome reflects it (it re-fetches the draft).
      canvas.reload();
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
            <Label>Navigation menu</Label>
            <Select value={menuId} onValueChange={setMenuId}>
              <SelectTrigger aria-label="Navigation menu">
                <SelectValue placeholder="No menu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MENU}>No menu</SelectItem>
                {menus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · /{m.location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button className="self-start" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  );
}
