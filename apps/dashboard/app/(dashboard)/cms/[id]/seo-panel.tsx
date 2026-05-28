'use client';

// SEO panel — title / meta description / OG image / canonical / robots.
//
// Rendered inside the edit form so all save-the-entry traffic flows
// through one POST. The component is presentational + state-managed by
// the parent EditPageForm; everything here is a controlled input writing
// to the parent's React state.
//
// Google preview matches search-result typography: title in the blue
// link weight, URL in the small green serif, description in standard
// gray. Pixel-perfect parity isn't possible (Google's algorithm
// rewrites titles based on query), but the layout gives editors enough
// signal to spot truncation before publishing.

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

export interface SeoFields {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogImage: string;
}

interface SeoPanelProps {
  value: SeoFields;
  onChange: (next: SeoFields) => void;
  // Used to render the "URL preview" line in the Google search result.
  // We don't know the storefront domain here — apps/dashboard runs on
  // app.sparx.works and the actual public URL depends on which storefront
  // the entry belongs to. For now we render `{previewOrigin}/{slug}` with
  // the slug as authoritative; future-pass swap in the per-merchant
  // storefront origin.
  previewOrigin: string;
  slug: string;
  fallbackTitle: string;
}

const ROBOTS_OPTIONS = [
  { value: '', label: 'Default (index, follow)' },
  { value: 'index,follow', label: 'Index, follow' },
  { value: 'noindex,follow', label: 'No-index, follow' },
  { value: 'index,nofollow', label: 'Index, no-follow' },
  { value: 'noindex,nofollow', label: 'No-index, no-follow' },
];

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;

export function SeoPanel({ value, onChange, previewOrigin, slug, fallbackTitle }: SeoPanelProps) {
  const update = <K extends keyof SeoFields>(k: K, v: SeoFields[K]) => {
    onChange({ ...value, [k]: v });
  };

  const previewTitle = value.title || fallbackTitle || 'Untitled page';
  const previewDescription =
    value.description ||
    'Provide a meta description so Google can show this snippet under your search result.';

  return (
    <Card>
      <CardHeader>
        <Heading level={3}>SEO</Heading>
        <CardDescription>
          Controls how this page appears in Google and on social shares.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap={5}>
          <GooglePreview
            origin={previewOrigin}
            slug={slug}
            title={previewTitle}
            description={previewDescription}
          />

          <Stack gap={2}>
            <Stack direction="row" justify="between" align="end">
              <Label htmlFor="seoTitle">Search title</Label>
              <CharCount value={value.title} max={TITLE_MAX} />
            </Stack>
            <Input
              id="seoTitle"
              name="seoTitle"
              value={value.title}
              onChange={(e) => update('title', e.target.value)}
              maxLength={TITLE_MAX + 20}
              placeholder={fallbackTitle || 'Falls back to the page title.'}
            />
          </Stack>

          <Stack gap={2}>
            <Stack direction="row" justify="between" align="end">
              <Label htmlFor="metaDescription">Meta description</Label>
              <CharCount value={value.description} max={DESCRIPTION_MAX} />
            </Stack>
            <Textarea
              id="metaDescription"
              name="metaDescription"
              value={value.description}
              onChange={(e) => update('description', e.target.value)}
              rows={3}
              maxLength={DESCRIPTION_MAX + 40}
              placeholder="One-sentence summary Google can show as the snippet."
            />
          </Stack>

          <Stack gap={2}>
            <Label htmlFor="ogImage">Social share image (asset ID)</Label>
            <Input
              id="ogImage"
              name="ogImage"
              value={value.ogImage}
              onChange={(e) => update('ogImage', e.target.value)}
              placeholder="Pick from /cms/media — paste the UUID here."
            />
            <Text size="xs" variant="muted">
              Used as the Open Graph image when this page is shared on Facebook, LinkedIn, Slack,
              etc. Falls back to the merchant&apos;s default OG image when blank.
            </Text>
          </Stack>

          <Stack gap={2}>
            <Label htmlFor="canonical">Canonical URL</Label>
            <Input
              id="canonical"
              name="canonical"
              value={value.canonical}
              onChange={(e) => update('canonical', e.target.value)}
              placeholder={`${previewOrigin}/${slug || ''}`}
            />
            <Text size="xs" variant="muted">
              Set this if the same content lives at multiple URLs. Leave blank to use the
              page&apos;s own URL.
            </Text>
          </Stack>

          <Stack gap={2}>
            <Label htmlFor="robots">Robots directive</Label>
            <select
              id="robots"
              name="robots"
              value={value.robots}
              onChange={(e) => update('robots', e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
            >
              {ROBOTS_OPTIONS.map((o) => (
                <option key={o.value || 'default'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Text size="xs" variant="muted">
              Controls whether search engines index this page and follow its links.
            </Text>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  const len = value.length;
  // Text only supports danger | muted | subtle (no warning variant); fall
  // back to danger when we're past the warning threshold too.
  const variant: 'danger' | 'muted' = len > max * 0.9 ? 'danger' : 'muted';
  return (
    <Text size="xs" variant={variant}>
      {len} / {max}
    </Text>
  );
}

function GooglePreview({
  origin,
  slug,
  title,
  description,
}: {
  origin: string;
  slug: string;
  title: string;
  description: string;
}) {
  const url = `${origin}/${slug ?? ''}`.replace(/\/+$/, '');
  // Display: chevron-separated "domain › path"
  const displayUrl = url.replace(/^https?:\/\//, '').replace('/', ' › ');
  return (
    <Stack
      gap={1}
      className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4"
    >
      <Text size="xs" variant="muted">
        Google preview
      </Text>
      <Text size="xs" className="text-[#202124]">
        {displayUrl}
      </Text>
      <Text className="font-medium text-[#1a0dab]" size="lg">
        {truncate(title, 60)}
      </Text>
      <Text size="sm" className="text-[#4d5156]">
        {truncate(description, 160)}
      </Text>
    </Stack>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trim() + '…';
}
