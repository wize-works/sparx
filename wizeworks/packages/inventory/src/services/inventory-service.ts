// Service-layer barrel. The inventory service was split by concern
// (warehouses · levels · movement ledger · reservations · lots/serials); this
// file re-exports the public API under one surface so `inventoryService.*` keeps
// the exact shape it had pre-split and the package index can re-export the row
// types from here. The single onHand writer is `applyMovement` in ./ledger —
// every mutation path below routes through it.

// ─── Warehouses ───────────────────────────────────────────────────────
export {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  archiveWarehouse,
  bootstrapDefaultWarehouse,
} from './warehouses';
export type { WarehouseRow } from './warehouses';

// ─── Inventory levels + reorder policy + low-stock ────────────────────
export {
  getLevel,
  levelsForVariant,
  levelsForWarehouse,
  setReorderPolicy,
  setSafetyBuffer,
  listLowStock,
} from './levels';
export type { InventoryLevelRow, LowStockRow } from './levels';

// ─── Stock mutations (manual adjust + transfer) ───────────────────────
export { adjust, transfer } from './movements';

// ─── Documented public API (docs/06 §7 — P6a) ────────────────────────
// The headless contract surface: a cross-warehouse enriched level list, a
// single-level count update (absolute set or signed delta), and a bulk
// adjustment (CSV/JSON) that isolates each row in its own transaction. All
// writes route through the `applyMovement` ledger funnel.
export { listInventory, listUncounted, updateLevelCount, bulkAdjust } from './public-api';
export type {
  PublicInventoryRow,
  ListInventoryFilter,
  LevelCountResult,
  BulkAdjustResult,
  BulkAdjustResultRow,
} from './public-api';

// ─── Analytics / reporting (docs/100 P6b, docs/09 §8) ─────────────────
// Valuation, turnover / days-inventory-outstanding, aging + dead-stock, and
// reorder analysis (velocity → days-of-cover → projected stockout) over the
// master model + ledger. Shared by the REST reports route and the MCP supply tools.
export { inventoryValuation, turnoverReport, agingReport, reorderAnalysis } from './analytics';
export type {
  InventoryValuationReport,
  TurnoverReport,
  AgingReport,
  AgingBucket,
  DeadStockItem,
  ReorderAnalysisReport,
  ReorderAnalysisRow,
} from './analytics';

// ─── Performance reporting (docs/146 Phase 10.1) ──────────────────────
// The five ratios the platform held every input for and could not state:
// sell-through, GMROI, fill rate, stock-out frequency, and where the stock went.
// Every one of them can refuse to answer — each report carries the count of what
// it could not measure, because a ratio hides its own inputs and a comfortable
// 100% is indistinguishable from nobody looking.
export {
  sellThroughReport,
  gmroiReport,
  fillRateReport,
  stockoutFrequencyReport,
  movementSummaryReport,
} from './performance-reports';
export type {
  PerformanceFilter,
  SellThroughReport,
  SellThroughRow,
  GmroiReport,
  GmroiRow,
  FillRateReport,
  FillRateVariantRow,
  StockoutFrequencyReport,
  StockoutFrequencyRow,
  MovementSummaryReport,
} from './performance-reports';

// ─── B2B inventory consumer (docs/100 P6d) ────────────────────────────
// Account-scoped availability + fleet/work-order holds (a hold is an account-
// scoped reservation with a work-order ref). B2B consumes the master (docs/99 §4.0).
export {
  accountAvailability,
  createFleetHold,
  releaseFleetHold,
  consumeFleetHold,
  getFleetHold,
  listFleetHolds,
} from './b2b-holds';
export type { FleetHoldRow, AccountAvailabilityRow, ListFleetHoldsFilter } from './b2b-holds';

// ─── Movement / audit-log read path (P4 corrections) ──────────────────
// A filterable, paginated view over the append-only `inventory_movements`
// ledger — the compliance surface answering who moved stock, when, why, how much.
export { listMovements, exportMovements } from './movement-log';
export type { MovementRow, ListMovementsFilter, MovementExport } from './movement-log';

// ─── Reservations (cart soft / order hard) ────────────────────────────
// The tx-aware cores (`reserveOnTx` / `releaseOnTx`) let the commerce cart seam
// hold/release stock atomically with the cart-line write; `pickWarehouseFor` is
// the stock-aware single-source allocator.
export {
  reserve,
  reserveOnTx,
  release,
  releaseOnTx,
  commit,
  expireDueReservations,
  listReservations,
  pickWarehouseFor,
} from './reservations';
export type { ReservationResult, ReservationRow, ListReservationsFilter } from './reservations';

