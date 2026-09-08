-- AN INVOICE CAN BILL AN ORDER
--
-- A shop that takes no money at checkout — which is every shop with no payment
-- provider connected, and plenty that have one — sends the goods and then has to
-- ask for the money. Until now it could not.
--
-- It could raise an invoice, but only by opening the order, reading the items and
-- retyping every one of them by hand, including a tax rate the shop had already
-- set up properly elsewhere. And when the customer paid that invoice, the ORDER
-- stayed `unpaid` forever, because no column joined the two. The owner was left
-- reconciling by memory.
--
-- `billing_documents.order_id` is that join. Note what it is NOT: the existing
-- `orders.converted_from_document_id` points the other way and means "this order
-- grew out of that QUOTE". This one means "this invoice is asking for the money
-- on that order". Two different facts, two different columns.
--
-- Nullable on purpose. Most invoices are not for an order — a consulting bill, a
-- deposit, a repair — and a shop that takes card at checkout raises none at all.
--
-- ON DELETE SET NULL rather than CASCADE: a finalized invoice is a financial
-- record with statutory retention and must outlive the order it refers to. The
-- same reasoning the `property` FK on this table already carries.

ALTER TABLE "billing_documents" ADD COLUMN "order_id" UUID;

ALTER TABLE "billing_documents"
  ADD CONSTRAINT "billing_documents_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Answers "what has been billed on this order" every time an order pane opens.
CREATE INDEX "billing_documents_tenant_id_order_id_idx"
  ON "billing_documents" ("tenant_id", "order_id");
