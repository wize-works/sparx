// Internal proxy for /v1/media/assets. See entries/route.ts for the why.

import { NextResponse, type NextRequest } from 'next/server';
import { api, type ApiRestError } from '@/lib/api-rest-client';

interface MediaAsset {
  id: string;
  original_filename: string;
  mime_type: string;
  alt_text: string | null;
  caption: string | null;
  variants?: { format: string; width: number; url: string }[];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const search = new URLSearchParams();
  for (const key of ['q', 'limit', 'cursor']) {
    const v = req.nextUrl.searchParams.get(key);
    if (v) search.set(key, v);
  }
  try {
    const data = await api.get<MediaAsset[]>(`/v1/media/assets?${search.toString()}`);
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
