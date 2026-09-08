'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE FIRST THIRTY MINUTES (docs/146 Phase 11)
//
// The setup wizard and its clock, reading somebody else's spreadsheet, the
// count that closes setup, the spreadsheet-grade grid, and the tenant's own
// columns.
//
// ── The shape everything here shares ─────────────────────────────────────
//
// A GUESS MUST NEVER BE INDISTINGUISHABLE FROM A FACT.
//
// Every column match carries a confidence and how it was reached, and a match
// under the threshold arrives as `null` rather than as a plausible wrong answer
// — because a mapping screen that comes pre-filled with the wrong column is
// worse than one that comes empty. The empty one gets read.
//
// The same rule governs the clock: hands-on time is null until there is
// something to measure, and `withinTarget` is null with it. An unmeasured setup
// is not a failed one.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { api } from '../../lib/api/client';

/* ── Setup ──────────────────────────────────────────────────────────────── */

export type SetupStepKey = 'locations' | 'import' | 'mapping' | 'opening_balance' | 'alerts';

export interface SetupStepView {
  key: SetupStepKey;
  title: string;
  summary: string;
  why: string;
  skippable: boolean;
  skipCost: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  result: Record<string, unknown>;
  /** Whether the account SHOWS this step's effect. Null when the step leaves no
   *  observable trace — never false, which would read as "we looked and it is
   *  not there". */
  satisfied: boolean | null;
  discrepancy: string | null;
}

export interface SetupTiming {
  elapsedMs: number | null;
  /** Time with somebody at the screen, gaps longer than a sitting excluded.
   *  Null when fewer than two things have happened. */
  handsOnMs: number | null;
  sittings: number;
  targetMs: number;
  withinTarget: boolean | null;
}

export interface SetupReadiness {
  locations: number;
  items: number;
  stockedPositions: number;
  openingCounts: number;
  levelsWithAlerts: number;
  importsApplied: number;
}

export interface SetupProgress {
  steps: SetupStepKey[];
  completedCount: number;
  skippedCount: number;
  remaining: SetupStepKey[];
  currentStep: SetupStepKey | null;
  isComplete: boolean;
  timing: SetupTiming;
  startedAt: string | null;
  completedAt: string | null;
  dismissedAt: string | null;
  stepViews: SetupStepView[];
  readiness: SetupReadiness;
}

export const onboardingKeys = {
  all: ['inventory', 'onboarding'] as const,
  setup: () => [...onboardingKeys.all, 'setup'] as const,
  recipes: () => [...onboardingKeys.all, 'recipes'] as const,
  profiles: () => [...onboardingKeys.all, 'profiles'] as const,
  openingBalance: () => [...onboardingKeys.all, 'opening-balance'] as const,
  grid: (filter: string) => [...onboardingKeys.all, 'grid', filter] as const,
  customFields: (entity: string) => [...onboardingKeys.all, 'custom-fields', entity] as const,
};

export function useSetupProgress() {
  return useQuery({
    queryKey: onboardingKeys.setup(),
    queryFn: () => api.get<SetupProgress>('/v1/inventory/setup'),
  });
}

function useInvalidateOnboarding() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
  };
}

export interface SetupStepInput {
  step: SetupStepKey;
  action?: 'complete' | 'skip' | 'reopen';
  result?: Record<string, unknown>;
}

export function useCompleteSetupStep() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (input: SetupStepInput) =>
      api.post<SetupProgress>('/v1/inventory/setup/steps', input),
    onSuccess: invalidate,
  });
}

export function useDismissSetup() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (dismissed: boolean) =>
      api.post<SetupProgress>('/v1/inventory/setup/dismiss', { dismissed }),
    onSuccess: invalidate,
  });
}

/** "18 minutes", "1 hour 4 minutes", or null. Null in, null out — the caller
 *  writes "not measured yet" rather than rendering "0 minutes". */
export function formatDuration(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
  return rest === 0 ? hourPart : `${hourPart} ${rest} minute${rest === 1 ? '' : 's'}`;
}

/* ── Reading somebody else's spreadsheet ────────────────────────────────── */

export interface MigrationRecipe {
  key: string;
  name: string;
  description: string;
  recognisedBy: string;
  extraAliases: Record<string, string[]>;
  options: Record<string, unknown>;
}

export function useMigrationRecipes() {
  return useQuery({
    queryKey: onboardingKeys.recipes(),
    queryFn: () => api.get<{ recipes: MigrationRecipe[] }>('/v1/inventory/import-recipes'),
    staleTime: 60 * 60 * 1000,
  });
}

