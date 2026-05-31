import { Heading, Stack, Text } from '@sparx/ui';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { MenuEditor, type EditableMenuItem } from './menu-editor';

// Detail content for a CMS navigation menu. Mounted by both the full-page
// route and the dashboard shell's drawer / modal. The "id" passed in
// is the menu location (e.g. 'header', 'footer'), not a UUID — menus are keyed
// by location, one per location per tenant. Items can link to a published CMS
// entry or an external URL.

export const dynamic = 'force-dynamic';

interface ApiMenuItem {
  id: string;
  label: string;
  entryId: string | null;
  externalUrl: string | null;
  openInNewTab: boolean;
  parentItemId: string | null;
  position: number;
}

interface ApiMenu {
  id: string;
  location: string;
  name: string;
  items: ApiMenuItem[];
}

interface ApiEntrySummary {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: { title?: string } & Record<string, unknown>;
}

function buildTree(items: ApiMenuItem[]): EditableMenuItem[] {
  const byParent = new Map<string | null, ApiMenuItem[]>();
  for (const item of items) {
    const arr = byParent.get(item.parentItemId) ?? [];
    arr.push(item);
    byParent.set(item.parentItemId, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.position - b.position);
  }
  const recurse = (parentId: string | null): EditableMenuItem[] =>
    (byParent.get(parentId) ?? []).map((row) => ({
      uid: row.id,
      label: row.label,
      kind: row.entryId ? 'entry' : 'external',
      entryId: row.entryId,
      externalUrl: row.externalUrl,
      openInNewTab: row.openInNewTab,
      children: recurse(row.id),
    }));
  return recurse(null);
}

interface Props {
  /** The menu's `location` (e.g. 'header', 'footer'). */
  id: string;
}

export async function MenuDetailContent({ id: location }: Props) {
  let menu: ApiMenu | null = null;
  try {
    menu = await api.get<ApiMenu>(`/v1/navigation/menus/${encodeURIComponent(location)}`);
  } catch (err) {
    if ((err as ApiRestError).status !== 404) throw err;
  }

  let entryChoices: ApiEntrySummary[] = [];
  try {
    entryChoices = await api.get<ApiEntrySummary[]>(
      '/v1/content/entries?status=published&limit=200'
    );
  } catch {
    entryChoices = [];
  }

  const initialItems = menu ? buildTree(menu.items) : [];
  const initialName = menu?.name ?? defaultName(location);

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading level={1}>
          {menu ? 'Edit' : 'Create'} <code>/{location}</code> menu
        </Heading>
        <Text variant="muted">
          Each item must link to either a published entry or an external URL — not both. Use the
          move buttons to reorder.
        </Text>
      </Stack>

      <MenuEditor
        location={location}
        initialName={initialName}
        initialItems={initialItems}
        entryChoices={entryChoices.map((e) => ({
          id: e.id,
          typeKey: e.type_key,
          slug: e.slug,
          title: typeof e.body.title === 'string' ? e.body.title : (e.slug ?? '(untitled)'),
        }))}
      />
    </Stack>
  );
}

function defaultName(location: string): string {
  return location.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
