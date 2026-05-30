import Link from 'next/link';
import { Button, Container, Heading, Stack, Text } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { CmsTabs } from '../../_components/cms-tabs';
import { MenuEditor, type EditableMenuItem } from './menu-editor';

export const dynamic = 'force-dynamic';

// IMPORTANT wire-shape note: /v1/navigation/menus and /v1/navigation/menus/:loc
// return the raw Prisma rows (no serializer), so field names are camelCase —
// NOT the snake_case convention the rest of api-rest uses. A previous version
// of this interface declared snake_case keys, which silently degenerated the
// tree builder (every item grouped under `undefined`, so menus always
// rendered empty). Audit UX-11 surfaced this as a count-mismatch between
// the menu listing (using `items.length`, which still worked) and the
// editor's top-level count (which collapsed to 0 because grouping by
// `undefined` never matches `null`).
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

interface PageParams {
  params: Promise<{ location: string }>;
}

// Flatten DB rows back into the nested tree the editor + PUT body expect.
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

export default async function EditNavigationMenuPage({ params }: PageParams) {
  const { location } = await params;

  let menu: ApiMenu | null = null;
  try {
    menu = await api.get<ApiMenu>(`/v1/navigation/menus/${encodeURIComponent(location)}`);
  } catch (err) {
    if ((err as ApiRestError).status !== 404) throw err;
  }

  // Load a shortlist of published entries so the menu editor can offer a
  // proper picker instead of forcing editors to hand-paste UUIDs (F-12).
  // 200 caps the list — plenty for the menu builder's typical needs; if a
  // tenant has more, the editor can keep typing the UUID directly as fallback.
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
    </Container>
  );
}

function defaultName(location: string): string {
  return location.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