// ─── Sell path (checkout commit · cancel restock · default warehouse) ──
export {
  commitSaleOnTx,
  emitSaleEvents,
  reverseOrderSale,
  resolveDefaultWarehouseId,
} from './sell-path';
export type { SellLine, CommittedSale } from './sell-path';

// ─── External-feed reconcile (sync sources) ───────────────────────────
export { reconcileStockLevel } from './sync';
export type { ReconcileStockLevelInput } from './sync';

// ─── Feed ingest funnel + sync-health (P5 Tier C) ─────────────────────
// `ingestFeed` is the one path both the CSV worker and the `/sources/:id/push`
// endpoint call: match feed rows to links, reconcile matches through the ledger,
// queue unmatched SKUs for review, and record the run. The read side
// (runs / health / unmapped queue + map/ignore) backs the connection detail page.
export { ingestFeed } from './feed-ingest';
export type { FeedRow, IngestFeedInput, IngestFeedResult } from './feed-ingest';
export {
  listSyncRuns,
  getSyncHealth,
  listUnmappedSkus,
  createSourceLink,
  mapUnmappedSku,
  ignoreUnmappedSku,
} from './sync-runs';
export type {
  SyncRunRow,
  UnmappedSkuRow,
  SyncHealth,
  ListSyncRunsFilter,
  ListUnmappedFilter,
} from './sync-runs';

// ─── Tier A bridge agent enrollment (P5d) ─────────────────────────────
// An `agent` source is fed by an outbound-HTTPS bridge the tenant installs;
// pairing mints a tenant-scoped API key (in the route) and records a reference
// here. `touchAgent` is the liveness bump every push + heartbeat calls.
export {
  recordAgentEnrollment,
  clearAgentEnrollment,
  touchAgent,
  AGENT_ONLINE_GRACE_MS,
} from './agent-enrollment';
export type { AgentEnrollmentState } from './agent-enrollment';

// ─── Lot batches + serial units + recalls ─────────────────────────────
export {
  createLotBatch,
  listLotsExpiringBefore,
  listLotsForVariant,
  createSerialUnit,
  initiateRecall,
} from './lots';
export type { LotBatchRow } from './lots';

// ─── Lot/serial management surface (P4d) ──────────────────────────────
// The dashboard management reads + status mutations on top of the create
// primitives above: a filterable lot list, a lot detail with its serial roster,
// per-serial status changes, and clearing a recall.
export {
  listLots,
  getLotBatch,
  listSerials,
  updateSerialStatus,
  clearRecall,
} from './lot-management';
export type {
  LotRow,
  LotDetail,
  SerialRow,
  ListLotsFilter,
  ListSerialsFilter,
} from './lot-management';

// ─── Suppliers + per-variant purchasing detail (P3a supply path) ──────
export {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  archiveSupplier,
} from './suppliers';
export type { SupplierRow } from './suppliers';
export {
  listSupplierVariants,
  suppliersForVariant,
  upsertSupplierVariant,
  removeSupplierVariant,
  lookupVariantBySku,
} from './supplier-variants';
export type { SupplierVariantRow, VariantLookupRow } from './supplier-variants';

// ─── Purchase orders (P3b supply path) ────────────────────────────────
export {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
} from './purchase-orders';
export type { ListPurchaseOrderFilter } from './purchase-orders';
export {
  addPurchaseOrderLine,
  updatePurchaseOrderLine,
  removePurchaseOrderLine,
} from './purchase-order-lines';
export {
  submitPurchaseOrder,
  reschedulePurchaseOrderArrival,
  cancelPurchaseOrder,
  closePurchaseOrder,
} from './purchase-order-lifecycle';
export { buildPurchaseOrderDocumentHtml, renderPurchaseOrderHtml } from './purchase-order-document';
export type {
  PurchaseOrderDocumentData,
  PurchaseOrderDocumentBrand,
} from './purchase-order-document';
export type {
  PurchaseOrderRow,
  PurchaseOrderLineRow,
  PurchaseOrderDetail,
} from './purchase-order-shared';

// ─── Goods receipts (P3c supply path) ─────────────────────────────────
export { listGoodsReceipts, getGoodsReceipt, createGoodsReceipt } from './goods-receipts';
export type {
  GoodsReceiptRow,
  GoodsReceiptLineRow,
  GoodsReceiptDetail,
  GoodsReceiptChargeRow,
} from './goods-receipts';

