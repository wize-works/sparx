import Link from 'next/link';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { CmsTabs } from '../../_components/cms-tabs';
import { MenuEditor, type EditableMenuItem } from './menu-editor';

export const dynamic = 'force-dynamic';

interface ApiMenuItem {
  id: string;
  label: string;
  entry_id: string | null;
  external_url: string | null;
  open_in_new_tab: boolean;
  parent_item_id: string | null;
  position: number;
}

interface ApiMenu {
  id: string;
  location: string;
  name: string;
  items: ApiMenuItem[];
}

interface PageParams {
  params: Promise<{ location: string }>;
}

// Flatten DB rows back into the nested tree the editor + PUT body expect.
function buildTree(items: ApiMenuItem[]): EditableMenuItem[] {
  const byParent = new Map<string | null, ApiMenuItem[]>();
  for (const item of items) {
    const arr = byParent.get(item.parent_item_id) ?? [];
    arr.push(item);
    byParent.set(item.parent_item_id, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.position - b.position);
  }
  const recurse = (parentId: string | null): EditableMenuItem[] =>
    (byParent.get(parentId) ?? []).map((row) => ({
      uid: row.id,
      label: row.label,
      kind: row.entry_id ? 'entry' : 'external',
      entryId: row.entry_id,
      externalUrl: row.external_url,
      openInNewTab: row.open_in_new_tab,
      children: recurse(row.id),
    }));
  return recurse(null);
}

export default async function EditNavigationMenuPage({ params }: PageParams) {
  const { location } = await params;

  let menu: ApiMenu | null = null;
  try {
    menu = await api.get<ApiMenu>(`/v1/navigation/menus/${encodeURIComponent(location)}`);
  } catch (err) {
    if ((err as ApiRestError).status !== 404) throw err;
  }

  const initialItems = menu ? buildTree(menu.items) : [];
  const initialName = menu?.name ?? defaultName(location);

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="navigation" />
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/cms/navigation">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to navigation
            </Link>
          </Button>
          <Heading level={1}>
            {menu ? 'Edit' : 'Create'} <code>/{location}</code> menu
          </Heading>
          <Text variant="muted">
            Each item must link to either a published entry by ID or an external URL — not both.
            Drag-and-drop landing later; use the move buttons for now.
          </Text>
        </Stack>

        <MenuEditor location={location} initialName={initialName} initialItems={initialItems} />
      </Stack>
    </Container>
  );
}

function defaultName(location: string): string {
  return location.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
