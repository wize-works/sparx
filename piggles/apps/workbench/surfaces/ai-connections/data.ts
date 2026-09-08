'use client';

// AI connections data — the two AI plumbing concepts that point in opposite
// directions, kept in one file because the surface presents them together.
//
//   1. Your AI account (BYOK) — the tenant's OWN Anthropic/OpenAI account, the
//      one credential every AI feature runs on. Piggles never uses AI on a
//      business's behalf without it (a CORE platform convention). The raw key
//      never travels — the server stores an encrypted copy and returns only a
//      last-4 hint. Backed by /v1/ai/credentials.
//   2. Apps you connect (MCP) — outside AI apps the owner points AT their
//      Piggles business, in two credential flavours: connected assistants
//      (OAuth, backed by /v1/ai/mcp-connections) and scoped API keys (backed by
//      /v1/ai/api-keys). The address they are pointed at is `mcpEndpoint`, which
//      the server resolves from the tenant's brand — it is mcp.mypiggles.com
//      here, and a customer copies it by hand into their assistant.
//
// Reads that expose the BYOK account are viewer; everything that exposes or
// changes key/connection material is admin — mirrored on the surface with
// useViewer so a control never appears for someone the server will refuse.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/** The AI providers a business can bring their own account for. Mirrors the
 *  server's AI_PROVIDERS. */
export type AiProvider = 'anthropic' | 'openai';

export interface AiCredential {
  provider: AiProvider;
  /** Last four characters of the stored key — a "is this the right one?" hint. */
  keyLast4: string;
  connectedAt: string;
  lastVerifiedAt: string | null;
}

interface CredentialResponse {
  credential: AiCredential | null;
  /** The address an AI app connects to reach this business's data over MCP. */
  mcpEndpoint: string;
}

export const AI_CREDENTIAL_KEY = ['ai-credentials'];

/** The connected AI account (or null) plus the MCP endpoint, in one read. */
export function useAiCredential() {
  return useQuery({
    queryKey: AI_CREDENTIAL_KEY,
    queryFn: () => api.get<CredentialResponse>('/v1/ai/credentials'),
    staleTime: 30_000,
  });
}

function useInvalidateCredential() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: AI_CREDENTIAL_KEY });
}

/** Connect or replace the business's AI account. The server verifies the key
 *  with a real provider call before storing it, so a rejected key comes back as
 *  a 400 with the provider's own sentence. */
