'use client';

// Site identity — the active web property's customer-facing brand (docs/49).
//
// This is the identity the silica site frame binds through `site.identity` and
// `site.social`: the NAME people read in the header and browser tab, the light
// and dark LOGO, the FAVICON, the TAGLINE, and the SOCIAL links in the footer.
// Theme — colors, type, shape — is NOT here; the visual editor owns it. This
// surface is identity only.
//
// Per-site by construction (docs/49): the active site comes from the shell, and
// switching sites reloads the window onto a different identity entirely. The
// PRIMARY site edits the tenant base brand; a SECONDARY site edits its own
// override, so two unrelated businesses under one owner never share a name, a
// logo, or a link.
//
// Explicit-save, like every editor on the platform: edits accumulate into a
// draft, one Save persists it, and a leave-guard confirms before discarding.
// Deliberately ONE centred column rather than EditorLayout — this is a short
// form, not a form-plus-summary, so the bento chassis would float a near-empty
// rail beside it.

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { ImageIcon, ImagePlus, Palette, PanelTop, Plus, Save, Trash2, X } from 'lucide-react';
import { PANE_SHELL, PaneToolbar } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useActiveSiteId } from '../../lib/api/shell-data';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { MediaPickerProvider, useMediaPicker } from '../cms/media-picker';
import { useMediaAssets } from '../cms/media';
import { useDomains } from '../domains/data';
import type { Site } from '../sites/data';
import { SaveFailure } from '@/components/save-failure';
import {
  contactOf,
  effectiveBrand,
  saveErrorMessage,
  socialsOf,
  useBrand,
  useSaveIdentity,
  useSiteProperty,
  type Brand,
  type SiteContact,
  type SocialLink,
} from './site-identity-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** The one column everything sits in — centred and capped, so a pane torn onto a
 *  second monitor is not a paragraph pinned to the left of 2000px of grey. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function SiteIdentitySurface({ ctx }: { ctx: SurfaceContext }) {
  const { data: active } = useActiveSiteId();
  const propertyId = active?.propertyId ?? undefined;

  const brandQuery = useBrand();
  const propertyQuery = useSiteProperty(propertyId);

  const isError = brandQuery.isError || propertyQuery.isError;
  const isPending = !propertyId || brandQuery.isPending || propertyQuery.isPending;

  if (isError) {
    return (
      <div className={PANE_SHELL}>
        {/* No missing-state: these two queries describe a site that exists by
            definition — you reached this pane through it. Only unreachable is
            possible here. */}
        <PaneLoadError
          title="Could not load this site's identity"
          description="This is a problem reaching the server — your site's name and logo are unaffected."
          onRetry={() => {
            void brandQuery.refetch();
            void propertyQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (isPending || !brandQuery.data || !propertyQuery.data) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  // Key on the site id so switching sites (a reload, in practice) can never carry
  // one site's draft into another's editor.
  return (
    <MediaPickerProvider source="brand">
      <IdentityEditor
        key={propertyQuery.data.id}
        ctx={ctx}
        base={brandQuery.data}
        property={propertyQuery.data}
      />
    </MediaPickerProvider>
  );
}

function IdentityEditor({
  ctx,
  base,
  property,
}: {
  ctx: SurfaceContext;
  base: Brand;
  property: Site;
}) {
  const toast = useToast();
  const save = useSaveIdentity();
  const { data: domains } = useDomains();

  // Still meaningful for ROUTING (the site a bare tenant host lands on) — it just
  // no longer decides where this surface reads or writes the brand.
  const isPrimary = property.isPrimary;
  // The identity the site actually renders: the tenant base with THIS site's own
  // override applied. Every site is treated the same — the primary used to be read
  // (and written) as the bare base, which is what let its logo and colors leak onto
  // every sibling site that had no override of its own.
  const effective = useMemo(
    () => effectiveBrand(base, property.brandOverride),
    [base, property.brandOverride]
  );

  const [name, setName] = useState(property.name);
  const [tagline, setTagline] = useState(effective.tagline ?? '');
  const [logoLight, setLogoLight] = useState<string | null>(effective.logoLightMediaId);
  const [logoDark, setLogoDark] = useState<string | null>(effective.logoDarkMediaId);
  const [favicon, setFavicon] = useState<string | null>(effective.faviconMediaId);
  const [socials, setSocials] = useState<SocialLink[]>(() => socialsOf(property));
  const [contact, setContact] = useState<SiteContact>(() => contactOf(property));

  // The draft as a stable signature; its divergence from the last-saved baseline
  // is what makes the pane dirty. Preview URLs aren't tracked — only stored ids.
  const signature = useMemo(
    () => JSON.stringify({ name, tagline, logoLight, logoDark, favicon, socials, contact }),
    [name, tagline, logoLight, logoDark, favicon, socials, contact]
  );
  const [savedSignature, setSavedSignature] = useState(signature);
  const dirty = signature !== savedSignature;

  useDirtySource(
    dirty,
    'This site has unsaved changes to its name, logo, or links. Close it anyway?'
  );

  // The site's web address anchors WHAT is being edited — a stable identity the
  // editable name field can't provide. The canonical host for this property, else
  // its first host.
  const address = useMemo(() => {
    const mine = (domains ?? []).filter((d) => d.propertyId === property.id);
    return (mine.find((d) => d.isCanonical) ?? mine[0])?.host ?? null;
  }, [domains, property.id]);

  const tabTitle = name.trim() || property.name || 'Site identity';
  useEffect(() => {
    ctx.setTitle(tabTitle);
  }, [ctx, tabTitle]);

  const onSave = () => {
    save.mutate(
      {
        propertyId: property.id,
        name,
        socials,
        contact,
        identity: {
          // Normalised (trimmed, empty → null) in the data layer's save.
          tagline,
          logoLightMediaId: logoLight,
          logoDarkMediaId: logoDark,
          faviconMediaId: favicon,
        },
        effective,
        base,
        existingOverride: property.brandOverride,
      },
      {
        onSuccess: () => {
          setSavedSignature(signature);
          toast.add({ title: 'Your site identity was saved.', type: 'success' });
        },
        // A failure keeps the draft intact and shows the server's own sentence in
        // the page (below), not a toast that vanishes mid-read.
      }
    );
  };

  const failure = save.isError
    ? saveErrorMessage(save.error, 'Could not save your changes. Nothing was changed.')
    : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Site identity actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={save.isPending}
            disabled={!dirty}
            onClick={onSave}
          >
            <Save className="size-4" aria-hidden />
            Save
          </Button>
        }
        controls={
          <>
            <Badge color={isPrimary ? 'module' : 'neutral'} variant="soft" size="sm">
              {isPrimary ? 'Main site' : 'Secondary site'}
            </Badge>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* The heading names the surface's purpose; the address underneath is
              the site's stable identity, since the name is an editable field
              below rather than a read-only heading. */}
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Site identity
            </Heading>
            <Text className="text-sm">
              The name, logo, and links people see across
              {address ? (
                <>
                  {' '}
                  <span className="font-mono break-all">{address}</span> — its header, footer, and
                  browser tab.
                </>
              ) : (
                ' this site — its header, footer, and browser tab.'
              )}
            </Text>
          </div>

          {/* Which sites these edits touch — the same answer for every site now,
              so there is no longer a main/secondary split to explain. Sits BELOW
              the heading and explains; it does not introduce it (not an eyebrow). */}
          <Text className="text-sm">
            Everything here belongs to this site on its own. Changing it won&apos;t touch the name,
            logo, or links on any of your other sites.
          </Text>

          <SaveFailure title="Could not save your changes" message={failure} />

          <FormSection title="Name & tagline">
            <Field>
              <FieldLabel>Site name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={name}
                    placeholder="Acme Co."
                    onChange={(event) => {
                      setName(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                The name customers see on this site — its title, header, and emails. Your legal or
                billing name is set separately in your account settings.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Tagline</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={tagline}
                    placeholder="A short line that sums up what you do"
                    onChange={(event) => {
                      setTagline(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                An optional short phrase shown beside your name in some layouts.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Logo & favicon"
            description="Pictures customers see across your site. Leave one blank to keep it simple — your name shows as text instead."
          >
            <BrandImageField
              label="Logo — light backgrounds"
              help="Your main logo, shown on light surfaces like the header."
              value={logoLight}
              onChange={setLogoLight}
            />
            <BrandImageField
              label="Logo — dark backgrounds"
              help="A light or reversed version for dark surfaces. If you skip it, your light logo is used everywhere."
              value={logoDark}
              onChange={setLogoDark}
              dark
            />
            <BrandImageField
              label="Favicon"
              help="The small square icon shown in browser tabs and bookmarks. A simple mark works best."
              value={favicon}
              onChange={setFavicon}
            />
          </FormSection>

          {/* Typed once here, shown everywhere the site asks people to get in touch —
              the Contact page, the footer, a "call us" beside a product. Every starter
              site binds these, so filling them in is what turns its placeholder contact
              band into your real details. */}
          <FormSection
            title="How customers reach you"
            description="Your phone, email and address, shown on this site's contact page and footer. Leave any blank and it simply isn't shown."
          >
            <Field>
              <FieldLabel>Phone number</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="tel"
                    value={contact.phone}
                    placeholder="(555) 123-4567"
                    onChange={(event) => {
                      setContact((c) => ({ ...c, phone: event.target.value }));
                    }}
                  />
                }
              />
              <FieldDescription>
                Written exactly as you want it read. On a phone it becomes a tap-to-call link.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Email address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="email"
                    value={contact.email}
                    placeholder="hello@yourbusiness.com"
                    onChange={(event) => {
                      setContact((c) => ({ ...c, email: event.target.value }));
                    }}
                  />
                }
              />
              <FieldDescription>
                Where people write to you. This is separate from the address your site sends email
                from, which lives in Email settings.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Address</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={contact.address}
                    placeholder={'123 Main Street\nSuite 4\nPortland, OR 97204'}
                    onChange={(event) => {
                      setContact((c) => ({ ...c, address: event.target.value }));
                    }}
                  />
                }
              />
              <FieldDescription>
                One line per line, laid out how you would write it on an envelope. Leave it blank if
                you have no address customers visit.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Social links"
            description="Shown in this site's footer. Each site keeps its own set."
          >
            <SocialLinksEditor socials={socials} setSocials={setSocials} />
          </FormSection>

          {/* Where the rest of it lives. This surface owns the CONTENT of the header
              and footer — the name, the logo, the links — and says so twice above, but
              their arrangement and colors are the editor's. Until silicaui 0.36 a host
              could only ever open that editor on a page BODY, so pointing here would
              have landed the operator somewhere they still had to go hunting from.
              `{mode}` lands them on the surface being named. */}
          <div className="border-base-300 flex flex-wrap items-center gap-3 border-t pt-5">
            <Text className="flex-1 text-base">
              How your header and footer are arranged — and your colors, type, and shapes — are
              designed in the editor.
            </Text>
            <Button
              size="sm"
              variant="outline"
              color="module"
              onClick={(event) => {
                ctx.open('builder.studio', { mode: 'layout' }, { target: targetFor(event) });
              }}
            >
              <PanelTop className="size-4" aria-hidden />
              Design the header &amp; footer
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="module"
              onClick={(event) => {
                ctx.open('builder.studio', { mode: 'theme' }, { target: targetFor(event) });
              }}
            >
              <Palette className="size-4" aria-hidden />
              Colors &amp; type
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Logo / favicon picker ─────────────────────────────────────────────────── */

/**
 * An image field with a live preview, backed by the shared media browser — not a
 * raw asset-id box. Choosing commits to the pane's OWN DRAFT (the picker's
 * sanctioned modal exemption), so nothing is saved until Save.
 *
 * `dark` swaps the preview tile to a dark surface so a reversed logo, which would
 * vanish on white, is actually visible while you pick it.
 */
function BrandImageField({
  label,
  help,
  value,
  onChange,
  dark = false,
}: {
  label: string;
  help: string;
  value: string | null;
  onChange: (id: string | null) => void;
  dark?: boolean;
}) {
  const pick = useMediaPicker();
  const ids = useMemo(() => (value ? [value] : []), [value]);
  const assets = useMediaAssets(ids);
  const asset = assets.data?.[0];

  const choose = async () => {
    const picked = await pick();
    if (picked) onChange(picked.id);
  };

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-3">
        <div
          className={`rounded-box relative flex size-20 shrink-0 items-center justify-center overflow-hidden border ${
            dark ? 'bg-neutral border-neutral' : 'bg-base-200 border-base-300'
          }`}
        >
          {value && asset?.url ? (
            <Image
              src={asset.url}
              alt=""
              fill
              sizes="80px"
              className="object-contain p-2"
              // Cross-origin tenant media: next/image's optimizer host allow-list
              // is environment-fragile and can reject a legitimately-served file,
              // taking the pane down. A browser scaling a small thumbnail is the
              // safe choice — same call the media picker makes.
              unoptimized
            />
          ) : (
            <ImageIcon
              className={dark ? 'text-neutral-content size-5' : 'text-base-content size-5'}
              aria-hidden
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            color="module"
            onClick={() => {
              void choose();
            }}
          >
            <ImagePlus className="size-4" aria-hidden />
            {value ? 'Change' : 'Choose a picture'}
          </Button>
          {value ? (
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={() => {
                onChange(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <FieldDescription>{help}</FieldDescription>
    </Field>
  );
}

/* ── Social links ──────────────────────────────────────────────────────────── */

// The platforms a site footer renders a first-class icon for. A known key drives
// the icon; "Other" carries a free-text label for anything else.
const KNOWN_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourbrand' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourbrand' },
  { key: 'x', label: 'X', placeholder: 'https://x.com/yourbrand' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourbrand' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourbrand' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/yourbrand' },
  { key: 'pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/yourbrand' },
  { key: 'threads', label: 'Threads', placeholder: 'https://threads.com/@yourbrand' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/15551234567' },
  { key: 'bluesky', label: 'Bluesky', placeholder: 'https://bsky.app/profile/you.bsky.social' },
] as const;

const OTHER_PLATFORM = '__other__';
const KNOWN_KEYS = new Set<string>(KNOWN_PLATFORMS.map((p) => p.key));

function placeholderFor(platform: string): string {
  return KNOWN_PLATFORMS.find((p) => p.key === platform)?.placeholder ?? 'https://…';
}

function SocialLinksEditor({
  socials,
  setSocials,
}: {
  socials: SocialLink[];
  setSocials: (updater: (rows: SocialLink[]) => SocialLink[]) => void;
}) {
  const usedKnown = new Set(socials.map((r) => r.platform).filter((p) => KNOWN_KEYS.has(p)));

  const addRow = () =>
    setSocials((rows) => {
      const used = new Set(rows.map((r) => r.platform).filter((p) => KNOWN_KEYS.has(p)));
      const next = KNOWN_PLATFORMS.find((p) => !used.has(p.key));
      return [...rows, { platform: next ? next.key : '', url: '' }];
    });
  const removeRow = (index: number) => setSocials((rows) => rows.filter((_, i) => i !== index));
  const patchRow = (index: number, patch: Partial<SocialLink>) =>
    setSocials((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2.5">
      {socials.length === 0 ? (
        <Text className="text-sm">No links yet. Add one and it appears in your footer.</Text>
      ) : (
        socials.map((row, index) => {
          const known = KNOWN_KEYS.has(row.platform);
          const selectValue = known ? row.platform : OTHER_PLATFORM;
          const options = KNOWN_PLATFORMS.filter(
            (p) => p.key === row.platform || !usedKnown.has(p.key)
          );
          return (
            <div
              key={index}
              className="border-base-300 flex flex-col gap-2 rounded-md border p-2.5 @md:flex-row @md:items-start"
            >
              <div className="flex flex-col gap-2 @md:w-40">
                <NativeSelect
                  color="module"
                  aria-label="Platform"
                  value={selectValue}
                  onChange={(event) => {
                    patchRow(index, {
                      platform: event.target.value === OTHER_PLATFORM ? '' : event.target.value,
                    });
                  }}
                >
                  {options.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                  <option value={OTHER_PLATFORM}>Other…</option>
                </NativeSelect>
                {selectValue === OTHER_PLATFORM ? (
                  <Input
                    color="module"
                    aria-label="Custom platform label"
                    value={row.platform}
                    placeholder="Label (e.g. Discord)"
                    onChange={(event) => {
                      patchRow(index, { platform: event.target.value });
                    }}
                  />
                ) : null}
              </div>
              <Input
                color="module"
                aria-label="Link address"
                type="url"
                inputMode="url"
                autoComplete="off"
                className="flex-1"
                value={row.url}
                placeholder={placeholderFor(row.platform)}
                onChange={(event) => {
                  patchRow(index, { url: event.target.value });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                color="neutral"
                size="sm"
                shape="square"
                aria-label="Remove this link"
                onClick={() => {
                  removeRow(index);
                }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          );
        })
      )}
      <div>
        <Button type="button" variant="soft" color="module" size="sm" onClick={addRow}>
          <Plus className="size-4" aria-hidden />
          Add link
        </Button>
      </div>
    </div>
  );
}