// ─── Reorder engine (P3d supply path) ─────────────────────────────────
// Low stock → reorder suggestions → draft PO to the preferred supplier. Manual
// (buyer-selected) + auto (the inventory.low automation action calls
// `autoDraftReorder` on the engine's transaction).
export {
  listReorderSuggestions,
  draftReorderPurchaseOrders,
  autoDraftReorder,
  suggestedReorderQty,
} from './reorder';
export type {
  ReorderFilter,
  ReorderSuggestions,
  ReorderGroup,
  ReorderSuggestionLine,
  UnsuppliedSuggestion,
  DraftReorderResult,
  DraftedPurchaseOrder,
  AutoDraftResult,
  AutoDraftOutcome,
} from './reorder';

// ─── Inventory counts (P4 corrections) ────────────────────────────────
// A counting session reconciles recorded stock against a physical count; on post
// each line writes a `recount` movement (absolute setOnHand). Variance value over
// the per-count threshold gates the post behind an admin approval.
export {
  listInventoryCounts,
  getInventoryCount,
  createInventoryCount,
  addCountLine,
  removeCountLine,
  enterCounts,
} from './inventory-counts';
export {
  submitInventoryCount,
  approveInventoryCount,
  postInventoryCount,
  cancelInventoryCount,
} from './inventory-count-lifecycle';
export type {
  InventoryCountRow,
  InventoryCountLineRow,
  InventoryCountDetail,
} from './inventory-count-shared';

// ─── Inventory transfers (P4 corrections) ─────────────────────────────
// Move stock between warehouses through a system in-transit holding location so
// total stock is conserved while in motion. Draft (compose lines) → ship
// (source → in-transit) → receive (in-transit → destination); cancel returns an
// in-transit transfer's goods to source. Every leg routes through the ledger.
export {
  listInventoryTransfers,
  getInventoryTransfer,
  createInventoryTransfer,
  addTransferLine,
  updateTransferLine,
  removeTransferLine,
  deleteInventoryTransfer,
} from './inventory-transfers';
export {
  shipInventoryTransfer,
  receiveInventoryTransfer,
  cancelInventoryTransfer,
} from './inventory-transfer-lifecycle';
export type {
  InventoryTransferRow,
  InventoryTransferLineRow,
  InventoryTransferDetail,
} from './inventory-transfer-shared';

// ─── Movement ledger primitive ────────────────────────────────────────
// Exposed for callers composing a movement inside their OWN tenant transaction
// (e.g. an order service decrementing stock atomically with the order insert).
// Most callers use reserve/commit/adjust above rather than this directly.
export { applyMovement, emitStockEvents } from './ledger';
export type { MovementInput, MovementResult, ActorType } from './ledger';

// ─── Integrity: the ledger checking itself (docs/146 Phase 1) ─────────
// Reconciliation re-derives Σ(delta) against the recorded on-hand; the oversell
// log records every refused or uncovered hold. Both are observability — neither
// ever writes stock, and a drift is never auto-corrected (that would destroy the
// evidence and could propagate a corrupt ledger into a good level).
export {
  runReconciliation,
  listReconciliationRuns,
  listReconciliationDrifts,
  recordOversellIncidentOnTx,
  recordOversellIncidentDetached,
  listOversellIncidents,
  oversellSummary,
} from './integrity';
export type {
  ReconciliationRunRow,
  ReconciliationDriftRow,
  ListReconciliationRunsFilter,
  ListDriftsFilter,
  OversellIncidentInput,
  OversellIncidentRow,
  ListOversellIncidentsFilter,
  OversellSummary,
} from './integrity';

// ─── Provenance: why is this number what it is ────────────────────────
// One call that decomposes a stock figure, re-derives it from the ledger, names
// who is holding the allocated units, and reports how fresh the feed behind it
// is. The read the trust pillar rests on.
export { stockProvenance } from './provenance';
export type {
  StockProvenance,
  ProvenanceMovement,
  ProvenanceHold,
  ProvenanceSource,
  ProvenanceOptions,
} from './provenance';

// ─── Per-channel oversell buffers ─────────────────────────────────────
export {
  listChannelBuffers,
  setChannelBuffer,
  deleteChannelBuffer,
  resolveChannelBuffer,
  resolveChannelBufferOnTx,
} from './channel-buffers';
export type {
  ChannelBufferRow,
  ListChannelBuffersFilter,
  ResolvedChannelBuffer,
} from './channel-buffers';

