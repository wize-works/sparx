// Tenant-aware robots.txt. Allows all crawlers by default; disallows
// preview-token paths so a leaked preview URL doesn't get indexed.
// Sitemap reference points back at this same host.

import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const tenant = await resolveTenant();

  const lines = [
    'User-agent: *',
    'Disallow: /api/',
    // Preview URLs carry ?sparxPreview=<jwt>. We can't selectively block
    // a query-string match in robots.txt across all crawlers, but we add
    // a hint anyway — major crawlers honor it.
    'Disallow: /*?sparxPreview=',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ];

  if (!tenant) {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
