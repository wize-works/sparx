'use client';

// AI module data — the reusable prompt library ("Instructions") and the MCP
// tool-policy overlay ("What AI can touch").
//
// This file OWNS every `['ai', …]` query key and the shapes the two AI surfaces
// read. The vocabulary is kept plain on purpose: a "prompt" is an instruction you
// have written for the assistant, a "tool" is one thing an AI assistant is
// allowed to look at or change on your behalf. The helpers at the bottom turn the
// backend's terse enums and tool names into that language once, so both surfaces
// speak alike.
//
// Both backends are already built (wizeworks/services/api-rest/src/routes/v1/ai/*). Reads
// are viewer; prompt writes are editor; installing the default prompts and every
// tool-policy write are admin. The surfaces mirror those bars with useViewer() so
// they never put a control in front of someone the server will refuse — the
// server stays the real gate.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
import { slugify as slugifyWebSegment } from '../../lib/slugify';

/* ── Prompt library shapes (mirror wizeworks/services/api-rest/src/lib/ai/types.ts) ──── */

export type PromptCategory =
  'persona' | 'support' | 'email' | 'product' | 'seo' | 'social' | 'crm' | 'general';

/** Group order for the list — persona first, since it is the one that grounds
 *  the live-chat assistant's whole personality. */
export const PROMPT_CATEGORIES: readonly PromptCategory[] = [
  'persona',
  'support',
  'email',
  'product',
  'seo',
  'social',
  'crm',
  'general',
];

/** A declared `{{placeholder}}` the editor surfaces as a hint. Advisory only —
 *  the assistant fills these in when it runs the prompt. */
export interface PromptVariable {
  key: string;
  label: string;
  example?: string;
}

export interface PromptTemplateDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: PromptCategory;
  body: string;
  variables: PromptVariable[];
  model: string | null;
  enabled: boolean;
  /** True for a platform-default prompt installed by "add the starter set". */
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The create body. `key` is immutable kebab-case; `propertyId` omitted → the
 *  site being worked in, explicit null → shared across every site. */
export interface PromptTemplateCreate {
  key: string;
  name: string;
  description?: string | null;
  category: PromptCategory;
  body: string;
  variables: PromptVariable[];
  model?: string | null;
  enabled: boolean;
  propertyId?: string | null;
}

/** The patch body — every field optional, `key` cannot change. */
export interface PromptTemplateUpdate {
  name?: string;
  description?: string | null;
  category?: PromptCategory;
  body?: string;
  variables?: PromptVariable[];
  model?: string | null;
  enabled?: boolean;
}

/* ── Tool-policy shapes ────────────────────────────────────────────────────── */

/** One MCP tool as the policy screen sees it: catalog metadata plus this site's
 *  effective exposure. `enabled` false ⇒ hidden from and refused by any AI
 *  connection. `explicit` ⇒ the tenant changed it from the default (default-on).
 *  `write` ⇒ the tool can change data, not just read it. */
export interface ToolPolicyDto {
  name: string;
  description: string;
  scope: string;
  /** The business area a tool maps to, or null for platform-wide capabilities. */
  module: string | null;
  write: boolean;
  enabled: boolean;
  explicit: boolean;
}

/* ── Usage-report shapes (mirror wizeworks/services/api-rest/src/routes/v1/ai/reports.ts) ─
 *
 * These power the Overview — live MCP-usage aggregates over the audit trail. What
 * a connected AI app looked up or changed lands in that trail, so every figure
 * here is real; there is nothing to fabricate. When a tenant has no connected app
 * yet, the counts are simply zero and the feeds are empty. */

/** The headline figures: how much connected apps have been calling, how often it
 *  worked, how many distinct tools they used, and how many keys authorize them. */
export interface AiReportSummary {
  mcpRequests: number;
  mcpSuccess: number;
  mcpError: number;
  /** Share of classified calls that succeeded, 0–1, or null when nothing ran. */
  successRate: number | null;
  uniqueTools: number;
  apiKeysActive: number;
  apiKeysTotal: number;
}

/** One day (or week/month) bucket of request volume. */
export interface AiTimeseriesPoint {
  bucket: string;
  requests: number;
  errors: number;
}

export interface AiTimeseries {
  range: { from: string; to: string; grain: 'day' | 'week' | 'month' };
  points: AiTimeseriesPoint[];
  totals: { requests: number; errors: number };
}

/** One of the most-called tools over the window. */
export interface AiTopTool {
  tool: string;
  calls: number;
  errors: number;
  successRate: number | null;
}

/** One recent tool call by a connected app — the activity feed row. */
export interface AiActivityItem {
  id: string;
  tool: string;
  actorId: string | null;
  outcome: string;
  createdAt: string;
}

/* ── Query keys ────────────────────────────────────────────────────────────── */

