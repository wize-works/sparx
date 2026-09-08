// Inventory — knowing what you have and where it is.

import {
  faArrowRightArrowLeft,
  faArrowTrendUp,
  faArrowsRotate,
  faBarcode,
  faBarcodeRead,
  faBoxCheck,
  faBoxMagnifyingGlass,
  faBoxOpen,
  faBoxes,
  faCalendarClock,
  faCalendarXmark,
  faChartColumn,
  faCircleExclamation,
  faClipboardCheck,
  faClipboardList,
  faClockRotateLeft,
  faCoins,
  faColumns3,
  faFileSpreadsheet,
  faGauge,
  faGrid,
  faHammer,
  faHandshake,
  faHourglass,
  faLayerGroup,
  faLink,
  faPotFood,
  faPrint,
  faQrcode,
  faReceipt,
  faRocket,
  faRotateLeft,
  faRoute,
  faRuler,
  faScaleBalanced,
  faShieldCheck,
  faSliders,
  faTruck,
  faTurtle,
  faWarehouse,
} from '@fortawesome/pro-solid-svg-icons';
import type { SurfaceDefinition } from '../registry';
import { StockItemSurface } from '../../../surfaces/inventory/stock-item';
import { StockListSurface } from '../../../surfaces/inventory/stock-list';
import { LocationsListSurface } from '../../../surfaces/inventory/locations-list';
import { LocationDetailSurface } from '../../../surfaces/inventory/location-detail';
import { TransfersListSurface } from '../../../surfaces/inventory/transfers-list';
import { TransferDetailSurface } from '../../../surfaces/inventory/transfer-detail';
import { CountsListSurface } from '../../../surfaces/inventory/counts-list';
import { CountDetailSurface } from '../../../surfaces/inventory/count-detail';
import { MovementsListSurface } from '../../../surfaces/inventory/movements-list';
import { LotsListSurface } from '../../../surfaces/inventory/lots-list';
import { LotDetailSurface } from '../../../surfaces/inventory/lot-detail';
import { SuppliersListSurface } from '../../../surfaces/inventory/suppliers-list';
import { SupplierDetailSurface } from '../../../surfaces/inventory/supplier-detail';
import { PurchaseOrdersListSurface } from '../../../surfaces/inventory/purchase-orders-list';
import { PurchaseOrderDetailSurface } from '../../../surfaces/inventory/purchase-order-detail';
import { ReceivingListSurface } from '../../../surfaces/inventory/receiving-list';
import { ReceiptDetailSurface } from '../../../surfaces/inventory/receipt-detail';
import { ReorderListSurface } from '../../../surfaces/inventory/reorder-list';
import { ReportsSurface } from '../../../surfaces/inventory/reports';
import { PerformanceReportsSurface } from '../../../surfaces/inventory/performance';
import { ReportSchedulesSurface } from '../../../surfaces/inventory/report-schedules';
import { ReportScheduleDetailSurface } from '../../../surfaces/inventory/report-schedule-detail';
import { StockImportSurface } from '../../../surfaces/inventory/stock-import';
import { GlReconciliationSurface } from '../../../surfaces/inventory/gl-reconciliation';
import { SourcesListSurface } from '../../../surfaces/inventory/sources-list';
import { SourceDetailSurface } from '../../../surfaces/inventory/source-detail';
import { IntegritySurface } from '../../../surfaces/inventory/integrity';
import { ProvenanceSurface } from '../../../surfaces/inventory/provenance';
import { BinsListSurface } from '../../../surfaces/inventory/bins-list';
import { BinDetailSurface } from '../../../surfaces/inventory/bin-detail';
import { BinLabelsSurface } from '../../../surfaces/inventory/bin-labels';
import { BarcodesListSurface } from '../../../surfaces/inventory/barcodes-list';
import { BarcodeConflictsSurface } from '../../../surfaces/inventory/barcode-conflicts';
import { ProductLabelsSurface } from '../../../surfaces/inventory/product-labels';
import { DocumentLabelSurface } from '../../../surfaces/inventory/document-label';
import { ReceivingScanSurface } from '../../../surfaces/inventory/receiving-scan';
import { WarehouseModeSurface } from '../../../surfaces/inventory/warehouse-mode';
import { PickListsListSurface } from '../../../surfaces/inventory/pick-lists-list';
import { PickListDetailSurface } from '../../../surfaces/inventory/pick-list-detail';
import { PickGuidedSurface } from '../../../surfaces/inventory/pick-guided';
import { PackBenchSurface } from '../../../surfaces/inventory/pack-bench';
import { PickThroughputSurface } from '../../../surfaces/inventory/pick-throughput';
import { CostVarianceSurface } from '../../../surfaces/inventory/cost-variance';
import { CostingSettingsSurface } from '../../../surfaces/inventory/costing-settings';
import { UnitsListSurface } from '../../../surfaces/inventory/units-list';
import { BomsListSurface } from '../../../surfaces/inventory/boms-list';
import { BomDetailSurface } from '../../../surfaces/inventory/bom-detail';
import { AssembliesListSurface } from '../../../surfaces/inventory/assemblies-list';
import { AssemblyDetailSurface } from '../../../surfaces/inventory/assembly-detail';
import { PlanningSurface } from '../../../surfaces/inventory/planning';
import { PlanningClassesSurface } from '../../../surfaces/inventory/planning-classes';
import { PlanningIdleSurface } from '../../../surfaces/inventory/planning-idle';
import { UncostedStockSurface } from '../../../surfaces/inventory/uncosted-stock';
import { PlanningHoldingSurface } from '../../../surfaces/inventory/planning-holding';
import { PlanningSettingsSurface } from '../../../surfaces/inventory/planning-settings';
import { PlanningExplainSurface } from '../../../surfaces/inventory/planning-explain';
import { CountSchedulesListSurface } from '../../../surfaces/inventory/count-schedules-list';
import { CountScheduleDetailSurface } from '../../../surfaces/inventory/count-schedule-detail';
// Supplier performance + procurement discipline (docs/146 Phase 8)
import { SupplierScorecardsSurface } from '../../../surfaces/inventory/supplier-scorecards';
import { LateOrdersSurface } from '../../../surfaces/inventory/late-orders';
import { PoApprovalsSurface } from '../../../surfaces/inventory/po-approvals';
import { PoApprovalRulesSurface } from '../../../surfaces/inventory/po-approval-rules';
import { PoApprovalRuleDetailSurface } from '../../../surfaces/inventory/po-approval-rule-detail';
import { AsnListSurface } from '../../../surfaces/inventory/asn-list';
import { AsnDetailSurface } from '../../../surfaces/inventory/asn-detail';
import { SupplierReturnsListSurface } from '../../../surfaces/inventory/supplier-returns-list';
import { SupplierReturnDetailSurface } from '../../../surfaces/inventory/supplier-return-detail';
import { SupplierBillsListSurface } from '../../../surfaces/inventory/supplier-bills-list';
import { SupplierBillDetailSurface } from '../../../surfaces/inventory/supplier-bill-detail';
// Demand-side commitments (docs/146 Phase 9)
import { BackordersSurface } from '../../../surfaces/inventory/backorders';
import { BackorderDetailSurface } from '../../../surfaces/inventory/backorder-detail';
import { PreordersSurface } from '../../../surfaces/inventory/preorders';
import { StockOwnershipSurface } from '../../../surfaces/inventory/stock-ownership';
import { ConsignmentSettlementsSurface } from '../../../surfaces/inventory/consignment-settlements';
import { ConsignmentSettlementDetailSurface } from '../../../surfaces/inventory/consignment-settlement-detail';
import { ExpiringStockSurface } from '../../../surfaces/inventory/expiring-stock';
// Onboarding — beating the spreadsheet (docs/146 Phase 11)
import { InventorySetupSurface } from '../../../surfaces/inventory/setup-wizard';
import { StockGridSurface } from '../../../surfaces/inventory/stock-grid';
import { InventoryCustomFieldsSurface } from '../../../surfaces/inventory/custom-fields';

