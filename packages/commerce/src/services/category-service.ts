// categoryService — nested category tree (ltree-backed). collectionService
// is the merchandising sibling.

import type {
  CreateCategoryInput,
  ReparentCategoryInput,
  UpdateCategoryInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export interface CategoryTreeNode {
  id: string;
  name: string;
  handle: string;
  parentId: string | null;
  path: string; // ltree representation
  productCount: number;
  position: number;
  children: CategoryTreeNode[];
}

export function tree(_ctx: ServiceContext): Promise<CategoryTreeNode[]> {
  return notImplemented('categoryService.tree');
}

export function get(_ctx: ServiceContext, _categoryId: string): Promise<unknown> {
  return notImplemented('categoryService.get');
}

export function getByHandle(_ctx: ServiceContext, _handle: string): Promise<unknown> {
  return notImplemented('categoryService.getByHandle');
}

export function create(
  _ctx: ServiceContext,
  _input: CreateCategoryInput
): Promise<{ id: string; handle: string }> {
  return notImplemented('categoryService.create');
}

export function update(
  _ctx: ServiceContext,
  _categoryId: string,
  _input: UpdateCategoryInput
): Promise<void> {
  return notImplemented('categoryService.update');
}

export function reparent(_ctx: ServiceContext, _input: ReparentCategoryInput): Promise<void> {
  return notImplemented('categoryService.reparent');
}

export function remove(_ctx: ServiceContext, _categoryId: string): Promise<void> {
  return notImplemented('categoryService.remove');
}