// ─── Feed freshness SLO ───────────────────────────────────────────────
export {
  listSourceFreshness,
  setSourceFreshness,
  sweepSourceFreshness,
  resolveStalenessPenalty,
  resolveStalenessPenaltyOnTx,
} from './freshness';
export type { SourceFreshnessRow, FreshnessSweepResult, StalenessPenalty } from './freshness';

// ─── Bins: where INSIDE a location a thing is (docs/146 Phase 2) ──────
// Opt-in per warehouse. `inventory_levels` stays authoritative for availability;
// bin levels sum to it, and the bin ledger sums to each bin — three checkable
// invariants, of which the top one is untouched by this layer.
export {
  listBins,
  getBin,
  createBin,
  updateBin,
  archiveBin,
  binContents,
  binsForVariant,
  moveBetweenBins,
  suggestPutAway,
  setVariantHomeBin,
  enableBinsForWarehouse,
  disableBinsForWarehouse,
  provisionSystemBins,
  defaultSellableFor,
} from './bins';
export type {
  BinRow,
  BinContentRow,
  VariantBinRow,
  ListBinsFilter,
  PutAwaySuggestion,
} from './bins';

export { applyBinMovement, mirrorMovementToBins, lockBinOnHand, defaultBinFor } from './bin-ledger';
export type { BinMovementInput, BinMovementResult } from './bin-ledger';

export { systemBinFor, resolveSystemBin, resolvePutAwayBin } from './bin-routing';

// ─── Barcodes + scanning (docs/146 Phase 3) ───────────────────────────
// The registry that makes a scan resolve to exactly one thing, the minter for
// items that arrived without a code, and the one resolver every scan-first
// workflow goes through. Symbology maths lives in @wizeworks/commerce-schemas so
// the label printer in the browser computes check digits the same way.
export {
  listBarcodes,
  barcodesForVariant,
  resolveBarcode,
  listBarcodeConflicts,
  resolveBarcodeConflict,
  createBarcode,
  updateBarcode,
  setPrimaryBarcode,
  deleteBarcode,
  generateBarcodes,
  previewSymbology,
} from './barcodes';
export type {
  BarcodeRow,
  BarcodeMatch,
  BarcodeConflictRow,
  GeneratedBarcode,
  GenerateBarcodesResult,
} from './barcodes';

export {
  receivingSession,
  scanToReceive,
  postScannedReceipt,
  undoReceivingScan,
  scanToCount,
  scanToCountAndReload,
  scanToTransfer,
  scanPutAway,
  replayScanQueue,
  listScanEvents,
} from './scan-workflows';
export type {
  ScanContextType,
  ScanOutcome,
  ScanEnvelope,
  ScanActionResult,
  ReceivingSession,
  ReceivingSessionLine,
  ScanToReceiveInput,
  PostScannedReceiptInput,
  ScanToCountInput,
  ScanToTransferInput,
  ScanPutAwayInput,
  QueuedScan,
  ReplayResult,
  ScanEventRow,
  ListScanEventsFilter,
} from './scan-workflows';

export { resolveScan } from './scan';
export type {
  ScanKind,
  ScanMatch,
  ScanResolution,
  ResolveScanOptions,
  VariantScanMatch,
  BinScanMatch,
  DocumentScanMatch,
  LotScanMatch,
  SerialScanMatch,
} from './scan';

// ─── Shrinkage ────────────────────────────────────────────────────────
export { shrinkageReport } from './shrinkage';
export type {
  ShrinkageReport,
  ShrinkageFilter,
  ShrinkageByReason,
  ShrinkageByWarehouse,
  ShrinkageTopVariant,
  ShrinkagePeriod,
} from './shrinkage';

// ─── Picking + packing (docs/146 Phase 4) ─────────────────────────────
export { generatePickList, listPickLists, getPickList } from './pick-lists';
export type { PickListRow, PickListLineRow, PickListDetail } from './pick-lists';

export {
  assignPickList,
  cancelPickList,
  confirmPick,
  skipPick,
  shortPick,
  ensureShortCounts,
} from './pick-lifecycle';
export type { PickActionResult } from './pick-lifecycle';

export { scanToPick, scanToPack } from './pick-scan';
export type { ScanToPickResult, ScanToPackResult } from './pick-scan';

export {
  createPackage,
  updatePackage,
  packItem,
  closePackage,
  cancelPackage,
  attachFulfillment,
  listPackages,
  getPackage,
} from './packing';
export type { PackageRow, PackageLineRow, PackageDetail } from './packing';