export interface ColumnMatch {
  key: string;
  label: string;
  required: boolean;
  hint: string;
  /** The heading this field reads, or null when nothing was close enough. */
  header: string | null;
  confidence: number;
  reason: 'exact' | 'similar' | 'none';
  alternatives: { header: string; confidence: number }[];
}

export interface MappingVerdict {
  matches: ColumnMatch[];
  unmatchedHeaders: string[];
  missingRequired: string[];
  needsConfirmation: string[];
  ready: boolean;
}

export interface NumberFormat {
  decimal: '.' | ',';
  grouped: boolean;
  sampleCount: number;
}

export interface ImportProfile {
  id: string;
  name: string;
  kind: string;
  mapping: Record<string, string>;
  options: {
    reason: string;
    warehouseId: string | null;
    decimal: '.' | ',';
    createMissingItems: boolean;
  };
  recipeKey: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportPreview {
  filename: string | null;
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  mapping: MappingVerdict;
  numberFormat: NumberFormat | null;
  profile: ImportProfile | null;
  recipe: MigrationRecipe | null;
}

export interface PreviewInput {
  csv: string;
  filename?: string;
  recipe_key?: string | null;
  profile_id?: string | null;
}

/** Read the file, guess the columns, WRITE NOTHING. */
export function usePreviewImport() {
  return useMutation({
    mutationFn: (input: PreviewInput) =>
      api.post<ImportPreview>('/v1/inventory/imports/preview', input),
  });
}

export function useImportProfiles() {
  return useQuery({
    queryKey: onboardingKeys.profiles(),
    queryFn: () => api.list<ImportProfile>('/v1/inventory/import-profiles'),
  });
}

export interface SaveProfileInput {
  name: string;
  mapping: Record<string, string>;
  options?: Partial<ImportProfile['options']>;
  recipeKey?: string | null;
}

export function useSaveImportProfile() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (input: SaveProfileInput) =>
      api.post<ImportProfile>('/v1/inventory/import-profiles', input),
    onSuccess: invalidate,
  });
}

export function useDeleteImportProfile() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/inventory/import-profiles/${id}`),
    onSuccess: invalidate,
  });
}

/* ── Resolving the rows that did not land ───────────────────────────────── */

export type ImportRowResolution =
  | { line: number; action: 'skip' }
  | { line: number; action: 'match'; variantId: string }
  | { line: number; action: 'create'; sku: string; title: string; unitCostCents?: number | null };

export function useResolveImportRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; resolutions: ImportRowResolution[] }) =>
      api.post<unknown>(`/v1/inventory/imports/${input.id}/resolve`, {
        resolutions: input.resolutions,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/* ── The opening balance ────────────────────────────────────────────────── */

export interface OpeningBalanceStatus {
  activeCountId: string | null;
  activeCountNumber: string | null;
  activeCountStatus: string | null;
  posted: {
    countId: string;
    number: string;
    warehouseId: string;
    warehouseName: string;
    postedAt: string;
    lines: number;
  }[];
  /** Locations holding stock whose figures rest on an assumption. */
  locationsWithoutOpening: { warehouseId: string; name: string; stockedItems: number }[];
}

export function useOpeningBalance() {
  return useQuery({
    queryKey: onboardingKeys.openingBalance(),
    queryFn: () => api.get<OpeningBalanceStatus>('/v1/inventory/opening-balance'),
  });
}

export function useStartOpeningBalance() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (input: { warehouse_id: string; is_blind?: boolean; note?: string | null }) =>
      api.post<{ id: string; number: string }>('/v1/inventory/opening-balance', input),
    onSuccess: invalidate,
  });
}

/* ── The tenant's own columns ───────────────────────────────────────────── */

export type CustomFieldEntity = 'variant' | 'level' | 'supplier' | 'purchase_order';

export type CustomFieldType =
  'text' | 'number' | 'money' | 'date' | 'boolean' | 'select' | 'multi_select' | 'url';

export interface CustomField {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  helpText: string | null;
  required: boolean;
  showInList: boolean;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Headings — a section is a set of things, so these are plural. */
export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  variant: 'Items',
  level: 'Stock at a location',
  supplier: 'Suppliers',
  purchase_order: 'Purchase orders',
};

/** Sentences — "a new column on ITEM", "appears on every ITEM". Kept apart from
 *  the headings rather than derived: dropping the plural into these produced
 *  "It appears on every items", and no amount of trimming an "s" would have got
 *  "stock at a location" right anyway. */
export const CUSTOM_FIELD_ENTITY_NOUNS: Record<CustomFieldEntity, string> = {
  variant: 'item',
  level: 'stocked location',
  supplier: 'supplier',
  purchase_order: 'purchase order',
};

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  money: 'Money',
  date: 'Date',
  boolean: 'Yes / no',
  select: 'One of a list',
  multi_select: 'Any of a list',
  url: 'Link',
};

export function useCustomFields(entity?: CustomFieldEntity, includeInactive = false) {
  return useQuery({
    queryKey: onboardingKeys.customFields(`${entity ?? 'all'}:${includeInactive ? 'all' : 'live'}`),
    queryFn: () =>
      api.list<CustomField>('/v1/inventory/custom-fields', {
        ...(entity ? { entity } : {}),
        ...(includeInactive ? { include_inactive: 'true' } : {}),
      }),
  });
}

export interface CreateCustomFieldInput {
  entity: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options?: string[];
  helpText?: string | null;
  required?: boolean;
  showInList?: boolean;
  position?: number;
}

export function useCreateCustomField() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (input: CreateCustomFieldInput) =>
      api.post<CustomField>('/v1/inventory/custom-fields', input),
    onSuccess: invalidate,
  });
}

export function useUpdateCustomField() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (input: {
      id: string;
      patch: Partial<CreateCustomFieldInput> & { isActive?: boolean };
    }) => api.patch<CustomField>(`/v1/inventory/custom-fields/${input.id}`, input.patch),
    onSuccess: invalidate,
  });
}

export function useDeleteCustomField() {
  const invalidate = useInvalidateOnboarding();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/inventory/custom-fields/${id}`),
    onSuccess: invalidate,
  });
}