export function useConnectAiCredential() {
  const invalidate = useInvalidateCredential();
  return useMutation({
    mutationFn: (input: { provider: AiProvider; apiKey: string }) =>
      api.put<CredentialResponse>('/v1/ai/credentials', input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/** Disconnect the AI account entirely. */
export function useDisconnectAiCredential() {
  const invalidate = useInvalidateCredential();
  return useMutation({
    mutationFn: () => api.delete<{ removed: boolean }>('/v1/ai/credentials'),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/** Result of re-checking a stored key against its provider. */
export type CredentialTestResult =
  { ok: true; credential: AiCredential } | { ok: false; error: string };

/** Re-check the stored key right now. A diagnostic, not a gate — it resolves to
 *  the outcome rather than throwing, and stamps a fresh "last checked" on
 *  success. */
export function useTestAiCredential() {
  const invalidate = useInvalidateCredential();
  return useMutation({
    mutationFn: () => api.post<CredentialTestResult>('/v1/ai/credentials/test'),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/**
 * The server's own sentence for a 4xx, worth showing verbatim: the connect route
 * relays the provider's exact reason a key was rejected ("that key was rejected —
 * double-check you copied it correctly"). A 5xx has no such sentence, so it falls
 * back to the caller's wording.
 */
export function aiCredentialErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/* ── Presentation helpers ──────────────────────────────────────────────────── */

/** The provider in the owner's words. Anthropic's consumer brand is Claude, so
 *  it is named alongside — "Anthropic" alone means little to a non-technical
 *  owner who signed up at claude.ai. */
export function providerLabel(provider: AiProvider): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic (Claude)';
  }
}

/** Where a business goes to create a key for each provider — a real place to get
 *  one beats a field with no idea where the value comes from. */
export function providerKeyHelp(provider: AiProvider): { where: string; url: string } {
  switch (provider) {
    case 'openai':
      return {
        where: 'platform.openai.com, under API keys',
        url: 'https://platform.openai.com/api-keys',
      };
    case 'anthropic':
      return {
        where: 'console.anthropic.com, under API keys',
        url: 'https://console.anthropic.com/settings/keys',
      };
  }
}

/** How the connection is doing, in words rather than a bare timestamp. `tone`
 *  feeds `<Badge color>` so state carries its own color, per the platform rule. */
export function credentialState(credential: AiCredential): {
  label: string;
  tone: 'success' | 'warning' | 'info';
  detail: string;
} {
  if (!credential.lastVerifiedAt) {
    return {
      label: 'Not checked yet',
      tone: 'info',
      detail:
        'This account is connected but has not been checked since. Use Check now to confirm it still works.',
    };
  }
  const verified = new Date(credential.lastVerifiedAt).getTime();
  const daysSince = (Date.now() - verified) / 86_400_000;
  // A working key does not expire, but a business may cancel their AI plan or
  // rotate the key elsewhere. A gentle nudge after a fortnight beats presenting
  // a months-old "working" as current truth.
  if (daysSince > 14) {
    return {
      label: 'Worth re-checking',
      tone: 'warning',
      detail:
        'It has been a while since this account was checked. Use Check now to confirm it is still working.',
    };
  }
  return {
    label: 'Working',
    tone: 'success',
    detail: 'This account is connected and answered the last time it was checked.',
  };
}

/* ── Connected assistants (MCP OAuth connections) ───────────────────────────── */

/** One outside AI app that connected itself through sign-in + approval. */
export interface McpConnection {
  clientId: string;
  clientName: string | null;
  /** Union of scopes across this connection's live tokens. */
  scopes: string[];
  /** How many live sign-ins this app holds. */
  tokenCount: number;
  firstAuthorizedAt: string;
  lastAuthorizedAt: string;
  accessExpiresAt: string;
}

export const MCP_CONNECTIONS_KEY = ['ai-mcp-connections'];

/** The tenant's connected assistants. Admin-only on the server (it exposes who
 *  can reach the business's data), so callers pass `enabled` off for non-admins
 *  rather than firing a request the server will refuse. */
export function useMcpConnections(enabled: boolean) {
  return useQuery({
    queryKey: MCP_CONNECTIONS_KEY,
    queryFn: () => api.get<McpConnection[]>('/v1/ai/mcp-connections'),
    enabled,
    staleTime: 30_000,
  });
}

/** Cut a connected assistant off — deletes its sign-ins for this business at
 *  once. The app must approve access again to return. */
export function useRevokeMcpConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) =>
      api.delete<{ revoked: number }>(`/v1/ai/mcp-connections/${encodeURIComponent(clientId)}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MCP_CONNECTIONS_KEY });
    },
  });
}

/* ── API keys (scoped sk_live_ keys) ────────────────────────────────────────── */

/** A key's metadata — never the key itself, which is shown once at issuance. */
export interface ApiKeySummary {
  id: string;
  name: string;
  /** Visible prefix, e.g. `sk_live_ab12cd34` — enough to recognise a key. */
  keyPrefix: string;
  scopes: string[];
  /** The site this key is limited to; null = the whole business. */
  propertyId: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** The one-time issuance result — `plaintext` is shown once and never returns. */
export interface IssuedKey {
  plaintext: string;
  prefix: string;
  id: string;
  scopes: string[];
  propertyId: string | null;
  createdAt: string;
  expiresAt: string | null;
}

/** One grantable permission, in the owner's words. Mirrors the server's
 *  McpScopeMeta. */
export interface ScopeMeta {
  scope: string;
  module: string;
  kind: 'read' | 'write';
  label: string;
  description: string;
  /** Heavier, bulk/destructive permissions — flagged so the picker can warn. */
  sensitive?: boolean;
}

export const API_KEYS_KEY = ['ai-api-keys'];
export const SCOPE_CATALOG_KEY = ['ai-api-keys', 'scope-catalog'];

/** Every API key on the account, active first then the revoked sink. Admin-only
 *  on the server (keys are security-sensitive). */
export function useApiKeys(enabled: boolean) {
  return useQuery({
    queryKey: API_KEYS_KEY,
    queryFn: () => api.get<ApiKeySummary[]>('/v1/ai/api-keys'),
    enabled,
    staleTime: 30_000,
  });
}

/** The permissions THIS operator's role may grant on a key — already capped by
 *  the server, so the picker only ever offers reachable scopes. */
export function useScopeCatalog(enabled: boolean) {
  return useQuery({
    queryKey: SCOPE_CATALOG_KEY,
    queryFn: () => api.get<ScopeMeta[]>('/v1/ai/api-keys/scope-catalog'),
    enabled,
    staleTime: 300_000,
  });
}

/** Issue a key. The server verifies every scope against the issuer's role and
 *  returns the plaintext ONCE — a rejected scope comes back as a 400. */
export function useIssueApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; scopes: string[]; expiresAt: string | null }) =>
      api.post<IssuedKey>('/v1/ai/api-keys', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
    },
  });
}

/** Revoke a key — it stops working immediately and drops to the revoked sink. */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ revoked: boolean }>(`/v1/ai/api-keys/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
    },
  });
}

/** How a key is doing, in words. `tone` feeds `<Badge color>` so state carries
 *  its own color, per the platform rule. */
export function apiKeyState(key: ApiKeySummary): {
  label: string;
  tone: 'success' | 'warning' | 'error';
  active: boolean;
} {
  if (key.revokedAt) return { label: 'Revoked', tone: 'error', active: false };
  if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
    return { label: 'Expired', tone: 'warning', active: false };
  }
  return { label: 'Active', tone: 'success', active: true };
}

/** A short human summary of what a set of scopes lets an app reach — module
 *  names rather than raw `read:crm` tokens a non-technical owner can't parse.
 *  Falls back to a plain count when the catalog isn't loaded to translate them. */
export function summariseScopes(scopes: string[], catalog: ScopeMeta[] | undefined): string {
  if (scopes.length === 0) return 'No permissions';
  const byScope = new Map((catalog ?? []).map((meta) => [meta.scope, meta]));
  const modules = new Set<string>();
  for (const scope of scopes) {
    const meta = byScope.get(scope);
    if (meta) modules.add(meta.module);
  }
  if (modules.size === 0) {
    return `${scopes.length} permission${scopes.length === 1 ? '' : 's'}`;
  }
  return [...modules].sort().join(', ');
}