export { buildPackingSlipHtml, renderPackingSlipHtml } from './packing-slip';
export type { PackingSlipData, PackingSlipLine, PackingSlipBrand } from './packing-slip';

export { pickThroughput } from './pick-analytics';
export type {
  PickThroughputReport,
  PickerThroughput,
  BinShortfall,
  PackThroughput,
} from './pick-analytics';

export {
  orderBinCandidates,
  resolveFefoLot,
  allocationsForOrderLine,
  toPickStrategy,
} from './pick-allocation';
export type {
  PickStrategy,
  BinCandidate,
  PickAllocation,
  AllocationResult,
} from './pick-allocation';

// ─── True cost (docs/146 Phase 5) ─────────────────────────────────────
//
// What a unit cost to get onto the shelf (the freight and duty the basis was
// missing), what it cost when it left, and how the business wants stock valued.

export {
  getCostingPolicy,
  updateCostingPolicy,
  setVariantCostingMethod,
  resolveCosting,
  DEFAULT_COSTING_METHOD,
  DEFAULT_BASE_CURRENCY,
} from './costing-policy';
export type { CostingPolicyRow, ResolvedCosting } from './costing-policy';

export {
  listPurchaseOrderCharges,
  createPurchaseOrderCharge,
  updatePurchaseOrderCharge,
  deletePurchaseOrderCharge,
  listGoodsReceiptCharges,
  createGoodsReceiptCharge,
  updateGoodsReceiptCharge,
  deleteGoodsReceiptCharge,
  getLandedCostBreakdown,
  reallocateOrderCharges,
  allocateCharge,
} from './landed-cost';
export type {
  ChargeRow,
  ReceiptLandedCost,
  LineLandedCost,
  ChargeBreakdownRow,
  AllocatableLine,
  AllocatableCharge,
  ChargeAllocation,
  RevaluationResult,
} from './landed-cost';

export { listOpenLayers, movementCostBreakdown, layeredValuation } from './cost-layers';
export type { CostLayerRow, MovementCostBreakdownRow, CostLayerSource } from './cost-layers';

export {
  valuationAsOf,
  priceVarianceReport,
  cogsReport,
  variantCostLayers,
  movementCostLayers,
  windowOfDays,
} from './cost-reports';
export type {
  AsOfValuationReport,
  AsOfValuationRow,
  PriceVarianceReport,
  PriceVarianceRow,
  CogsReport,
  CogsRow,
} from './cost-reports';

// The opening balance: stock that was already on the shelf when the business
// started recording deliveries, and so has no cost behind it.
export { uncostedStock, setVariantCosts } from './uncosted-stock';
export type {
  UncostedStockReport,
  UncostedVariantRow,
  CostEntry,
  SetCostsResult,
} from './uncosted-stock';

// ─── Units of measure + assembly (docs/146 Phase 6) ───────────────────
//
// Buy a case, stock each, sell a pair; and make things out of other things.
// Every quantity the ledger stores stays in BASE units — the unit is how a
// person enters and reads it, never a second way of storing it.

export {
  listUnitsOfMeasure,
  bootstrapUnitsOfMeasure,
  createUnitOfMeasure,
  updateUnitOfMeasure,
  deleteUnitOfMeasure,
  getVariantUoms,
  setVariantUoms,
  resolveLineUom,
  toBaseUnitCost,
  BASE_LINE_UOM,
} from './units-of-measure';
export type {
  UnitOfMeasureRow,
  VariantUomRow,
  VariantUomSetup,
  ResolvedLineUom,
} from './units-of-measure';

export {
  listBoms,
  getBom,
  activeBomFor,
  createBom,
  updateBom,
  setBomStatus,
  deleteBom,
  buildableQuantity,
} from './boms';
export type {
  BomRow,
  BomDetail,
  BomComponentRow,
  BuildableReport,
  BuildableComponentRow,
} from './boms';

export {
  listAssemblyOrders,
  getAssemblyOrder,
  createAssemblyOrder,
  updateAssemblyOrder,
  releaseAssemblyOrder,
  completeAssemblyOrder,
  cancelAssemblyOrder,
} from './assembly-orders';
export type { AssemblyOrderRow, AssemblyOrderDetail, AssemblyLineRow } from './assembly-orders';

// ─── Planning intelligence (docs/146 Phase 7) ─────────────────────────────
//
// How much to keep and when to buy it again — measured from the ledger, the
// receipts and the cost basis rather than typed in once and forgotten. The
// arithmetic itself is PURE and lives in `@wizeworks/commerce-schemas/planning`, so
// the nightly pass, the API and the screen cannot arrive at three answers.