export const AI_KEYS = {
  promptsRoot: ['ai', 'prompt-templates'] as const,
  prompts: ['ai', 'prompt-templates', 'list'] as const,
  prompt: (id: string) => ['ai', 'prompt-template', id] as const,
  toolPolicies: ['ai', 'tool-policies'] as const,
  reportsSummary: ['ai', 'reports', 'summary'] as const,
  reportsTimeseries: ['ai', 'reports', 'timeseries'] as const,
  reportsTopTools: ['ai', 'reports', 'top-tools'] as const,
  reportsActivity: ['ai', 'reports', 'activity'] as const,
};

/* ── Prompt reads ──────────────────────────────────────────────────────────── */

/** The whole library for this site (its own prompts plus the tenant-wide ones).
 *  Loaded unfiltered — the list groups and filters by category client-side, and
 *  the set is small enough that one read beats a request per tab. */
export function usePromptTemplates() {
  return useQuery({
    queryKey: AI_KEYS.prompts,
    queryFn: () => api.get<PromptTemplateDto[]>('/v1/ai/prompt-templates'),
    staleTime: 30_000,
  });
}

/** One prompt, for the editor. Disabled for the create state (`new`), which has
 *  nothing to load. */
export function usePromptTemplate(id: string) {
  return useQuery({
    queryKey: AI_KEYS.prompt(id),
    queryFn: () => api.get<PromptTemplateDto>(`/v1/ai/prompt-templates/${id}`),
    enabled: id !== '' && id !== 'new',
  });
}

/* ── Prompt writes ─────────────────────────────────────────────────────────── */

function useInvalidatePrompts() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: AI_KEYS.promptsRoot });
    if (id) void queryClient.invalidateQueries({ queryKey: AI_KEYS.prompt(id) });
  };
}

export function useCreatePromptTemplate() {
  const invalidate = useInvalidatePrompts();
  return useMutation({
    mutationFn: (input: PromptTemplateCreate) =>
      api.post<PromptTemplateDto>('/v1/ai/prompt-templates', input),
    onSuccess: (created) => {
      invalidate(created.id);
    },
  });
}

export function useUpdatePromptTemplate(id: string) {
  const invalidate = useInvalidatePrompts();
  return useMutation({
    mutationFn: (patch: PromptTemplateUpdate) =>
      api.patch<PromptTemplateDto>(`/v1/ai/prompt-templates/${id}`, patch),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDeletePromptTemplate() {
  const invalidate = useInvalidatePrompts();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: boolean }>(`/v1/ai/prompt-templates/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/** Install the platform-default prompt set (idempotent — returns how many were
 *  added). The empty-state CTA; admin-only server-side. */
export function useInstallDefaultPrompts() {
  const invalidate = useInvalidatePrompts();
  return useMutation({
    mutationFn: () => api.post<{ added: number }>('/v1/ai/prompt-templates/install-defaults'),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── Tool-policy reads + writes ────────────────────────────────────────────── */

export function useToolPolicies() {
  return useQuery({
    queryKey: AI_KEYS.toolPolicies,
    queryFn: () => api.get<ToolPolicyDto[]>('/v1/ai/tool-policies'),
    staleTime: 30_000,
  });
}

/**
 * Turn one tool on or off for this site. Optimistic: the switch flips instantly
 * and rolls back if the server refuses, with a settle-time refetch to reconcile
 * (the `explicit` flag in particular is server-decided). A tool becomes explicit
 * the moment it is toggled, which is why the optimistic patch sets it.
 */
export function useSetToolPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tool, enabled }: { tool: string; enabled: boolean }) =>
      api.put<ToolPolicyDto>(`/v1/ai/tool-policies/${tool}`, { enabled }),
    onMutate: async ({ tool, enabled }) => {
      await queryClient.cancelQueries({ queryKey: AI_KEYS.toolPolicies });
      const previous = queryClient.getQueryData<ToolPolicyDto[]>(AI_KEYS.toolPolicies);
      if (previous) {
        queryClient.setQueryData<ToolPolicyDto[]>(
          AI_KEYS.toolPolicies,
          previous.map((t) => (t.name === tool ? { ...t, enabled, explicit: true } : t))
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(AI_KEYS.toolPolicies, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: AI_KEYS.toolPolicies });
    },
  });
}

/** Drop this site's override for one tool, falling back to the default (on). */
export function useResetToolPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tool: string) => api.delete<{ reset: boolean }>(`/v1/ai/tool-policies/${tool}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AI_KEYS.toolPolicies });
    },
  });
}

/** Clear every override at once — all tools back to the default (on). */
export function useResetAllToolPolicies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ cleared: number }>('/v1/ai/tool-policies/reset'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AI_KEYS.toolPolicies });
    },
  });
}

/* ── Usage-report reads (the Overview) ─────────────────────────────────────── */

/** Headline MCP-usage figures over the last 30 days. */
export function useAiSummary() {
  return useQuery({
    queryKey: AI_KEYS.reportsSummary,
    queryFn: () => api.get<AiReportSummary>('/v1/ai/reports/summary'),
    staleTime: 30_000,
  });
}