export const INVENTORY_SURFACES: SurfaceDefinition[] = [
  {
    // Unsectioned on purpose: stock is the module's landing surface, so it leads
    // the panel above the grouped sections (unsectioned surfaces sort first —
    // see nav.ts).
    key: 'inventory.stock.list',
    title: 'Stock',
    module: 'inventory',
    icon: faBoxes,
    order: 1,
    keywords: ['on hand', 'levels', 'quantity', 'availability', 'low stock', 'reorder'],
    component: StockListSurface,
  },
  {
    key: 'inventory.stock.item',
    title: 'Stock item',
    module: 'inventory',
    icon: faBoxMagnifyingGlass,
    component: StockItemSurface,
    // Reachable from the list, not the launcher — opening "an item's stock" with
    // no item in mind is not a thing anyone wants. There is no create
    // counterpart either: a stock level comes into existence by being counted,
    // received or sold, never by being declared.
    listed: false,
    // Docks comfortably beside the list it was opened from, which is the whole
    // point of shift-clicking a row.
    besideWidth: 0.45,
  },
  {
    // "Why is this number what it is." Opened BESIDE the quantity it explains —
    // a dialog would cover the very thing the person is asking about. Unlisted:
    // it is meaningless without an item and a location, so it is reached from a
    // number, never from the launcher.
    key: 'inventory.stock.provenance',
    title: 'Where this number came from',
    module: 'inventory',
    icon: faShieldCheck,
    component: ProvenanceSurface,
    listed: false,
    besideWidth: 0.4,
  },

  /* ── Where it lives ────────────────────────────────────────────────────── */
  {
    key: 'inventory.warehouses.list',
    title: 'Locations',
    module: 'inventory',
    icon: faWarehouse,
    section: 'Where it lives',
    order: 10,
    keywords: ['warehouses', 'shops', 'sites', 'storage'],
    component: LocationsListSurface,
    createSurface: 'inventory.warehouses.detail',
    createLabel: 'New location',
  },
  {
    key: 'inventory.warehouses.detail',
    title: (params) => (params.id === 'new' ? 'New location' : 'Location'),
    module: 'inventory',
    icon: faWarehouse,
    component: LocationDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    // Sits directly under Locations because a shelf lives inside one, and the
    // two are always set up together.
    key: 'inventory.bins.list',
    title: 'Shelves',
    module: 'inventory',
    icon: faGrid,
    section: 'Where it lives',
    order: 10.5,
    keywords: ['bins', 'racks', 'aisles', 'zones', 'put away', 'where is it', 'pick face'],
    component: BinsListSurface,
    createSurface: 'inventory.bins.detail',
    createLabel: 'New shelf',
  },
  {
    key: 'inventory.bins.detail',
    title: (params) => (params.id === 'new' ? 'New shelf' : 'Shelf'),
    module: 'inventory',
    icon: faGrid,
    component: BinDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    // Listed, unlike most detail surfaces: "print shelf labels" is a task
    // somebody sets out to do, not something they arrive at from a row.
    key: 'inventory.bins.labels',
    title: 'Shelf labels',
    module: 'inventory',
    icon: faQrcode,
    section: 'Where it lives',
    order: 10.6,
    keywords: ['print', 'qr', 'barcode', 'label', 'sticker'],
    component: BinLabelsSurface,
    besideWidth: 0.55,
  },

  /* ── Scanning (docs/146 Phase 3) ──────────────────────────────────────── */

  {
    // The registry, and the screen that answers "can we scan yet". Its own
    // section rather than folded into "Where it lives": a barcode is about
    // identifying a thing, not locating it, and the two are different jobs
    // done by different people.
    key: 'inventory.barcodes.list',
    title: 'Barcodes',
    module: 'inventory',
    icon: faBarcode,
    section: 'Scanning',
    order: 12,
    keywords: ['upc', 'ean', 'gtin', 'code 128', 'scan', 'sku', 'label'],
    component: BarcodesListSurface,
  },
  {
    // Listed, and deliberately: an unresolved conflict is the one thing that
    // stops scanning working, and a screen you can only reach from a banner is
    // a screen nobody checks.
    key: 'inventory.barcodes.conflicts',
    title: 'Shared barcodes',
    module: 'inventory',
    icon: faCircleExclamation,
    section: 'Scanning',
    order: 12.2,
    keywords: ['duplicate', 'conflict', 'clash', 'two items', 'same code'],
    component: BarcodeConflictsSurface,
    besideWidth: 0.5,
  },
  {
    key: 'inventory.barcodes.labels',
    title: 'Product labels',
    module: 'inventory',
    icon: faPrint,
    section: 'Scanning',
    order: 12.4,
    keywords: ['print', 'sticker', 'barcode', 'code 128', 'upc'],
    component: ProductLabelsSurface,
    besideWidth: 0.55,
  },
  {
    // Addressed by the purchase order, because the receipt does not exist until
    // the session is posted. Unlisted: opening "scan a delivery" with no
    // delivery in mind is not a thing anyone wants — warehouse mode and the PO
    // are the two ways in.
    key: 'inventory.receiving.scan',
    title: 'Scan a delivery',
    module: 'inventory',
    icon: faBarcodeRead,
    component: ReceivingScanSurface,
    listed: false,
  },
  {
    // The sticker that makes "scan the count sheet" true. Unlisted: it is always
    // about a specific document, and the four detail screens that own those
    // documents are the way in.
    key: 'inventory.documents.label',
    title: 'Print a label',
    module: 'inventory',
    icon: faPrint,
    component: DocumentLabelSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    // The phone-in-the-aisle surface. Listed, because somebody picking up a
    // tablet to go and work the floor is setting out to do exactly this.
    key: 'inventory.warehouse',
    title: 'Warehouse mode',
    module: 'inventory',
    icon: faBarcodeRead,
    section: 'Scanning',
    order: 12.6,
    keywords: ['scan', 'phone', 'tablet', 'handheld', 'floor', 'gun', 'pick', 'put away'],
    component: WarehouseModeSurface,
  },

  {
    key: 'inventory.transfers.list',
    title: 'Transfers',
    module: 'inventory',
    icon: faArrowRightArrowLeft,
    section: 'Where it lives',
    order: 11,
    keywords: ['move', 'between locations'],
    component: TransfersListSurface,
    createSurface: 'inventory.transfers.detail',
    createLabel: 'New transfer',
  },
  {
    key: 'inventory.transfers.detail',
    title: (params) => (params.id === 'new' ? 'New transfer' : 'Transfer'),
    module: 'inventory',
    icon: faArrowRightArrowLeft,
    component: TransferDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'inventory.counts.list',
    title: 'Stock counts',
    module: 'inventory',
    icon: faClipboardCheck,
    section: 'Where it lives',
    order: 12,
    keywords: ['stocktake', 'audit', 'physical count'],
    component: CountsListSurface,
    createSurface: 'inventory.counts.detail',
    createLabel: 'New count',
  },
  {
    key: 'inventory.counts.detail',
    title: (params) => (params.id === 'new' ? 'New count' : 'Stock count'),
    module: 'inventory',
    icon: faClipboardCheck,
    component: CountDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'inventory.movements.list',
    title: 'Movements',
    module: 'inventory',
    icon: faClockRotateLeft,
    section: 'Where it lives',
    order: 13,
    keywords: ['history', 'ledger', 'changes', 'why'],
    component: MovementsListSurface,
  },
  {
    key: 'inventory.lots.list',
    title: 'Lots & serials',
    module: 'inventory',
    icon: faLayerGroup,
    section: 'Where it lives',
    order: 14,
    keywords: ['batch', 'serial number', 'expiry', 'traceability', 'recall', 'lot'],
    component: LotsListSurface,
  },
  {
    key: 'inventory.lots.detail',
    title: 'Batch',
    module: 'inventory',
    icon: faLayerGroup,
    component: LotDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },

  /* ── Buying ────────────────────────────────────────────────────────────── */
  {
    key: 'inventory.suppliers.list',
    title: 'Suppliers',
    module: 'inventory',
    icon: faTruck,
    section: 'Buying',
    order: 20,
    keywords: ['vendors', 'wholesalers'],
    component: SuppliersListSurface,
    createSurface: 'inventory.suppliers.detail',
    createLabel: 'New supplier',
  },
  {
    key: 'inventory.suppliers.detail',
    title: (params) => (params.id === 'new' ? 'New supplier' : 'Supplier'),
    module: 'inventory',
    icon: faTruck,
    component: SupplierDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    key: 'inventory.purchase-orders.list',
    title: 'Purchase orders',
    module: 'inventory',
    icon: faClipboardList,
    section: 'Buying',
    order: 21,
    keywords: ['po', 'ordering', 'restock'],
    component: PurchaseOrdersListSurface,
    createSurface: 'inventory.purchase-orders.detail',
    createLabel: 'New purchase order',
  },
  {
    key: 'inventory.purchase-orders.detail',
    title: (params) => (params.id === 'new' ? 'New purchase order' : 'Purchase order'),
    module: 'inventory',
    icon: faClipboardList,
    component: PurchaseOrderDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'inventory.receiving.list',
    title: 'Receiving',
    module: 'inventory',
    icon: faBoxCheck,
    section: 'Buying',
    order: 22,
    keywords: ['delivery', 'goods in', 'check in'],
    component: ReceivingListSurface,
    createSurface: 'inventory.receiving.detail',
    createLabel: 'Receive a delivery',
  },
  {
    key: 'inventory.receiving.detail',
    title: (params) => (params.id === 'new' ? 'Receive a delivery' : 'Delivery'),
    module: 'inventory',
    icon: faBoxCheck,
    component: ReceiptDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'inventory.reorder',
    title: 'Reorder',
    module: 'inventory',
    icon: faArrowsRotate,
    section: 'Buying',
    order: 23,
    keywords: ['low stock', 'replenish', 'buy more'],
    component: ReorderListSurface,
  },

  /* ── Buying, the other side of it (docs/146 Phase 8) ──────────────────────
     Everything above is about placing an order. These are about the party at the
     other end: what they said they shipped, what came back, what they billed,
     and whether anybody had to sign for the spend. Deliberately separate
     surfaces rather than tabs on the purchase-order pane — the pane strip is
     already the tab bar, and "sign-offs beside overdue" is an arrangement a
     buyer genuinely wants. */
  {
    key: 'inventory.purchase-orders.approvals',
    title: 'Sign-offs',
    module: 'inventory',
    icon: faShieldCheck,
    section: 'Buying',
    order: 23.5,
    keywords: [
      'approval',
      'authorize',
      'authorise',
      'authorize',
      'sign off',
      'permission',
      'spending limit',
      'waiting',
      'pending approval',
    ],
    component: PoApprovalsSurface,
  },
  {
    key: 'inventory.purchase-orders.late',
    title: 'Overdue deliveries',
    module: 'inventory',
    icon: faCalendarClock,
    section: 'Buying',
    order: 23.6,
    keywords: [
      'late',
      'overdue',
      'chase',
      'not arrived',
      'where is my order',
      'supplier late',
      'missing delivery',
    ],
    component: LateOrdersSurface,
  },
  {
    key: 'inventory.advance-ship-notices',
    title: 'On the way',
    module: 'inventory',
    icon: faTruck,
    section: 'Buying',
    order: 23.7,
    keywords: [
      'asn',
      'advance ship notice',
      'shipment',
      'dispatched',
      'in transit',
      'tracking',
      'what is coming',
    ],
    component: AsnListSurface,
  },
  {
    key: 'inventory.advance-ship-notices.detail',
    title: 'Shipment',
    module: 'inventory',
    icon: faTruck,
    component: AsnDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    key: 'inventory.supplier-returns',
    title: 'Sent back',
    module: 'inventory',
    icon: faRotateLeft,
    section: 'Buying',
    order: 23.8,
    keywords: [
      'rtv',
      'return to vendor',
      'return to supplier',
      'credit note',
      'faulty',
      'damaged',
      'send back',
      'owed',
    ],
    component: SupplierReturnsListSurface,
    createSurface: 'inventory.supplier-returns.detail',
    createLabel: 'Send something back',
  },
  {
    key: 'inventory.supplier-returns.detail',
    title: (params) => (params.id === 'new' ? 'Send something back' : 'Return'),
    module: 'inventory',
    icon: faRotateLeft,
    component: SupplierReturnDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'inventory.supplier-bills',
    title: 'Bills to pay',
    module: 'inventory',
    icon: faReceipt,
    section: 'Buying',
    order: 23.9,
    keywords: [
      'invoice',
      'supplier invoice',
      'accounts payable',
      'three way match',
      'overcharged',
      'what do we owe',
      'pay',
    ],
    component: SupplierBillsListSurface,
    createSurface: 'inventory.supplier-bills.detail',
    createLabel: 'Enter an invoice',
  },
  {
    key: 'inventory.supplier-bills.detail',
    title: (params) => (params.id === 'new' ? 'Enter an invoice' : 'Supplier invoice'),
    module: 'inventory',
    icon: faReceipt,
    component: SupplierBillDetailSurface,
    listed: false,
    besideWidth: 0.55,
  },

  /* ── Getting it out of the door (docs/146 Phase 4) ─────────────────────── */
  {
    // "Walk" rather than "pick list": the people using this are not
    // warehouse-systems people, and a walk is what it physically IS. The URL and
    // the API keep `pick-list`, which IS the industry term and is what an
    // integrator should not have to relearn.
    key: 'inventory.picking.list',
    title: 'Walks',
    module: 'inventory',
    icon: faRoute,
    section: 'Going out',
    order: 25,
    keywords: [
      'pick list',
      'picking',
      'pick',
      'fetch',
      'route',
      'wave',
      'batch',
      'fulfil',
      'orders to pick',
    ],
    component: PickListsListSurface,
  },
  {
    key: 'inventory.picking.detail',
    title: 'Walk',
    module: 'inventory',
    icon: faRoute,
    component: PickListDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    // The picker's screen: one instruction, enormous, scan-first. Unlisted
    // because it is meaningless without a walk, and reached from the walk or
    // from warehouse mode — which is where somebody about to go and do it is.
    key: 'inventory.picking.guided',
    title: 'Picking',
    module: 'inventory',
    icon: faBarcodeRead,
    component: PickGuidedSurface,
    listed: false,
  },
  {
    // Listed, unlike most order-scoped surfaces: "go and pack" is a station
    // somebody stands at for a shift, not a thing they arrive at from a row.
    key: 'inventory.packing.bench',
    title: 'Pack bench',
    module: 'inventory',
    icon: faBoxOpen,
    section: 'Going out',
    order: 26,
    keywords: ['pack', 'box', 'parcel', 'packing slip', 'ship', 'verify', 'carton'],
    component: PackBenchSurface,
  },
  {
    key: 'inventory.picking.throughput',
    title: 'Pick & pack throughput',
    module: 'inventory',
    icon: faGauge,
    section: 'Reporting',
    order: 32,
    keywords: [
      'units per hour',
      'productivity',
      'accuracy',
      'short pick',
      'picker',
      'packer',
      'how fast',
    ],
    component: PickThroughputSurface,
  },
  {
    // Named for the question, not the accounting term. "Purchase price variance"
    // is what it is called in a textbook; "cost vs plan" is what someone typing
    // into the command palette at 9am is actually looking for — so the title is
    // the second and the keywords carry the first.
    key: 'inventory.costing.variance',
    title: 'Cost vs plan',
    module: 'inventory',
    icon: faScaleBalanced,
    section: 'Reporting',
    order: 33,
    keywords: [
      'purchase price variance',
      'ppv',
      'standard cost',
      'overpaying',
      'supplier price',
      'budget',
      'what it cost',
      'landed cost',
    ],
    component: CostVarianceSurface,
  },

  /* ── Making things (docs/146 Phase 6) ──────────────────────────────────── */
  {
    // "Recipes" and not "bills of materials": that is what they are, and the
    // person setting one up in a workshop has never used the other phrase. The
    // industry term is in the keywords so the palette still finds it.
    key: 'inventory.boms.list',
    title: 'Recipes',
    module: 'inventory',
    icon: faPotFood,
    section: 'Making',
    order: 27,
    keywords: [
      'bill of materials',
      'bom',
      'kit',
      'assembly',
      'components',
      'what it is made of',
      'build',
      'manufacture',
      'recipe',
    ],
    component: BomsListSurface,
    createSurface: 'inventory.boms.detail',
    createLabel: 'Write a recipe',
  },
  {
    key: 'inventory.boms.detail',
    title: (params) => (params.id === 'new' ? 'New recipe' : 'Recipe'),
    module: 'inventory',
    icon: faPotFood,
    component: BomDetailSurface,
    listed: false,
  },
  {
    key: 'inventory.assemblies.list',
    title: 'Runs',
    module: 'inventory',
    icon: faHammer,
    section: 'Making',
    order: 28,
    keywords: [
      'assembly order',
      'build',
      'make',
      'production',
      'work order',
      'disassemble',
      'take apart',
      'batch',
    ],
    component: AssembliesListSurface,
    createSurface: 'inventory.assemblies.detail',
    createLabel: 'Plan a run',
  },
  {
    key: 'inventory.assemblies.detail',
    title: (params) => (params.id === 'new' ? 'Plan a run' : 'Run'),
    module: 'inventory',
    icon: faHammer,
    component: AssemblyDetailSurface,
    listed: false,
  },

  /* ── Planning ──────────────────────────────────────────────────────────────
     Five surfaces, not one surface with five tabs. The pane strip along the top
     of the window is already a tab bar, so an in-surface tab strip is tabs on
     tabs — and it would also forbid the arrangement a buyer actually wants,
     which is "At risk" docked beside "Not selling". Each question gets its own
     dockable, deep-linkable, tear-off-able pane; planning-shell.tsx holds the
     chrome they share. */
  {
    // Its own section rather than under Reporting: everything in Reporting
    // describes what HAS happened, and every one of these describes what is
    // about to. A buyer opens these to decide, not to check.
    key: 'inventory.planning',
    title: 'At risk',
    module: 'inventory',
    icon: faGauge,
    section: 'Planning',
    order: 32,
    keywords: [
      'planning',
      'forecast',
      'demand',
      'reorder point',
      'safety stock',
      'service level',
      'stockout',
      'days of cover',
      'running out',
      'what should i buy',
    ],
    component: PlanningSurface,
  },
  {
    key: 'inventory.planning.classes',
    title: 'What matters',
    module: 'inventory',
    icon: faScaleBalanced,
    section: 'Planning',
    order: 33,
    keywords: [
      'abc',
      'xyz',
      'classification',
      'ranking',
      'top value',
      'long tail',
      'steady',
      'erratic',
      'where the money is',
    ],
    component: PlanningClassesSurface,
  },
  {
    key: 'inventory.planning.idle',
    title: 'Not selling',
    module: 'inventory',
    icon: faTurtle,
    section: 'Planning',
    order: 34,
    keywords: [
      'dead stock',
      'overstock',
      'slow moving',
      'obsolete',
      'excess',
      'cash tied up',
      'not moving',
    ],
    component: PlanningIdleSurface,
  },
  {
    // The opening balance. Cost is optional and the product form never asks for
    // it, so every value-of-stock figure reads $0.00 until this is filled in —
    // and $0.00 is indistinguishable from owning nothing. Listed, because the
    // person who needs it will not know to look for it: it is reached from the
    // figures that admit the gap AND from the launcher.
    key: 'inventory.costing.uncosted',
    title: 'What your stock cost you',
    module: 'inventory',
    icon: faCoins,
    section: 'Planning',
    order: 5,
    keywords: [
      'cost',
      'what i paid',
      'opening balance',
      'no cost yet',
      'not costed',
      'value of stock',
      'margin',
    ],
    component: UncostedStockSurface,
  },
  {
    key: 'inventory.planning.holding',
    title: 'Cost to keep',
    module: 'inventory',
    icon: faCoins,
    section: 'Planning',
    order: 35,
    keywords: [
      'holding cost',
      'carrying cost',
      'storage cost',
      'cost of capital',
      'what stock costs',
    ],
    component: PlanningHoldingSurface,
  },
  {
    key: 'inventory.planning.explain',
    title: 'Why this number',
    module: 'inventory',
    icon: faGauge,
    component: PlanningExplainSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    key: 'inventory.count-schedules',
    title: 'Counting schedules',
    module: 'inventory',
    icon: faCalendarClock,
    section: 'Planning',
    order: 36,
    keywords: [
      'cycle count',
      'count schedule',
      'recurring count',
      'stocktake',
      'blind count',
      'how often to count',
    ],
    component: CountSchedulesListSurface,
    createSurface: 'inventory.count-schedules.detail',
    createLabel: 'New schedule',
  },
  {
    key: 'inventory.count-schedules.detail',
    title: (params) => (params.id === 'new' ? 'New counting schedule' : 'Counting schedule'),
    module: 'inventory',
    icon: faCalendarClock,
    component: CountScheduleDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    // Last in the section, because it is the only one you visit once. Tenant-wide,
    // so it carries no location filter.
    key: 'inventory.planning.settings',
    title: 'Planning settings',
    module: 'inventory',
    icon: faSliders,
    section: 'Planning',
    order: 37,
    keywords: [
      'service level',
      'holding cost rate',
      'carrying rate',
      'dead stock days',
      'overstock days',
      'automatic reorder levels',
    ],
    component: PlanningSettingsSurface,
  },

  /* ── Reporting / Setup ─────────────────────────────────────────────────── */
  {
    key: 'inventory.reports',
    title: 'Reports',
    module: 'inventory',
    icon: faChartColumn,
    section: 'Reporting',
    order: 30,
    keywords: ['analytics', 'value', 'ageing', 'turnover', 'shrinkage', 'loss'],
    component: ReportsSurface,
  },
  {
    // The five ratios a business is asked for and could not previously get out
    // of sparx. Beside Reports rather than inside it: those are about what the
    // stock IS WORTH, these are about whether it is WORKING, and putting nine
    // cards on one screen is how neither question gets read.
    key: 'inventory.reports.performance',
    title: 'How it is performing',
    module: 'inventory',
    icon: faArrowTrendUp,
    section: 'Reporting',
    order: 31,
    keywords: [
      'sell-through',
      'gmroi',
      'fill rate',
      'stockout',
      'margin',
      'return on stock',
      'movement summary',
    ],
    component: PerformanceReportsSurface,
  },
  {
    key: 'inventory.reports.schedules',
    title: 'Sent to your inbox',
    module: 'inventory',
    icon: faCalendarClock,
    section: 'Reporting',
    order: 32,
    keywords: ['scheduled report', 'email report', 'weekly', 'monthly', 'subscription'],
    component: ReportSchedulesSurface,
  },
  {
    key: 'inventory.reports.schedule',
    title: (params) => (params.id === 'new' ? 'Send a report' : 'Scheduled report'),
    module: 'inventory',
    icon: faCalendarClock,
    component: ReportScheduleDetailSurface,
    listed: false,
  },
  {
    // Reporting, not Setup: it starts with a download of what you already have
    // and ends with figures. Somebody reaching for it is reconciling, not
    // configuring.
    key: 'inventory.reconciliation.books',
    title: 'Stock versus your books',
    module: 'inventory',
    icon: faScaleBalanced,
    section: 'Reporting',
    order: 36,
    keywords: [
      'reconcile',
      'accounting',
      'general ledger',
      'quickbooks',
      'xero',
      'year end',
      'inventory account',
    ],
    component: GlReconciliationSurface,
  },
  {
    // "Counting" rather than "Setup": the round trip this screen exists for —
    // download what the system thinks, count the shelves, upload the
    // differences — is the stock-take a business already does, not a thing
    // somebody configures once.
    key: 'inventory.stock.import',
    title: 'Import from a spreadsheet',
    module: 'inventory',
    icon: faFileSpreadsheet,
    section: 'Counting',
    order: 20,
    keywords: [
      'import',
      'csv',
      'spreadsheet',
      'upload',
      'bulk adjust',
      'stock take',
      'opening balance',
    ],
    component: StockImportSurface,
  },
  {
    // Reporting rather than Buying: it is something you READ about people you
    // already buy from, and it belongs next to the other numbers.
    key: 'inventory.suppliers.scorecards',
    title: 'Supplier performance',
    module: 'inventory',
    icon: faGauge,
    section: 'Reporting',
    order: 34,
    keywords: [
      'scorecard',
      'on time',
      'fill rate',
      'in full',
      'otif',
      'supplier quality',
      'league table',
      'who is reliable',
      'vendor performance',
    ],
    component: SupplierScorecardsSurface,
  },
  {
    // Sits in Reporting rather than Setup because it is something you READ, and
    // it belongs next to the other numbers people come here to check.
    key: 'inventory.integrity',
    title: 'Integrity',
    module: 'inventory',
    icon: faShieldCheck,
    section: 'Reporting',
    order: 31,
    keywords: [
      'accuracy',
      'trust',
      'audit',
      'reconcile',
      'does it add up',
      'oversell',
      'stale',
      'drift',
      'wrong numbers',
    ],
    component: IntegritySurface,
  },
  {
    // Setup rather than Reporting: it is a decision you make once with your
    // accountant, and it changes how every figure in Reporting is computed.
    key: 'inventory.costing.settings',
    title: 'How stock is valued',
    module: 'inventory',
    icon: faScaleBalanced,
    section: 'Setup',
    order: 39,
    keywords: [
      'costing',
      'fifo',
      'average cost',
      'standard cost',
      'valuation method',
      'currency',
      'landed cost',
      'freight allocation',
    ],
    component: CostingSettingsSurface,
  },
  {
    // Setup, because it is vocabulary you write once: the words your business
    // counts in. What each one CONTAINS is per item, and lives on the item.
    key: 'inventory.units',
    title: 'Units',
    module: 'inventory',
    icon: faRuler,
    section: 'Setup',
    order: 38,
    keywords: [
      'unit of measure',
      'uom',
      'case',
      'box',
      'pack',
      'pair',
      'dozen',
      'pallet',
      'kilogram',
      'each',
      'conversion',
    ],
    component: UnitsListSurface,
  },
  {
    // Setup, because it is a policy you write once and it changes what happens
    // to every order after it.
    key: 'inventory.purchase-orders.approval-rules',
    title: 'Spending limits',
    module: 'inventory',
    icon: faShieldCheck,
    section: 'Setup',
    order: 38.5,
    keywords: [
      'approval rule',
      'authorization',
      'authorisation',
      'authorization',
      'purchase limit',
      'spending control',
      'who can buy',
      'sign off threshold',
    ],
    component: PoApprovalRulesSurface,
  },
  {
    key: 'inventory.purchase-orders.approval-rules.detail',
    title: (params) => (params.id === 'new' ? 'New spending limit' : 'Spending limit'),
    module: 'inventory',
    icon: faShieldCheck,
    component: PoApprovalRuleDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    key: 'inventory.sources',
    title: 'Stock sources',
    module: 'inventory',
    icon: faLink,
    section: 'Setup',
    order: 40,
    keywords: ['feeds', 'sync', 'external'],
    component: SourcesListSurface,
    createSurface: 'inventory.sources.detail',
    createLabel: 'Add a source',
  },
  {
    key: 'inventory.sources.detail',
    title: (params) => (params.id === 'new' ? 'Add a source' : 'Stock source'),
    module: 'inventory',
    icon: faLink,
    component: SourceDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  /* ── Demand-side commitments (docs/146 Phase 9) ────────────────────────── */
  {
    // "Waiting list" rather than "backorders": the people using this are not
    // supply-chain people, and what the screen holds is a list of customers
    // waiting. The URL and the API keep `backorders`, which IS the industry
    // term and is what an integrator should not have to relearn.
    key: 'inventory.backorders',
    title: 'Waiting list',
    module: 'inventory',
    icon: faHourglass,
    section: 'Going out',
    order: 27,
    keywords: [
      'backorder',
      'back order',
      'waiting',
      'owed',
      'queue',
      'promised date',
      'when will it arrive',
      'allocate',
    ],
    component: BackordersSurface,
  },
  {
    key: 'inventory.backorders.detail',
    title: 'Owed',
    module: 'inventory',
    icon: faHourglass,
    component: BackorderDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'inventory.preorders',
    title: 'Preorders',
    module: 'inventory',
    icon: faCalendarClock,
    section: 'Going out',
    order: 28,
    keywords: [
      'preorder',
      'pre-order',
      'sell before it arrives',
      'coming soon',
      'ships in',
      'launch',
      'drop',
    ],
    component: PreordersSurface,
  },
  {
    // Under "Where it lives" rather than a money section: the question it
    // answers is physical — whose goods are on my shelves — and the accounting
    // consequence follows from that rather than the other way round.
    key: 'inventory.ownership',
    title: 'Whose stock',
    module: 'inventory',
    icon: faHandshake,
    section: 'Where it lives',
    order: 18,
    keywords: [
      'consignment',
      'ownership',
      'not mine',
      'customer owned',
      '3pl',
      'third party',
      'belongs to',
      'valuation',
    ],
    component: StockOwnershipSurface,
  },
  {
    key: 'inventory.consignment',
    title: 'Consignment settlement',
    module: 'inventory',
    icon: faHandshake,
    section: 'Buying',
    order: 47,
    keywords: ['consignment', 'settle', 'owed to supplier', 'pay for what sold', 'sale or return'],
    component: ConsignmentSettlementsSurface,
  },
  {
    key: 'inventory.consignment.detail',
    title: 'Settlement',
    module: 'inventory',
    icon: faHandshake,
    component: ConsignmentSettlementDetailSurface,
    listed: false,
    besideWidth: 0.55,
  },
  {
    key: 'inventory.expiring',
    title: 'Expiring stock',
    module: 'inventory',
    icon: faCalendarXmark,
    section: 'Reporting',
    order: 35,
    keywords: [
      'expiry',
      'expires',
      'use by',
      'best before',
      'short dated',
      'going off',
      'shelf life',
      'markdown',
      'write off',
      'fefo',
    ],
    component: ExpiringStockSurface,
  },

  // ── Onboarding: beating the spreadsheet (docs/146 Phase 11) ──

  {
    // Sectionless and first: this is where somebody with no stock in sparx yet
    // is supposed to land, and burying it under a settings group would be the
    // product hiding its own front door.
    key: 'inventory.setup',
    title: 'Set up your stock',
    module: 'inventory',
    icon: faRocket,
    order: 1,
    // One setup per account — a second copy would be two screens ticking the
    // same five steps.
    singleton: true,
    keywords: [
      'setup',
      'get started',
      'onboarding',
      'wizard',
      'first time',
      'import my stock',
      'opening balance',
      'thirty minutes',
    ],
    component: InventorySetupSurface,
  },
  {
    // "Counting", beside the importer: editing four hundred reorder points is
    // the same job as importing them, done by hand.
    key: 'inventory.stock.grid',
    title: 'Edit stock in a grid',
    module: 'inventory',
    icon: faGrid,
    section: 'Counting',
    order: 21,
    keywords: [
      'grid',
      'spreadsheet',
      'bulk edit',
      'inline edit',
      'paste',
      'mass update',
      'reorder points',
      'edit many',
    ],
    component: StockGridSurface,
  },
  {
    key: 'inventory.custom-fields',
    title: 'Your own columns',
    module: 'inventory',
    icon: faColumns3,
    section: 'Settings',
    order: 40,
    keywords: [
      'custom fields',
      'extra columns',
      'my own field',
      'aisle',
      'attributes',
      'metadata',
      'bespoke',
    ],
    component: InventoryCustomFieldsSurface,
  },
];