export {
  getPlanningPolicy,
  updatePlanningPolicy,
  loadPlanningPolicy,
  DEFAULT_PLANNING_POLICY,
} from './planning-policy';
export type { PlanningPolicyRow } from './planning-policy';

export { recomputeDemandVelocity, getDemandVelocity, DEMAND_REASONS } from './demand';
export type { DemandVelocityRow, DemandSweepResult } from './demand';

export {
  recomputeLeadTimes,
  listLeadTimes,
  resolveLeadTimeOnTx,
  MIN_RELIABLE_SAMPLES,
  DEFAULT_LEAD_TIME_DAYS,
} from './lead-times';
export type {
  LeadTimeRow,
  LeadTimeSweepResult,
  ListLeadTimesFilter,
  ResolvedLeadTime,
} from './lead-times';

export {
  recomputeClassifications,
  listClassifications,
  getClassification,
  setClassificationOverride,
} from './classification';
export type {
  ClassificationRow,
  ClassificationSweepResult,
  ListClassificationsFilter,
} from './classification';

export {
  recomputeReorderPoints,
  getReorderPlan,
  listReorderPlans,
  setReorderPlanningPolicy,
  applyComputedReorderPoint,
} from './reorder-planning';
export type {
  ReorderPolicyRow,
  ReorderPlanResult,
  ListReorderPlansFilter,
} from './reorder-planning';

export {
  listCountSchedules,
  getCountSchedule,
  createCountSchedule,
  updateCountSchedule,
  deleteCountSchedule,
  generateDueCounts,
} from './count-schedules';
export type { CountScheduleRow, ScheduleGenerationResult } from './count-schedules';

export { runPlanningSweep } from './planning-sweep';
export type {
  PlanningSweepResult,
  PlanningSweepStage,
  PlanningSweepOptions,
} from './planning-sweep';

export { stockoutRiskReport, slowMoverReport, holdingCostReport } from './planning-reports';
export type {
  StockoutRiskReport,
  StockoutRiskRow,
  StockoutRiskFilter,
  SlowMoverReport,
  SlowMoverRow,
  SlowMoverKind,
  HoldingCostReport,
} from './planning-reports';

export { planningProvenance } from './planning-provenance';
export type { PlanningProvenance, PlanningInput, InputConfidence } from './planning-provenance';

// ─── Supplier performance + procurement discipline (docs/146 Phase 8) ──────
//
// The other side of a purchase order: how the counterparty actually behaves, the
// controls over spending with them, and the three documents either side of a
// delivery. The scoring, price-break and three-way-match arithmetic is PURE and
// lives in `@wizeworks/commerce-schemas/procurement`.

export {
  recomputeSupplierScorecards,
  listSupplierScorecards,
  getSupplierScorecard,
  SCORECARD_WINDOW_DAYS,
} from './supplier-scorecard';
export type {
  SupplierScorecardRow,
  SupplierScorecardReport,
  ScorecardSweepResult,
  ListScorecardsFilter,
} from './supplier-scorecard';

export { getPriceLadder, setPriceBreaks, resolveSupplierPriceOnTx } from './supplier-price-breaks';
export type { PriceBreakRow, PriceLadder } from './supplier-price-breaks';

export {
  listLatePurchaseOrders,
  sweepLatePurchaseOrders,
  rearmLateAlert,
} from './purchase-order-alerts';
export type { LatePurchaseOrderRow, LateOrderSweepResult } from './purchase-order-alerts';

export {
  listPoApprovalRules,
  createPoApprovalRule,
  updatePoApprovalRule,
  deletePoApprovalRule,
  listPoApprovals,
  decidePoApproval,
  cancelPoApproval,
  resolveRequiredApproval,
} from './purchase-order-approvals';
export type {
  PoApprovalRuleRow,
  PoApprovalRow,
  ApprovalQueueFilter,
} from './purchase-order-approvals';

export {
  listAdvanceShipNotices,
  getAdvanceShipNotice,
  createAdvanceShipNotice,
  updateAdvanceShipNotice,
  cancelAdvanceShipNotice,
  prefillFromAdvanceShipNotice,
} from './advance-ship-notices';
export type {
  AsnRow,
  AsnDetail,
  AsnLineRow,
  AsnPrefill,
  AsnPrefillLine,
  ListAsnFilter,
} from './advance-ship-notices';

