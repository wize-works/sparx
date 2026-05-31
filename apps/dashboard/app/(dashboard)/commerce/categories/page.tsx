import { FolderTree, Plus } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { CategoriesEditor, NewCategoryForm } from './_components/categories-editor';

interface CategoryTreeNode {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parentId: string | null;
  path: string;
  position: number;
  featured: boolean;
  iconMediaId: string | null;
  heroMediaId: string | null;
  productCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  createdAt: string;
  updatedAt: string;
  depth: number;
  children: CategoryTreeNode[];
}

// Categories — nested tree editor. Categories are the organizational
// taxonomy ("Auto Parts > Engine > Fuel Injection"); the merchandising
// surface (Featured, New for Spring, etc.) lives in /commerce/collections.
//
// A product can sit in many categories but exactly one is canonical.
// The tree editor lets merchants create / rename / reparent / delete
// categories with optimistic UI; the server enforces handle uniqueness,
// cycle prevention, and the rule that you must remove descendants before
// the parent.

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const tree = await api.get<CategoryTreeNode[]>('/v1/commerce/categories');

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <FolderTree className="h-5 w-5" />
              <Heading level={1}>Categories</Heading>
              <Badge color="module">
                {countTree(tree)} categor{countTree(tree) === 1 ? 'y' : 'ies'}
              </Badge>
            </Stack>
            <Text variant="muted">
              The organizational tree your shoppers browse. Drag-free for now: nest with the parent
              picker, reorder with the position field. Storefront URLs follow the category&apos;s
              path (<code>/category/&lt;handle&gt;</code>).
            </Text>
          </Stack>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>Tree</Heading>
              <CardDescription>
                Each row shows depth, product count, and inline edit / delete affordances. New
                categories add at the bottom of the chosen parent.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {tree.length === 0 ? (
              <EmptyState
                icon={<FolderTree className="h-5 w-5" />}
                title="No categories yet"
                description="Start with a few top-level categories that match how shoppers browse your storefront."
              />
            ) : (
              <CategoriesEditor tree={tree} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Stack direction="row" align="center" gap={2}>
              <Plus className="h-4 w-4 text-[var(--module-active)]" />
              <Heading level={3}>New category</Heading>
            </Stack>
          </CardHeader>
          <CardContent>
            <NewCategoryForm tree={tree} />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}

function countTree(nodes: CategoryTreeNode[]): number {
  let total = 0;
  function walk(list: CategoryTreeNode[]): void {
    for (const node of list) {
      total++;
      walk(node.children);
    }
  }
  walk(nodes);
  return total;
}
