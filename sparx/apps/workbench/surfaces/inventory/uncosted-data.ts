'use client';

// The stock nobody has said what they paid for, and recording it.
//
//   GET  /v1/inventory/costing/uncosted
//   POST /v1/inventory/costing/uncosted

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import { apiErrorMessage } from '../../lib/api-error';

export interface UncostedVariant {
  variantId: string;
  productId: string;
  sku: string | null;
  title: string;
  variantName: string | null;
  onHand: number;
  priceCents: number | null;
}

export interface UncostedStock {
  items: UncostedVariant[];
  total: number;
  uncostedUnits: number;
}

export const uncostedKeys = {
  all: ['inventory', 'uncosted'] as const,
  list: (take: number, skip: number) => ['inventory', 'uncosted', take, skip] as const,
};

export function useUncostedStock(take = 100, skip = 0) {
  return useQuery({
    queryKey: uncostedKeys.list(take, skip),
    queryFn: () =>
      api.get<UncostedStock>('/v1/inventory/costing/uncosted', {
        take: String(take),
        skip: String(skip),
      }),
  });
}

export interface SetCostsResult {
  updated: number;
  skipped: string[];
}

export function useSetCosts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entries: { variantId: string; costCents: number }[]) =>
      api.post<SetCostsResult>('/v1/inventory/costing/uncosted', { entries }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: uncostedKeys.all });
      // Every money figure on the reports pane is built on these, so they are
      // stale the moment one lands.
      void client.invalidateQueries({ queryKey: ['inventory', 'reports'] });
      void client.invalidateQueries({ queryKey: ['inventory', 'levels'] });
    },
  });
}

export function costsErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}
