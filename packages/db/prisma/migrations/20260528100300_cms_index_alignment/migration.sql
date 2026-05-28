-- AlterTable
ALTER TABLE "webhook_subscriptions" ALTER COLUMN "events" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "content_entries_tenant_id_scheduled_at_idx" ON "content_entries"("tenant_id", "scheduled_at");

-- RenameIndex
ALTER INDEX "content_entries_tenant_status_published_at_idx" RENAME TO "content_entries_tenant_id_status_published_at_idx";

-- RenameIndex
ALTER INDEX "content_entries_tenant_type_slug_key" RENAME TO "content_entries_tenant_id_type_key_slug_key";

-- RenameIndex
ALTER INDEX "content_entries_tenant_type_status_idx" RENAME TO "content_entries_tenant_id_type_key_status_idx";

-- RenameIndex
ALTER INDEX "content_entries_tenant_updated_at_idx" RENAME TO "content_entries_tenant_id_updated_at_idx";

-- RenameIndex
ALTER INDEX "content_references_tenant_from_idx" RENAME TO "content_references_tenant_id_from_entry_id_idx";

-- RenameIndex
ALTER INDEX "content_references_tenant_to_asset_idx" RENAME TO "content_references_tenant_id_to_asset_id_idx";

-- RenameIndex
ALTER INDEX "content_references_tenant_to_entry_idx" RENAME TO "content_references_tenant_id_to_entry_id_idx";

-- RenameIndex
ALTER INDEX "content_revisions_tenant_entry_created_idx" RENAME TO "content_revisions_tenant_id_entry_id_created_at_idx";

-- RenameIndex
ALTER INDEX "entry_taxonomy_terms_tenant_term_idx" RENAME TO "entry_taxonomy_terms_tenant_id_term_id_idx";

-- RenameIndex
ALTER INDEX "preview_tokens_tenant_entry_idx" RENAME TO "preview_tokens_tenant_id_entry_id_idx";

-- RenameIndex
ALTER INDEX "taxonomy_terms_tenant_taxonomy_idx" RENAME TO "taxonomy_terms_tenant_id_taxonomy_id_idx";

-- RenameIndex
ALTER INDEX "webhook_deliveries_subscription_created_idx" RENAME TO "webhook_deliveries_subscription_id_created_at_idx";

-- RenameIndex
ALTER INDEX "webhook_deliveries_tenant_status_next_attempt_idx" RENAME TO "webhook_deliveries_tenant_id_status_next_attempt_at_idx";

-- RenameIndex
ALTER INDEX "webhook_subscriptions_tenant_active_idx" RENAME TO "webhook_subscriptions_tenant_id_active_idx";
