// Admin operations — collection lifecycle, used by the indexer worker at
// boot and by staff "Rebuild search index" actions in the dashboard.

import type { Client } from 'typesense';

import { getClient } from './client';
import { allSchemas } from './schemas';

export async function ensureSchemas(client: Client = getClient()): Promise<{
  created: string[];
  existing: string[];
}> {
  const created: string[] = [];
  const existing: string[] = [];
  for (const { name, schema } of allSchemas()) {
    try {
      await client.collections(name).retrieve();
      existing.push(name);
    } catch (err: unknown) {
      const status = (err as { httpStatus?: number }).httpStatus;
      if (status === 404) {
        await client.collections().create(schema);
        created.push(name);
      } else {
        throw err;
      }
    }
  }
  return { created, existing };
}

export async function dropAllSchemas(client: Client = getClient()): Promise<string[]> {
  const dropped: string[] = [];
  for (const { name } of allSchemas()) {
    try {
      await client.collections(name).delete();
      dropped.push(name);
    } catch (err: unknown) {
      const status = (err as { httpStatus?: number }).httpStatus;
      if (status !== 404) throw err;
    }
  }
  return dropped;
}

export async function aliasCollection(input: {
  alias: string;
  target: string;
  client?: Client;
}): Promise<void> {
  const c = input.client ?? getClient();
  await c.aliases().upsert(input.alias, { collection_name: input.target });
}
