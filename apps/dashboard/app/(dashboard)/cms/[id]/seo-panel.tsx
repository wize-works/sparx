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
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';
import { ImageOff, Pencil } from 'lucide-react';
import { MediaPicker, type PickedAsset } from '../_components/media-picker';

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
  { value: 'default', label: 'Default (index, follow)' },
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

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [ogPreview, setOgPreview] = React.useState<PickedAsset | null>(null);

  const previewTitle = value.title || fallbackTitle || 'Untitled page';
  const previewDescription =
    value.description ||
    'Provide a meta description so Google can show this snippet under your search result.';

  return (
    <Card variant="module">
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
            <Label htmlFor="ogImage">Social share image</Label>
            <OgImageField
              assetId={value.ogImage}
              preview={ogPreview}
              onPick={() => setPickerOpen(true)}
              onClear={() => {
                setOgPreview(null);
                update('ogImage', '');
              }}
            />
            <Text size="xs" variant="muted">
              Used as the Open Graph image when this page is shared on Facebook, LinkedIn, Slack,
              etc. Falls back to the merchant&apos;s default OG image when blank.
            </Text>
            <MediaPicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              accept={['image/*']}
              onPick={(asset) => {
                setOgPreview(asset);
                update('ogImage', asset.assetId);
                setPickerOpen(false);
              }}
            />
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
            <Select
              value={value.robots ? value.robots : 'default'}
              onValueChange={(v) => update('robots', v === 'default' ? '' : v)}
            >
              <SelectTrigger id="robots" aria-label="Robots directive">
                <SelectValue placeholder="Default (index, follow)" />
              </SelectTrigger>
              <SelectContent>
                {ROBOTS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Text size="xs" variant="muted">
              Controls whether search engines index this page and follow its links.
            </Text>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function OgImageField({
  assetId,
  preview,
  onPick,
  onClear,
}: {
  assetId: string;
  preview: PickedAsset | null;
  onPick: () => void;
  onClear: () => void;
}) {
  // Two display states: nothing picked → "Pick image" button; picked →
  // thumbnail (if we have one cached from this session) + filename + change/
  // clear actions. We deliberately don't fetch the asset on mount when only
  // an assetId is present — the picker can re-surface it lazily without an
  // extra round-trip on every edit-page open.
  const hasAsset = assetId.length > 0;
  if (!hasAsset) {
    return (
      <Stack direction="row" align="center" gap={2}>
        <Button type="button" variant="secondary" size="sm" onClick={onPick}>
          Pick image
        </Button>
        <Text size="xs" variant="muted">
          No image selected — Slack and OG cards will use the site default.
        </Text>
      </Stack>
    );
  }
  return (
    <Stack direction="row" align="center" gap={3}>
      {preview?.src ? (
        <img
          src={preview.src}
          alt={preview.alt || 'Selected social share image'}
          className="h-14 w-14 rounded-md object-cover"
        />
      ) : (
        <Stack
          align="center"
          justify="center"
          className="h-14 w-14 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]"
        >
          <ImageOff aria-hidden className="h-5 w-5 text-[var(--color-text-tertiary)]" />
        </Stack>
      )}
      <Stack gap={1}>
        <Text size="sm">{preview?.alt ?? preview?.caption ?? 'Image selected'}</Text>
        <Text size="xs" variant="muted">
          Asset {assetId.slice(0, 8)}…
        </Text>
      </Stack>
      <Stack direction="row" gap={1} className="ml-auto">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<Pencil className="h-3.5 w-3.5" />}
          onClick={onPick}
        >
          Change
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </Stack>
    </Stack>
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
  // Brand-fidelity exception: this block deliberately mimics Google's SERP
  // typography (the blue title link `#1a0dab`, the gray description `#4d5156`,
  // the dark URL chip `#202124`). Those colors are not in the Sparx design
  // system — they're Google's, and editors expect to see what their result
  // will look like there. Keep the inline Tailwind here; do not migrate to
  // Sparx tokens. The surrounding chrome (border / background) does use
  // tokens.
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
