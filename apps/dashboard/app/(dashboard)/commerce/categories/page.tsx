import { FolderTree, PackageOpen, Plus } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { categoryService } from '@sparx/commerce';
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

import { ModuleStub } from '../../../../components/module-stub';

import { CategoriesEditor, NewCategoryForm } from './_components/categories-editor';

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
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Categories organize your catalog."
        description="Activate the Commerce module from Billing to start adding categories."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const tree = await categoryService.tree(ctx);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <FolderTree className="h-5 w-5" />
              <Heading level={1}>Categories</Heading>
              <Badge variant="module">
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

function countTree(nodes: Awaited<ReturnType<typeof categoryService.tree>>): number {
  let total = 0;
  function walk(list: typeof nodes): void {
    for (const node of list) {
      total++;
      walk(node.children);
    }
  }
  walk(nodes);
  return total;
}
