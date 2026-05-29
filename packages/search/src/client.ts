// Typesense client factory. Reads connection config from env so the
// indexer worker, api-rest, and dashboard ⌘K palette all reach the same
// cluster the same way.

import { Client } from 'typesense';

export interface TypesenseConfig {
  /** Host (or comma-separated host list). Defaults to `typesense` — the
   *  in-cluster Service name when running on GKE. */
  nodes: { host: string; port: number; protocol: 'http' | 'https' }[];
  apiKey: string;
  connectionTimeoutSeconds?: number;
}

export function configFromEnv(): TypesenseConfig {
  const host = process.env.TYPESENSE_HOST ?? 'typesense';
  const port = Number(process.env.TYPESENSE_PORT ?? 8108);
  const protocol = (process.env.TYPESENSE_PROTOCOL ?? 'http') as 'http' | 'https';
  const apiKey = process.env.TYPESENSE_API_KEY;
  if (!apiKey) {
    throw new Error('TYPESENSE_API_KEY env var is required');
  }
  return {
    nodes: [{ host, port, protocol }],
    apiKey,
    connectionTimeoutSeconds: Number(process.env.TYPESENSE_TIMEOUT_SECONDS ?? 5),
  };
}

let cached: Client | null = null;

export function getClient(config?: TypesenseConfig): Client {
  if (cached && !config) return cached;
  const resolved = config ?? configFromEnv();
  const client = new Client({
    nodes: resolved.nodes,
    apiKey: resolved.apiKey,
    connectionTimeoutSeconds: resolved.connectionTimeoutSeconds ?? 5,
  });
  if (!config) cached = client;
  return client;
}

/** Test-only: reset the cached client between cases. */
export function _resetClientForTest(): void {
  cached = null;
}
