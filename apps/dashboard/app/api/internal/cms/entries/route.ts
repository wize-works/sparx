// Internal proxy for the CMS form pickers.
//
// The form pickers run in the browser, so they can't call api-rest directly
// (the bearer JWT lives on the server). This route validates the dashboard
// session via the Better Auth cookie, then forwards to api-rest with a
// short-lived JWT minted from the session.
//
// Same envelope shape api-rest uses — passes through `success/data` and
// `success/error` so the client doesn't have to know what's underneath.

import { NextResponse, type NextRequest } from 'next/server';
import { api, type ApiRestError } from '@/lib/api-rest-client';

interface Entry {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: Record<string, unknown>;
  updated_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const search = new URLSearchParams();
  for (const key of ['type', 'status', 'slug', 'q', 'limit', 'cursor', 'author', 'locale']) {
    const v = params.get(key);
    if (v) search.set(key, v);
  }
  try {
    const data = await api.get<Entry[]>(`/v1/content/entries?${search.toString()}`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const e = err as ApiRestError;
    return NextResponse.json(
      {
        success: false,
        error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'Request failed' },
      },
      { status: e.status ?? 500 }
    );
  }
}