/** Request volume per day, for the usage chart. */
export function useAiTimeseries() {
  return useQuery({
    queryKey: AI_KEYS.reportsTimeseries,
    queryFn: () => api.get<AiTimeseries>('/v1/ai/reports/timeseries', { grain: 'day' }),
    staleTime: 30_000,
  });
}

/** The tools connected apps call most, for the top-tools panel. */
export function useAiTopTools(limit = 6) {
  return useQuery({
    queryKey: AI_KEYS.reportsTopTools,
    queryFn: () => api.get<AiTopTool[]>('/v1/ai/reports/top-tools', { limit }),
    staleTime: 30_000,
  });
}

/** The most recent tool calls, for the activity feed. */
export function useAiActivity(limit = 6) {
  return useQuery({
    queryKey: AI_KEYS.reportsActivity,
    queryFn: () => api.get<AiActivityItem[]>('/v1/ai/reports/activity', { limit }),
    staleTime: 30_000,
  });
}

/* ── Role gating (mirrors api-core's ranked hierarchy) ─────────────────────── */

// viewer < editor < admin < owner. The lateral roles (builder/marketing/…) floor
// to read-only, exactly as the server's ROLE_ORDER does, so a control never
// appears for someone the server will refuse.
const ROLE_RANK: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/** May this viewer create/edit/delete prompts? (Server bar: editor = rank 1.) */
export function canEditPrompts(role: string | undefined): boolean {
  return (ROLE_RANK[role ?? ''] ?? 0) >= 1;
}

/** May this viewer install the default set, or change tool exposure?
 *  (Server bar: admin = rank 2.) */
export function canAdminAi(role: string | undefined): boolean {
  return (ROLE_RANK[role ?? ''] ?? 0) >= 2;
}

/* ── Presentation helpers (shared, so both surfaces speak alike) ───────────── */

/** A category in the owner's words. */
export function categoryLabel(category: PromptCategory): string {
  switch (category) {
    case 'persona':
      return 'Assistant personality';
    case 'support':
      return 'Customer support replies';
    case 'email':
      return 'Email writing';
    case 'product':
      return 'Product descriptions';
    case 'seo':
      return 'Search wording';
    case 'social':
      return 'Social posts';
    case 'crm':
      return 'Customer notes';
    case 'general':
      return 'General';
  }
}

/** One line on what a category of instruction is for. */
export function categoryHint(category: PromptCategory): string {
  switch (category) {
    case 'persona':
      return 'How the assistant should sound and what it should never say. The live chat assistant follows the one you switch on.';
    case 'support':
      return 'Ready answers your assistant can give to common customer questions.';
    case 'email':
      return 'How the assistant should word emails it drafts for you.';
    case 'product':
      return 'How the assistant should describe the things you sell.';
    case 'seo':
      return 'Wording that helps people find you in search results.';
    case 'social':
      return 'How the assistant should write posts for social media.';
    case 'crm':
      return 'How the assistant should summarise and note things about your customers.';
    case 'general':
      return 'Instructions that do not fit one particular job.';
  }
}

/**
 * The server's own sentence for a 4xx, worth showing verbatim: the prompt routes
 * name the exact field that was rejected (a bad key, a body over the limit), and
 * the policy routes name an unknown tool. A 5xx has no such sentence, so it falls
 * back to the caller's wording.
 */
export function aiErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

const AI_NUMBER = new Intl.NumberFormat();

/** A whole count, thousands-separated. */
export function formatCount(n: number): string {
  return AI_NUMBER.format(Math.max(0, Math.round(n)));
}

/** A percentage from a 0–1 fraction, e.g. 0.94 → "94%". Null renders as an
 *  em-dash so an untouched metric never reads as 0%. */
export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return '—';
  return `${Math.round(fraction * 100)}%`;
}

/**
 * A raw tool identifier turned into something a person can read when we have no
 * catalog description to hand — `orders.search_by_email` → "Orders search by
 * email". The tool-policy list carries the real plain-language descriptions, so
 * callers prefer those and fall back to this only for a tool no longer in the
 * catalog.
 */
export function humanizeTool(tool: string): string {
  const words = tool
    .replace(/[._-]+/g, ' ')
    // Drop internal engine names an owner would never recognise: the site
    // builder's rendering engine is called "silica" in tool ids, but to an
    // owner it is just their site (`publish_silica_site` → "Publish site").
    .replace(/\bsilica\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (words === '') return tool;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Whether a reported outcome counts as a failure, for its tone. */
export function isFailedOutcome(outcome: string): boolean {
  return outcome.toLowerCase() === 'error';
}

/** A kebab-case slug suggested from a name, for the immutable key on create. */
export function slugify(input: string): string {
  return slugifyWebSegment(input.trim(), 120);
}