export {
  listSupplierReturns,
  getSupplierReturn,
  createSupplierReturn,
  updateSupplierReturn,
  sendSupplierReturn,
  recordSupplierCredit,
  closeSupplierReturn,
  cancelSupplierReturn,
} from './supplier-returns';
export type {
  SupplierReturnRow,
  SupplierReturnDetail,
  SupplierReturnLineRow,
  SupplierReturnsReport,
  ListSupplierReturnsFilter,
} from './supplier-returns';

export {
  listSupplierBills,
  getSupplierBill,
  createSupplierBill,
  updateSupplierBill,
  approveSupplierBill,
  acceptBillVariance,
  disputeSupplierBill,
  recordBillPayment,
  cancelSupplierBill,
  // Receipt → bill (docs/146 Phase 10.10) — the path for a business with no
  // accounting package. The draft is returned for checking against the paper
  // BEFORE anything is written: a bill created straight from the receipt would
  // match it perfectly by construction, and a match that cannot fail is not one.
  draftBillFromReceipt,
  createSupplierBillFromReceipt,
} from './supplier-bills';
export type {
  SupplierBillRow,
  SupplierBillDetail,
  SupplierBillLineRow,
  MatchedBillLine,
  BillMatch,
  SupplierBillsReport,
  ListSupplierBillsFilter,
  BillDraft,
  BillDraftLine,
  CreateBillFromReceiptInput,
} from './supplier-bills';

// ─── Demand-side commitments (docs/146 Phase 9) ───────────────────────
// The backorder queue: who is owed stock that does not exist yet, in what
// order, and what they were told. `recordBackorderOnTx` is called by the sell
// path at commit; `allocateBackordersOnTx` by every inbound path. Nothing here
// writes a level — the hold already exists in `allocated`.
export {
  listBackorders,
  getBackorder,
  updateBackorder,
  cancelBackorder,
  markBackorderNotified,
  markBackordersFulfilled,
  refreshBackorderPromises,
  getVariantCommitmentSummary,
  recordBackorderOnTx,
  allocateBackordersOnTx,
  emitBackorderAllocations,
  resolvePromiseForVariant,
} from './backorders';
export type {
  BackorderRow,
  BackorderDetail,
  BackorderAllocationRow,
  ListBackordersResult,
  ListBackordersParams,
  BackorderFilled,
  BackorderSweepResult,
  VariantCommitmentSummary,
} from './backorders';

// Preorder windows — turning `inventoryPolicy = 'preorder'` from a synonym for
// "sell it anyway" into a bounded, dated offer.
export {
  listPreorderWindows,
  getPreorderWindow,
  getLivePreorderWindow,
  openPreorderWindow,
  updatePreorderWindow,
  closePreorderWindow,
  syncPreorderWindowStatuses,
  consumePreorderOnTx,
  assertPreorderHeadroomOnTx,
} from './preorders';
export type {
  PreorderWindowRow,
  ListPreorderWindowsFilter,
  PreorderSweepResult,
} from './preorders';

// The stock-ownership axis — which of the goods in the building are actually
// yours. Changes exactly one thing: whether they count toward valuation.
export { listNonOwnedStock, setStockOwnership } from './stock-ownership';
export type { OwnedStockRow, ListOwnedStockFilter } from './stock-ownership';

// Consignment settlement — paying the owner for what sold from their stock,
// one closed period at a time.
export {
  listConsignmentSettlements,
  getConsignmentSettlement,
  createConsignmentSettlement,
  refreshConsignmentSettlement,
  closeConsignmentSettlement,
  invoiceConsignmentSettlement,
  markConsignmentSettlementPaid,
  cancelConsignmentSettlement,
  listUnsettledConsignment,
} from './consignment';
export type {
  ConsignmentSettlementRow,
  ConsignmentSettlementDetail,
  ConsignmentSettlementLineRow,
  ListConsignmentSettlementsFilter,
  UnsettledConsignmentRow,
} from './consignment';

// Expiring stock — the money that goes off. The report, the two things you can
// do about it, and the once-per-lot alert.
export {
  listExpiringStock,
  markdownExpiringLot,
  writeOffExpiringLot,
  sweepExpiringLots,
  rearmExpiryAlert,
} from './expiry';
export type {
  ExpiringLotRow,
  ExpiringStockReport,
  ExpiringStockFilter,
  ExpirySweepResult,
} from './expiry';

