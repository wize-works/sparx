// Mutating MCP tools. Each requires confirmation per docs/07 §5; the
// MCP server surfaces a confirmation prompt before invoking.

import { z } from 'zod';

import {
  AdjustInventoryInput,
  ApproveReturnInput,
  BulkUpdateProductStatusInput,
  CancelSubscriptionInput,
  GrantStoreCreditInput,
  IssueGiftCardInput,
  ModerateReviewInput,
  PauseSubscriptionInput,
  ResumeSubscriptionInput,
} from '@sparx/commerce-schemas';

import {
  discountService,
  inventoryService,
  productService,
  returnService,
  reviewService,
  subscriptionService,
} from '../services';
import type { AnyMcpTool, McpToolDefinition } from './registry';

const updateInventory: McpToolDefinition = {
  name: 'update_inventory',
  description: 'Adjust on-hand quantity for a variant at a warehouse.',
  scope: 'write:commerce',
  confirmation: true,
  input: AdjustInventoryInput,
  run: (ctx, input) => inventoryService.adjust(ctx, input),
};

const publishProduct: McpToolDefinition = {
  name: 'publish_product',
  description: 'Move a product to active status (visible in storefront).',
  scope: 'write:commerce',
  confirmation: true,
  input: z.object({ productId: z.string().uuid() }),
  run: (ctx, input) => productService.publish(ctx, (input as { productId: string }).productId),
};

const archiveProduct: McpToolDefinition = {
  name: 'archive_product',
  description: 'Archive a product (removes from storefront, preserves history).',
  scope: 'write:commerce',
  confirmation: true,
  input: z.object({ productId: z.string().uuid() }),
  run: (ctx, input) => productService.archive(ctx, (input as { productId: string }).productId),
};

const bulkUpdateProductStatus: McpToolDefinition = {
  name: 'bulk_update_product_status',
  description: 'Set the status of up to 1000 products in a single call.',
  scope: 'write:commerce_bulk',
  confirmation: true,
  input: BulkUpdateProductStatusInput,
  run: (ctx, input) => productService.bulkUpdateStatus(ctx, input),
};

const issueGiftCard: McpToolDefinition = {
  name: 'issue_gift_card',
  description: 'Issue a gift card with an initial balance.',
  scope: 'write:commerce',
  confirmation: true,
  input: IssueGiftCardInput,
  run: (ctx, input) => discountService.issueGiftCard(ctx, input),
};

const grantStoreCredit: McpToolDefinition = {
  name: 'grant_store_credit',
  description: "Add to a customer's store credit balance.",
  scope: 'write:commerce',
  confirmation: true,
  input: GrantStoreCreditInput,
  run: (ctx, input) => discountService.grantStoreCredit(ctx, input),
};

const pauseSubscription: McpToolDefinition = {
  name: 'pause_subscription',
  description: 'Pause a subscription (no charges until resumed).',
  scope: 'write:commerce',
  confirmation: true,
  input: PauseSubscriptionInput,
  run: (ctx, input) => subscriptionService.pause(ctx, input),
};

const resumeSubscription: McpToolDefinition = {
  name: 'resume_subscription',
  description: 'Resume a paused subscription.',
  scope: 'write:commerce',
  confirmation: true,
  input: ResumeSubscriptionInput,
  run: (ctx, input) => subscriptionService.resume(ctx, input),
};

const cancelSubscription: McpToolDefinition = {
  name: 'cancel_subscription',
  description: 'Cancel a subscription (at period end or immediately).',
  scope: 'write:commerce',
  confirmation: true,
  input: CancelSubscriptionInput,
  run: (ctx, input) => subscriptionService.cancel(ctx, input),
};

const approveReturn: McpToolDefinition = {
  name: 'approve_return',
  description: 'Approve a return request, optionally generating a label.',
  scope: 'write:commerce',
  confirmation: true,
  input: ApproveReturnInput,
  run: (ctx, input) => returnService.approve(ctx, input),
};

const moderateReview: McpToolDefinition = {
  name: 'moderate_review',
  description: 'Approve, reject, or flag a product review.',
  scope: 'write:commerce',
  confirmation: true,
  input: ModerateReviewInput,
  run: (ctx, input) => reviewService.moderate(ctx, input as never),
};

export const writeTools: AnyMcpTool[] = [
  updateInventory,
  publishProduct,
  archiveProduct,
  bulkUpdateProductStatus,
  issueGiftCard,
  grantStoreCredit,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  approveReturn,
  moderateReview,
];
