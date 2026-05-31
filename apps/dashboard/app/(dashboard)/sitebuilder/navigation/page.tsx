import Link from 'next/link';
import { Button, Heading, Stack, Text } from '@sparx/ui';
import { ArrowRight } from 'lucide-react';
import { listLayout, listMenus } from '../_lib/api';
import { LayoutEditor } from '../_components/layout-editor';

// Site Builder owns the layout SLOTS — header, footer, and announcement bar
// appearance plus which navigation menu fills the header/footer. The menus
// themselves are CMS-owned content (docs/30 §8): this page reads them read-only
// to populate the slot picker and links out to the CMS to edit the trees.

export const dynamic = 'force-dynamic';

export default async function LayoutSlotsPage() {
  const [blocks, menus] = await Promise.all([listLayout(), listMenus()]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Heading level={1}>Header, footer &amp; announcement</Heading>
        <Text variant="muted">
          Appearance for each layout slot, plus which menu the header and footer use. Publish from
          Design or Homepage to go live.
        </Text>
      </div>

      <LayoutEditor blocks={blocks} menus={menus} />

      <Stack
        direction="row"
        align="center"
        justify="between"
        gap={3}
        className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4"
      >
        <Stack gap={1}>
          <Heading level={4}>Edit menu trees</Heading>
          <Text size="sm" variant="muted">
            Menu items live in the CMS. Add or reorder links there, then bind a menu to a slot
            above.
          </Text>
        </Stack>
        <Button asChild variant="ghost" size="sm">
          <Link href="/cms/navigation">
            Open navigation
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </Stack>
    </div>
  );
}