// ─── Reporting, portability + the accounting handoff (docs/146 Phase 10) ──
//
// The registry is the list of reports. The API iterates it, the scheduler
// resolves through it, and the workbench picker is served from it — so a report
// added to one and forgotten in the others is not a thing that can happen.
export { REPORTS, reportCatalog, reportDefinition, runReport } from './report-registry';
export type {
  ReportDefinition,
  ReportCatalogEntry,
  ReportRun,
  SummaryLine,
} from './report-registry';

// A standing instruction to email a report, and the evidence that it went. A
// report nobody opens is a report that does not exist, and the only reliable way
// to be read is to arrive.
export {
  listReportSchedules,
  getReportSchedule,
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  runReportSchedule,
  sweepDueReports,
} from './report-schedules';
export type {
  ReportScheduleRow,
  ReportDeliveryRow,
  DeliveryResult as ReportDeliveryResult,
  ReportSweepResult,
} from './report-schedules';

// Stock versus the books. sparx keeps no ledger, so the inventory account's
// balance is something it must be TOLD — and until it is told, the unexplained
// difference is NULL rather than zero.
export { glReconciliationReport, recordGlSnapshot, listGlSnapshots } from './gl-reconciliation';
export type {
  GlReconciliationReport,
  GlReconciliationFilter,
  ReconciliationLine,
  ReconciliationLineKind,
  GlSnapshotRow,
  RecordGlSnapshotInput,
} from './gl-reconciliation';

// A spreadsheet of counts, turned into stock movements — planned first, applied
// second, and reversible as a unit afterwards.
export {
  planAdjustmentImport,
  resolveImportRows,
  applyImportBatch,
  discardImportBatch,
  reverseImportBatch,
  listImportBatches,
  getImportBatch,
  adjustmentTemplate,
} from './adjustment-import';
export type {
  PlanImportInput,
  ImportBatchRow,
  ImportBatchDetail,
  ApplyImportResult,
  ListImportBatchesFilter,
} from './adjustment-import';

// ─── Onboarding: beating the spreadsheet (docs/146 Phase 11) ──
//
// The first thirty minutes. Every export here is part of one argument: that
// arriving with a spreadsheet should take half an hour rather than a fortnight,
// and that a guess about somebody else's data must always show its confidence.

// The guided setup and its clock. Two honest numbers — hands-on time and how
// many sittings — because one would have to count somebody's lunch or discard it.
export { getSetupProgress, completeSetupStep, dismissSetup, noteSetupStep } from './setup-progress';
export type { SetupProgressView, SetupStepView, SetupReadiness } from './setup-progress';

// Reading somebody else's headings: the preview, the saved mapping that makes
// the second import one click, and the recipes for the files people arrive with.
export {
  listImportProfiles,
  getImportProfile,
  createImportProfile,
  updateImportProfile,
  deleteImportProfile,
  markProfileUsed,
  previewImport,
  listMigrationRecipes,
} from './import-profiles';
export type { ImportProfileRow, ImportPreview, ImportPreviewInput } from './import-profiles';

// The count that closes setup, so day one starts from evidence rather than an
// assumption. Its movements post as `opening`, not `recount`.
export { openingBalanceStatus, startOpeningBalance } from './opening-balance';
export type { OpeningBalanceStatus } from './opening-balance';

// Stock as a spreadsheet: inline edit, paste a column, act on a selection. The
// quantity edit sends a TARGET and the server computes the delta under the row
// lock, so a sale landing while the grid was open is reconciled rather than lost.
export { stockGrid, saveStockGrid, stockGridCsv } from './stock-grid';
export type {
  StockGridRow,
  StockGridFilter,
  StockGridPage,
  StockGridSaveResult,
} from './stock-grid';

// The tenant's own columns. One coercion, one merge, one place a field's type is
// a promise rather than a hope.
export {
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  getCustomFieldValues,
  setCustomFieldValues,
  loadCustomFieldDefinitions,
  applyCustomFields,
} from './custom-fields';
export type { CustomFieldRowOut, ListCustomFieldsFilter } from './custom-fields';

// The inventory journal (docs/146 Phase 10.7–10.8). Computed from the ledger,
// handed over, never stored — sparx keeps no books and this does not change
// that. The arithmetic is pure and shared, so the entry QuickBooks receives, the
// entry Xero receives and the entry on screen are the same object.
export {
  inventoryJournalForPeriod,
  previewInventoryJournal,
  journalReference,
  journalMemo,
} from './accounting-journal';
export type { JournalPeriod, JournalPreview } from './accounting-journal';