/* ── Stock as a spreadsheet ─────────────────────────────────────────────── */

export type CustomFieldValue = string | number | boolean | string[] | null;

export interface StockGridRow {
  variantId: string;
  warehouseId: string;
  sku: string;
  title: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  safetyBuffer: number;
  unitCostCents: number | null;
  avgCostCents: number | null;
  abcClass: string | null;
  customFields: Record<string, CustomFieldValue>;
}

export interface StockGridPage {
  rows: StockGridRow[];
  total: number;
  customFields: CustomField[];
}

export interface StockGridFilter {
  warehouseId?: string;
  search?: string;
  lowOnly?: boolean;
  take?: number;
  skip?: number;
}

function gridKey(filter: StockGridFilter): string {
  return [
    filter.warehouseId ?? '',
    filter.search ?? '',
    filter.lowOnly ? 'low' : '',
    filter.take ?? '',
    filter.skip ?? '',
  ].join(':');
}

export function useStockGrid(filter: StockGridFilter = {}) {
  return useQuery({
    queryKey: onboardingKeys.grid(gridKey(filter)),
    queryFn: () =>
      api.get<StockGridPage>('/v1/inventory/stock-grid', {
        ...(filter.warehouseId ? { warehouse_id: filter.warehouseId } : {}),
        ...(filter.search ? { search: filter.search } : {}),
        ...(filter.lowOnly ? { low_only: 'true' } : {}),
        ...(filter.take !== undefined ? { take: filter.take } : {}),
        ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      }),
    placeholderData: (previous) => previous,
  });
}

export interface StockGridEdit {
  variantId: string;
  warehouseId: string;
  onHand?: number;
  reorderPoint?: number | null;
  reorderQuantity?: number | null;
  safetyBuffer?: number;
  unitCostCents?: number | null;
  customFields?: Record<string, unknown>;
}

export interface StockGridEditResult {
  variantId: string;
  warehouseId: string;
  delta: number | null;
  onHand: number;
  fieldsChanged: string[];
  error: string | null;
}

export interface StockGridSaveResult {
  results: StockGridEditResult[];
  saved: number;
  failed: number;
  unitsChanged: number;
}

export function useSaveStockGrid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { edits: StockGridEdit[]; reason?: string; note?: string | null }) =>
      api.post<StockGridSaveResult>('/v1/inventory/stock-grid', input),
    onSuccess: () => {
      // The whole inventory tree: a quantity edit moves the stock list, the
      // low-stock report and the valuation, and a grid that leaves the rest of
      // the app showing yesterday's numbers is the reason people stop trusting
      // the grid.
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function stockGridCsvPath(filter: StockGridFilter = {}): string {
  const params = new URLSearchParams({ format: 'csv' });
  if (filter.warehouseId) params.set('warehouse_id', filter.warehouseId);
  if (filter.search) params.set('search', filter.search);
  if (filter.lowOnly) params.set('low_only', 'true');
  return `/v1/inventory/stock-grid?${params.toString()}`;
}

/** A custom-field value as a person reads it. Null renders as an em dash by the
 *  caller rather than as "0" or "No" decided here. */
export function formatCustomFieldValue(field: CustomField, value: CustomFieldValue): string | null {
  if (value === null || value === undefined) return null;
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  if (field.type === 'money' && typeof value === 'number') return (value / 100).toFixed(2);
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
