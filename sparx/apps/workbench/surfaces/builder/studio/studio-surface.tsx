'use client';

// The Editor — the visual, drag-and-drop site builder (builder.studio).
//
// This is silicaui's `<Builder>`: silica owns the whole editor (the Insert
// palette, the canvas, the Navigator/layers, the Design inspector, undo/redo, page
// switching, the frame/Outlet chrome, symbols, and theme). sparx supplies the
// HOST — what a binding means, the commerce/site composites, the pinned functional
// cores — and everything AROUND the editor: the pane shell, Save/Preview, the
// "not live yet" signal, and the unsaved-work net.
//
// EXPLICIT SAVE, on purpose. silica hands back the whole `Site` on every edit; we
// hold it and mark the pane dirty, and nothing reaches the server until the
// operator presses Save (`PUT /v1/builder/site`). Publish snapshots that draft.
// That is the platform rule for every editor, and it is exactly why this is a
// PANE, never a modal: the dirty dot, the close-guard and the per-site layout are
// the safety net a modal sits outside of.
//
// Params: `{pageId}` opens that page on mount. `{componentId}` names a TENANT-WIDE
// saved piece and opens its master for editing — the library is materialized into
// this document's symbol map (`saved-pieces.ts`), so the deep link is a plain
// `enterSymbol` and the piece is edited with silica's own component machinery.
// `{mode}` lands the author on `page` (the default), `layout`, `component` or
// `theme` — how "design the header and footer" opens on the header and footer
// rather than on a page body the operator then has to navigate away from.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Builder, useEditor } from '@wizeworks/silicaui-builder/react';
import type {
  InspectorPanel,
  InspectorTabDef,
  Op,
  OpMeta,
  PageMeta,
  Peer,
  PublishPayload,
} from '@wizeworks/silicaui-builder/react';
import { THEME_PRESETS, type Node, type Site, type Theme } from '@wizeworks/silicaui-html';
import {
  ensureUniqueIds,
  recordAddressAt,
  recordPreviewPath,
  starterSite,
  upgradeFrameChrome,
  upgradePageBody,
} from '@wizeworks/silica-catalog';
import {
  COMMERCE_SOURCES,
  SITE_SOURCES,
  toSilicaDataSources,
  type DataSource,
} from '@wizeworks/builder-schemas';
import { Badge, Button, useToast } from '@wizeworks/silicaui-react';
import { Eye, Save } from 'lucide-react';
import { useQueryClient } from '@wizeworks/query';
import { useConfirm } from '../../../lib/confirm';
import { useDirtySource } from '../../../lib/workbench/dirty';
import { MediaPickerProvider, useMediaPicker } from '../../cms/media-picker';
import { useActiveSiteId, useModuleStates, useTenant } from '../../../lib/api/shell-data';
import type { SurfaceContext } from '../../../lib/surfaces/registry';
import {
  builderErrorMessage,
  getSiteCheck,
  SITE_CHECK_KEY,
  useSiteCheck,
  useActiveProperty,
  useBindingCatalog,
  useRecordSamplePaths,
  useBrand,
  useBuilderSite,
  usePreviewToken,
  usePublishSite,
  usePublishState,
  useUpdatePageSettings,
  useSiteConfig,
  useSiteOrigin,
  useSitePreview,
  useSilicaPieces,
  useSaveSilicaPiece,
  useSyncSite,
  type ActiveProperty,
  type BrandDto,
  type SiteConfigDto,
  type SitePublishState,
  type SiteSyncInput,
  type StoredSilicaSite,
} from './data';
import { themeFontFamilies } from '@wizeworks/site-themes';
import { applyBrandOverride, tenantTheme, type BrandColumns } from './brand-theme';
import { useCanvasBrandFonts } from './canvas-fonts';
import { BuilderLiveSync, BuilderReloadNotice } from './builder-live';
import {
  CollaborativeHistory,
  HISTORY_LIMIT,
  type HistoryStacks,
  type InvertOps,
} from './undo-history';
import { SiteCheck } from './site-check';
import { VersionHistoryPanel } from './version-history';
import { PageSettingsPanel, draftToPatch, type PageSettingsDraft } from './page-settings';
import { buildStudioHost } from './host';
import {
  changedTenantMasters,
  partitionSymbols,
  tenantSymbolId,
  withTenantPieces,
  type SilicaPiece,
} from './saved-pieces';
import { makeRenderHostNode } from './host-cores';
import { buildPreviewRoot, type SitePreviewData } from './preview-data';
import { PaneLoadError } from '../../../components/pane-load-error';

/** The editor's four surfaces (silicaui `BuilderProps['initialMode']`). Named here so a
 *  deep link carrying a typo opens the editor normally instead of handing silica a mode
 *  it does not have. */
const EDITOR_MODES = ['page', 'layout', 'component', 'theme'] as const;
type EditorMode = (typeof EDITOR_MODES)[number];

function isEditorMode(value: unknown): value is EditorMode {
  return typeof value === 'string' && (EDITOR_MODES as readonly string[]).includes(value);
}

/** What the tab says once the author moves between surfaces. With several editor panes
 *  open — and the workbench lets you tear one off into its own window — "Editor" on all
 *  of them tells the operator nothing about which is which. */
const MODE_TITLE: Record<EditorMode, string> = {
  page: 'Editor',
  layout: 'Editor · Header & footer',
  component: 'Editor · Saved design',
  theme: 'Editor · Look & feel',
};

/** A blank brand — the fallback when `/v1/brand` hasn't resolved, so theming +
 *  font loading degrade to bare defaults rather than crashing. */
const EMPTY_BRAND: BrandColumns = {
  tagline: null,
  logoLightMediaId: null,
  logoDarkMediaId: null,
  faviconMediaId: null,
  colorPrimary: null,
  colorPrimaryForeground: null,
  colorSecondary: null,
  colorSecondaryForeground: null,
  colorAccent: null,
  colorAccentForeground: null,
  fontHeading: null,
  fontBody: null,
  tokens: null,
};

export function StudioSurface({ ctx }: { ctx: SurfaceContext }) {
  const site = useBuilderSite();
  const catalog = useBindingCatalog();
  const publishState = usePublishState();
  const modules = useModuleStates();
  const brand = useBrand();
  const config = useSiteConfig();
  const tenant = useTenant();
  const pieces = useSilicaPieces();

  const { data: siteState } = useActiveSiteId();
  const propertyId = siteState?.propertyId ?? null;
  const property = useActiveProperty(propertyId);
  // Scope the chrome preview to the ACTIVE site so a per-site brand override
  // previews correctly.
  const sitePreview = useSitePreview(tenant.data?.slug ?? null, property.data?.slug ?? null);

  // NO `setTitle` here, deliberately. It used to set the literal 'Editor', which is the
  // SAME string the surface definition already supplies as this pane's default label —
  // so it bought nothing, and once `StudioEditor` began naming the open surface it
  // actively fought it: React flushes CHILD effects before parent ones, and `ctx` is a
  // fresh object each render, so the parent re-ran and overwrote the child's title on
  // the very commit the editor mounted. A deep link into Layout mode opened correctly
  // and then labelled itself "Editor". One owner: `StudioEditor` below.

  // Live "reload to see the agent's change" (docs/126 §4.5): refetch the site, then bump a
  // nonce so the editor remounts on the fresh load. Bumping AFTER the refetch settles means
  // the remount reads the new snapshot, not the stale cache.
  const [reloadNonce, setReloadNonce] = useState(0);
  const reload = useCallback(() => {
    void site.refetch().finally(() => setReloadNonce((n) => n + 1));
  }, [site]);

  // A failed SITE read replaces the editor — never a blank canvas over a starter
  // seed that Save would then persist on top of the real site.
  //
  // `data === undefined` is doing real work here and is NOT `!site.data`. The danger this
  // guard exists for is having NOTHING to draw, falling back to the starter seed, and
  // Saving that over a tenant's real site. That is the `undefined` case only. `null` is a
  // legitimate, successful answer meaning "no site materialized yet" — the starter-seed
  // path, deliberately — so `!site.data` would show a scary error on the exact flow the
  // editor is designed around.
  //
  // Once the site IS loaded, a later failure is a BACKGROUND REFETCH failing, and react-query
  // reports that as `isError` while still holding the last good `data`. Tearing the editor
  // down for it destroys unsaved work over a blip the author never caused and cannot see —
  // and it takes silica's whole canvas with it, which is the multi-second stall that reads as
  // a hang. The editor already owns the authoritative in-memory document; a refetch it did not
  // ask for must never be able to close it.
  if (site.isError && site.data === undefined) {
    return (
      <PaneLoadError
        title="Could not load your site"
        description="This is a problem reaching the server, or the site builder is switched off for this account. Your site itself is unaffected."
        onRetry={() => {
          void site.refetch();
        }}
      />
    );
  }

  // `site.data` is `undefined` while loading and `null` when the property has no
  // silica site yet (a valid state — the starter seeds). So gate on the query
  // status, not on the value. Brand/config/property/site-preview all degrade
  // gracefully (they self-catch to fallbacks), so they never hold the editor shut —
  // but wait for them to settle so the canvas opens on the real brand, not a flash
  // of preset then a re-theme.
  const loading =
    site.isPending ||
    catalog.isPending ||
    publishState.isPending ||
    modules.isPending ||
    brand.isPending ||
    config.isPending ||
    pieces.isPending ||
    sitePreview.isPending;
  if (loading) {
    return (
      <p className="p-4 text-base" role="status">
        Loading the editor…
      </p>
    );
  }

  return (
    // The shared media browser, mounted ABOVE the editor so `useMediaPicker()` resolves
    // inside it and the host's `pickAsset` can hand silica a real picture. `content` is
    // where a picture chosen here is filed in the library (docs/49 auto-groups).
    <MediaPickerProvider source="content">
      <StudioEditor
        // Remount (fresh load) when the operator accepts a live "reload to see the agent's
        // change" — the faithful response to a body/frame REPLACE that has no delta op.
        key={reloadNonce}
        ctx={ctx}
        propertyId={propertyId}
        storedSite={site.data ?? null}
        sources={catalog.data?.sources ?? []}
        publishState={publishState.data!}
        brand={brand.data ?? null}
        config={config.data ?? null}
        property={property.data ?? null}
        sitePreview={sitePreview.data ?? null}
        pieces={pieces.data ?? []}
        onReload={reload}
        moduleFlags={{
          commerce: modules.data?.find((m) => m.slug === 'commerce')?.enabled ?? true,
          scheduling: modules.data?.find((m) => m.slug === 'scheduling')?.enabled ?? false,
          cms: modules.data?.find((m) => m.slug === 'cms')?.enabled ?? false,
        }}
      />
    </MediaPickerProvider>
  );
}

interface EditorProps {
  ctx: SurfaceContext;
  propertyId: string | null;
  storedSite: StoredSilicaSite | null;
  sources: DataSource[];
  publishState: SitePublishState;
  brand: BrandDto | null;
  config: SiteConfigDto | null;
  property: ActiveProperty | null;
  sitePreview: SitePreviewData | null;
  onReload: () => void;
  moduleFlags: { commerce: boolean; scheduling: boolean; cms: boolean };
  /** The tenant-wide saved-piece library, already settled. Passed as a prop rather
   *  than read inside so the document memo can merge it at BUILD time — `<Builder>`
   *  reads `document` once at mount, so a library that arrives later never lands. */
  pieces: SilicaPiece[];
}

function StudioEditor({
  ctx,
  propertyId,
  storedSite,
  sources,
  publishState,
  brand,
  config,
  property,
  sitePreview,
  onReload,
  moduleFlags,
  pieces,
}: EditorProps) {
  const toast = useToast();
  const sync = useSyncSite();
  const publish = usePublishSite();
  const updatePageSettings = useUpdatePageSettings();
  const previewToken = usePreviewToken();
  const siteOrigin = useSiteOrigin(propertyId);
  // One real record per record address, so Preview on a product template opens a product.
  // Read once and read early: it must already be in hand when Preview is pressed, and
  // pressing Preview should never wait on a lookup that exists to improve the destination.
  const recordSamples = useRecordSamplePaths();

  const pageIdParam = typeof ctx.params.pageId === 'string' ? ctx.params.pageId : null;
  // Which editing surface the author LANDS on (silicaui 0.36's `initialMode` — docs/silicaui/01
  // §7 Q26). Until this existed a host could only ever open the editor on Page, so the
  // nav's own promise that "header / footer / menu land in the Editor" put the operator
  // on a page BODY with no signpost to the chrome at all.
  const modeParam = isEditorMode(ctx.params.mode) ? ctx.params.mode : undefined;
  // The Saved-pieces pane's "Edit design" hands us a library KEY. It resolves to the
  // symbol that key was materialized under, which `ApplyInitialPiece` then enters.
  const componentIdParam =
    typeof ctx.params.componentId === 'string' ? ctx.params.componentId : null;

  // The surface the author is on. Seeded from the deep link and thereafter reported by
  // silica — the mode is `initialMode`, not a controlled prop, precisely so a parent
  // re-render cannot yank someone out of the surface they are working in, which means
  // mirroring it here is a READ of silica's state and never an attempt to drive it.
  const [mode, setMode] = useState<EditorMode>(modeParam ?? 'page');
  useEffect(() => {
    ctx.setTitle(MODE_TITLE[mode]);
  }, [ctx, mode]);

  const savePiece = useSaveSilicaPiece();
  // The library AS LOADED — the baseline `changedTenantMasters` diffs against, so a
  // Save only writes masters the author actually touched. A ref, not state: it is
  // advanced by a save and must never re-render the editor or re-seed the canvas.
  const piecesRef = useRef<SilicaPiece[]>(pieces);

  const confirm = useConfirm();
  // The pre-publish check. A popover off its toolbar button, plus the publish confirm's
  // "Let me look first".
  //
  // THE QUERY LIVES HERE, NOT IN THE PANEL, because the COUNT belongs in the status bar
  // and the LIST belongs in the popover — two consumers, so one owner. Lifting it is
  // also what makes "never run on its own" possible: the panel can be opened, read and
  // dismissed without touching the network.
  const [checkOpen, setCheckOpen] = useState(false);
  const queryClient = useQueryClient();
  const check = useSiteCheck();
  // Has the document changed since that report was produced? Seeded true — a report
  // that has never run is stale by definition — and set again by every `onChange`.
  //
  // The status bar shows a count ONLY while this is false. A count that has stopped
  // being true is worse than no count: the author fixes three broken links, the strip
  // still says "3 broken", and the number they were meant to trust is the one that lied.
  const [checkStale, setCheckStale] = useState(true);

  const [dirty, setDirty] = useState(false);
  // Seeded from the load EXACTLY ONCE; then owned by silica's onChange and held in
  // a ref so Save/Publish read the CURRENT site and a re-render never re-seeds the
  // canvas over in-progress edits.
  const seededRef = useRef(false);

  // The active site's EFFECTIVE brand (every site layers its own override on the
  // tenant base) — the source for both the compiled theme and the fonts the canvas
  // must load. Reacts to brand/property so a site switch re-themes. The primary is
  // not excluded: it stores its brand on its own property row like every other site,
  // so skipping the override here would paint the canvas in the tenant default.
  const effectiveBrand = useMemo<BrandColumns>(() => {
    const base: BrandColumns = brand ?? EMPTY_BRAND;
    return property ? applyBrandOverride(base, property.brandOverride) : base;
  }, [brand, property]);

  // The document silica edits, built once: heal legacy id-less trees, apply the
  // tenant's brand-compiled theme (an authored theme wins if the site already has
  // one), and frame the chrome — or seed the starter when the property has no silica
  // site yet. Memoized so `<Builder>` reads it once at mount.
  const site = useMemo<Site>(() => {
    // The theme the canvas opens on: the author's SAVED theme if the site has one,
    // else the tenant's EFFECTIVE brand compiled to a silica theme (the primary
    // site's base brand, or a non-primary site's overridden look), else a preset if
    // the compile throws.
    const brandTheme =
      tenantTheme(effectiveBrand, {
        themeKey: config?.themeKey ?? 'default',
        themePreset: config?.draftSettings?.themePreset,
        presentation: config?.draftSettings?.presentation,
      }) ?? THEME_PRESETS[0]!;
    const theme: Theme = storedSite?.theme ?? brandTheme;
    if (!storedSite) {
      return withTenantPieces(
        starterSite(theme, {
          commerceEnabled: moduleFlags.commerce,
          schedulingEnabled: moduleFlags.scheduling,
          cmsEnabled: moduleFlags.cms,
        }),
        pieces
      );
    }
    return withTenantPieces(
      {
        version: '1.0.0',
        ...storedSite,
        theme,
        // Heal legacy trees that predate id-stamping before the engine edits them,
        // so the Navigator never collides two id-less nodes on one React key — and
        // repair the classes the PLATFORM stamped dead, which the frame has had for a
        // while and page bodies never did. A page stamped before a catalog factory was
        // fixed carries that bug forever otherwise: the factory fix reaches the next
        // tenant and no existing one. Draft-only, like every heal here.
        pages: storedSite.pages.map((p) => ({
          ...p,
          root: ensureUniqueIds(upgradePageBody(p.root).root),
        })),
        ...(storedSite.frame
          ? {
              frame: {
                ...storedSite.frame,
                root: ensureUniqueIds(
                  upgradePageBody(upgradeFrameChrome(storedSite.frame.root).root).root
                ),
              },
            }
          : {}),
        // NAMED LAYOUTS ARE NOT LOADED INTO THE ENGINE. silicaui 0.45.0 removed
        // `Site.frames`, so there is nothing to hand them to — and handing an engine a
        // key it does not know is how a save later drops it. They are not GONE: they are
        // rows in `builder_layouts`, the site's active one still wraps every page, and
        // the MCP layout tools still create, publish and switch them. What the canvas
        // lost is editing a NON-active shell, which no blueprint has ever shipped.
      },
      pieces
    );
    // Built once from the load — later edits flow through onChange, not a re-memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const siteRef = useRef<Site>(site);

  // The document as it stood immediately BEFORE the action being reported — what
  // `invertOps` reads prior values out of. Kept separate from `siteRef` (which
  // tracks the newest state for saving) because an inverse can only be computed
  // against the state the action started from. silica hands `onChange` a defensive
  // `structuredClone`, so this is a genuine snapshot, not a live reference that
  // would quietly become the after-state.
  const prevSiteRef = useRef<Site>(site);

  // Host-owned undo/redo (docs/126 §4.5). The stacks live here because the studio is
  // what learns about each action; `<CollaborativeHistory>` drives them. `historyRev`
  // is how a ref mutation reaches that component — it re-announces the delegate so
  // silica re-reads whether Undo is available.
  const historyRef = useRef<HistoryStacks>({ undo: [], redo: [] });
  const [historyRev, setHistoryRev] = useState(0);
  // Filled by `<CollaborativeHistory>` with the engine's `inverseOf`, which is only
  // reachable from inside `<Builder>` — and this is outside it.
  const invertRef = useRef<InvertOps | null>(null);

  // The page ids this client KNOWS the server holds — seeded from the load (the
  // starter is empty here: a fresh property has nothing persisted yet). A save may
  // only delete pages that were in this baseline and the operator has since removed;
  // a page absent for any other reason (an agent authored it over MCP after we loaded)
  // is never in the baseline, so we never delete it out from under them. Advanced to
  // the current set after each successful save.
  const baselineIdsRef = useRef<Set<string>>(new Set((storedSite?.pages ?? []).map((p) => p.id)));

  // NO LAYOUT BASELINE ANY MORE — see `toSyncInput`. silicaui 0.45.0 removed `Site.frames`
  // and `Page.frameId`, so the engine neither loads nor reports named layouts, and a
  // baseline the editor can never advance is a set of ids that only ever produces
  // deletions.

  // Pending per-page settings edits, keyed by page id, flushed on Save. `settingsDirty`
  // mirrors "the map is non-empty" into render so the Save button lights up for a
  // settings-only change — silica never fires `onChange` for these, so without it an
  // operator could type a page description and find Save still greyed out.
  const settingsEditsRef = useRef<Map<string, PageSettingsDraft>>(new Map());
  const [settingsDirty, setSettingsDirty] = useState(false);

  // The slug of the page currently open in the editor, so Preview opens THAT page.
  // silica owns which page is active and reports it through `onActivePageChange` (on
  // mount and on every switch), so a ref is the honest place for it — reading it in a
  // callback must not re-create the callback on every page switch.
  const activeSlugRef = useRef<string>('/');

  // Batch ids THIS client authored, so live-sync skips the echo of its own relayed ops.
  const ownBatchesRef = useRef<Set<string>>(new Set());
  // The ops silica emitted since the last save, and the idempotency id they'll flush
  // under — sent with the next Save so co-editors fold this operator's edits in live.
  const opsBufferRef = useRef<Op[]>([]);
  const batchIdRef = useRef<string | null>(null);

  // The media browser, resolved from the provider mounted above this component. Held
  // in a ref so the host — built ONCE at mount — can call the current picker without
  // taking it as a dependency and re-creating itself on every render.
  const pickPicture = useMediaPicker();
  const pickPictureRef = useRef(pickPicture);
  pickPictureRef.current = pickPicture;

  /** silica's `pickAsset` seam: open the tenant's library, hand back the chosen
   *  picture's URL.
   *
   *  Returns the URL, not a media id, because the published tree's `src` is emitted
   *  verbatim by `toHtml` and fetched by a browser that has no app to resolve an id
   *  through — the same reason the email builder writes URLs.
   *
   *  `alt` is deliberately NOT filled from the filename. "IMG_2381.jpg" read aloud by a
   *  screen reader is worse than silence, and auto-filling it would make the alt-text
   *  check pass on every image while helping nobody. The author writes real alt text;
   *  a missing one is a finding for the pre-publish check, not something to paper over.
   *
   *  0.35.0 only ever asks for `"image"`; the `kind` is honoured anyway so a future
   *  video request doesn't silently get a picture. */
  const pickAsset = useCallback(async (kind: 'image' | 'video') => {
    if (kind !== 'image') return null;
    const picked = await pickPictureRef.current();
    // A library asset with no resolvable URL cannot render — treat it as a cancel
    // rather than writing an empty `src` that blanks the image on the live site.
    return picked?.url ? { url: picked.url } : null;
  }, []);
  const pickAssetRef = useRef(pickAsset);
  pickAssetRef.current = pickAsset;

  /** Record (or clear) a page's pending settings edit. Held here rather than written
   *  immediately so the editor keeps ONE Save button — `doSync` flushes these right
   *  after the site reconcile. A null clears the entry, which is how the dirty flag
   *  goes back down when the operator undoes their own typing. */
  const onPageSettingsChange = useCallback((pageId: string, next: PageSettingsDraft | null) => {
    if (next) settingsEditsRef.current.set(pageId, next);
    else settingsEditsRef.current.delete(pageId);
    setSettingsDirty(settingsEditsRef.current.size > 0);
  }, []);

  /** silica's `inspectorPanels` seam: the extra Settings-tab sections sparx contributes.
   *
   *  ONE panel today — a page's search-and-sharing metadata, which lives on the
   *  `builder_pages` row and is therefore invisible to an engine whose `Page` is
   *  `{id,name,slug,root}`. It shows when the selected node IS some page's root, which is
   *  both the correct anchor (these are properties of the page element) and the whole
   *  reason this stopped being a toolbar drawer.
   *
   *  The GATE has to live out here, not inside the panel's `render`: the engine wraps
   *  whatever a panel returns in a titled section, so a panel that renders null still
   *  draws an empty heading — on every element, for every author, forever.
   *
   *  Matched against every page rather than the ACTIVE one on purpose. Selection and
   *  "which page is open" are separate facts in this engine, and a root node the author
   *  managed to select is a page they mean, whichever one the switcher shows.
   *
   *  Held in a ref for the same reason `pickAsset` is: the host is built ONCE at mount,
   *  and this closure has to read the current site, the current save baseline and the
   *  current pending-edit map. Reassigned on every render, so it never goes stale. */
  const inspectorPanelsRef = useRef<(node: Node) => InspectorPanel[]>(() => []);
  inspectorPanelsRef.current = (node) => {
    // `OutletNode` carries no id at all, and an un-stamped node cannot be a page root.
    const nodeId = node.kind === 'outlet' ? undefined : node.id;
    if (!nodeId) return [];
    const page = siteRef.current.pages.find(
      (p) => p.root.kind !== 'outlet' && p.root.id === nodeId
    );
    if (!page) return [];
    return [
      {
        id: 'sparx.page-search',
        title: 'Search & sharing',
        // After every built-in section. These are the page's own properties, not this
        // element's, so they read as a footnote to Element/Data/Accessibility rather
        // than as the first thing the author must scroll past.
        order: 100,
        render: () => (
          <PageSettingsPanel
            pageId={page.id}
            pageName={page.name}
            siteName={sitePreview?.identity.name ?? ''}
            // A page the server already holds can load its stored settings; one added
            // in this session cannot (there is no row yet), so the form opens blank
            // and its first write rides the save that creates the row.
            saved={baselineIdsRef.current.has(page.id)}
            pending={settingsEditsRef.current.get(page.id) ?? null}
            onChange={onPageSettingsChange}
          />
        ),
      },
    ];
  };

  /** silica's `inspectorTabs` seam (0.43): the whole tabs sparx contributes to the rail.
   *
   *  ONE today — History, the two undo ladders (saved drafts + published releases). It is
   *  `scope: "panel"`, which is the point of it: history belongs to the DOCUMENT, so it
   *  keeps rendering with nothing selected. A node-scoped tab would empty itself the
   *  instant the author clicked bare canvas, which is roughly when someone looking for
   *  "put it back how it was" is least likely to have an element selected.
   *
   *  Returned UNCONDITIONALLY for the same reason — the `node` argument is deliberately
   *  ignored. Filtering it on the selection is the documented way to make a panel tab
   *  unreachable.
   *
   *  `order: 20` puts it after the built-in Design (0) and Settings (10): the author's
   *  own element is the common case, and history is where you go when something went
   *  wrong. Held in a ref like `inspectorPanels`, because the host is built once at
   *  mount and this closure has to reach the CURRENT `onReload`. */
  const inspectorTabsRef = useRef<() => InspectorTabDef[]>(() => []);
  inspectorTabsRef.current = () => [
    {
      id: 'sparx.history',
      label: 'History',
      icon: 'clock',
      order: 20,
      scope: 'panel',
      render: () => <VersionHistoryPanel onReload={onReload} />,
    },
  ];

  // The host: the resolver over the canvas data root (placeholder records with the
  // tenant's REAL site.identity/site.social overlaid, so a bound Wordmark/logo/name
  // resolves to the actual brand) + the tenant's data sources + the commerce/site
  // composites + pinned cores + the host-node renderer (which DRAWS the site.brand
  // mark from that same root, instead of silica's grey placeholder) + the media
  // picker. Built once.
  const host = useMemo(() => {
    const pageSources: DataSource[] = sources.length > 0 ? sources : [...COMMERCE_SOURCES];
    // ONE root, shared by the resolver and the host-node renderer, so the brand mark
    // draws the exact identity a bound node resolves.
    const root = buildPreviewRoot(pageSources, sitePreview);
    return buildStudioHost({
      root,
      dataSources: toSilicaDataSources([...pageSources, ...SITE_SOURCES]),
      renderHostNode: makeRenderHostNode(root),
      // Through the ref, so the once-built host always reaches the live picker.
      pickAsset: (kind) => pickAssetRef.current(kind),
      inspectorPanels: (node) => inspectorPanelsRef.current(node),
      inspectorTabs: () => inspectorTabsRef.current(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The webfont families the canvas must LOAD, tracked from the LIVE theme so a
  // saved theme's face — and any Design-inspector typeface/heading edit — loads
  // too (silica draws the canvas in the plain workbench DOM; a family it hasn't
  // loaded falls back to Geist). Seeded from the mounted theme, updated on edit.
  const [themeFonts, setThemeFonts] = useState<(string | null)[]>(() =>
    themeFontFamilies(site.theme)
  );
  useCanvasBrandFonts(themeFonts);

  // ONE notion of "unsaved work", whatever produced it: a tree edit silica reported, or
  // a page-settings edit it knows nothing about. The dirty dot, the close-guard, the
  // status badge and the Save button all read this, so a settings-only change is as
  // protected as a canvas one.
  const unsaved = dirty || settingsDirty;

  useDirtySource(unsaved, 'Your site has unsaved changes. Close it anyway?');

  /** Fold one action into the undo history, while the document it started from is
   *  still in hand. */
  const recordHistory = useCallback(
    (ops: readonly Op[]) => {
      const stacks = historyRef.current;
      // The engine's own inverter (silicaui 0.36.0). It replaced sparx's
      // `invertOps`, which could not faithfully reverse a symbol-creating
      // `symbol.set` or a `node.setText` — see undo-history.tsx. `?? null` folds a
      // not-yet-mounted inverter into the same conservative path as an
      // un-invertible batch; the toast below is already suppressed on an empty
      // stack, which is what that case is.
      const inverse = invertRef.current?.(ops, prevSiteRef.current) ?? null;
      if (inverse) {
        stacks.undo.push({ ops: [...ops], inverse });
        // Bounded: each entry can carry whole subtrees, so a long session would
        // otherwise grow the tab's memory without limit.
        if (stacks.undo.length > HISTORY_LIMIT) stacks.undo.shift();
      } else {
        // An action nothing can faithfully reverse is a point the document cannot be
        // walked back past. Keeping the entries beneath it would offer an undo that
        // SKIPS it — producing a document nobody authored — so the stack goes instead.
        //
        // And it is SAID, not just done. A history that empties itself with no
        // explanation is the exact complaint this whole slice exists to fix; doing
        // the same thing quietly here would only make it rarer, not honest.
        if (stacks.undo.length > 0) {
          toast.add({
            title: 'Undo history cleared',
            description:
              "That step can't be undone, so the steps before it are no longer available. Nothing you have made is lost.",
            type: 'info',
          });
        }
        stacks.undo.length = 0;
      }
      // A new action always forks the timeline; the redo branch no longer applies.
      stacks.redo.length = 0;
      setHistoryRev((n) => n + 1);
    },
    [toast]
  );

  /** The history delegate moved the document. Take the result as the site to save,
   *  and put its ops on the same relay buffer an ordinary edit uses — to the server
   *  and to everyone else in the session, an undo is just another edit. */
  const onHistoryApplied = useCallback((next: Site, ops: Op[]) => {
    setThemeFonts(themeFontFamilies(next.theme));
    siteRef.current = next;
    prevSiteRef.current = next;
    if (ops.length) {
      batchIdRef.current ??= `wb-${crypto.randomUUID()}`;
      opsBufferRef.current.push(...ops);
    }
    setDirty(true);
    setHistoryRev((n) => n + 1);
  }, []);

  /** Someone else's edit just landed on this canvas. It never reaches `onChange`
   *  (a remote op must not echo back to its sender), so the before-snapshot would
   *  otherwise go stale and the NEXT local action's inverse would be computed
   *  against a document that no longer exists. */
  const onRemoteApplied = useCallback((next: Site) => {
    prevSiteRef.current = next;
  }, []);

  const onChange = useCallback(
    (next: Site, ops: readonly Op[], _meta: OpMeta) => {
      seededRef.current = true;
      recordHistory(ops);
      // Re-load fonts only when the theme reference actually changes (a typeface/
      // heading pick), not on every content edit.
      if (next.theme !== siteRef.current.theme) setThemeFonts(themeFontFamilies(next.theme));
      siteRef.current = next;
      prevSiteRef.current = next;
      // Buffer this edit's ops (docs/126 §4.5). Explicit-save holds them until Save, then
      // sends them alongside the snapshot so a human co-editor's canvas folds them in live —
      // the same relay path an agent's write takes. One batch id spans the whole buffer so a
      // retried save stays idempotent; minted lazily on the first op after a save.
      if (ops.length) {
        batchIdRef.current ??= `wb-${crypto.randomUUID()}`;
        opsBufferRef.current.push(...ops);
        // Hold the subtree we are working in, for as long as we keep working in it
        // (docs/silicaui/01 §16). Renewal is local to the live-sync component, so a long
        // edit is one message rather than one per keystroke.
        localEditRef.current?.();
      }
      setDirty(true);
      // Any edit can invalidate any finding, so the last report stops being reportable
      // the moment one lands. Cheap: `setState` to the value it already holds is a no-op
      // in React, so a typing burst does not re-render per keystroke.
      setCheckStale(true);
    },
    [recordHistory]
  );

  // A view signal, not persistence — silica fires it on mount and on every page
  // switch/rename/slug edit. Preview reads the slug.
  //
  // It does NOT drive the page-settings section any more: that is an Inspector panel now,
  // keyed off which node is SELECTED, so the page it describes is the one whose root the
  // author clicked rather than whichever page happens to be open. A ref, not state — this
  // must not re-render the editor on a page switch.
  const onActivePageChange = useCallback((page: PageMeta) => {
    activeSlugRef.current = page.slug;
  }, []);

  const doSync = useCallback(async () => {
    const next = siteRef.current;
    const currentIds = new Set(next.pages.map((p) => p.id));
    // The pages we loaded (or last saved) that the operator has since removed — the
    // ONLY deletions this save may perform. Anything else absent from `currentIds`
    // (e.g. a page an agent just created over MCP) is not ours to delete.
    const deletedPageIds = [...baselineIdsRef.current].filter((id) => !currentIds.has(id));
    const ops = opsBufferRef.current;
    const batchId = ops.length > 0 ? batchIdRef.current : null;
    // Record our own batch so live-sync skips its echo when the relay comes back around.
    if (batchId) ownBatchesRef.current.add(batchId);

    // Tenant masters FIRST, then the site. A saved piece is shared across every site
    // the business owns, so it is the more consequential half — and if the site sync
    // fails the author retries the same Save, whereas a library write that never
    // happened leaves the other sites showing an old design with nothing on screen
    // to say so. Only masters whose design actually changed are sent.
    const changed = changedTenantMasters(partitionSymbols(next.symbols), piecesRef.current);
    if (changed.length > 0) {
      await Promise.all(
        changed.map((piece) =>
          savePiece.mutateAsync({ key: piece.key, name: piece.name, root: piece.root })
        )
      );
      // Advance the baseline so the NEXT save compares against what was just stored
      // rather than the load — otherwise every subsequent save re-sends the same
      // master and mints a version per click.
      piecesRef.current = piecesRef.current.map((p) => {
        const hit = changed.find((c) => c.key === p.key);
        return hit ? { ...p, name: hit.name, root: structuredClone(hit.root) } : p;
      });
    }

    await sync.mutateAsync(toSyncInput(next, deletedPageIds, ops, batchId));
    // Committed — drop the buffer (a failed save threw above, keeping ops + batch id for a
    // retry under the SAME id, so the op log never double-appends).
    opsBufferRef.current = [];
    batchIdRef.current = null;
    // The server now holds our current set (having deleted only what we named); advance
    // the baseline so the next removal is computed against the truth, not the load.
    baselineIdsRef.current = currentIds;
    setDirty(false);

    // Page settings (chrome choice, title/description/social picture/indexing) land
    // AFTER the sync, and that order is load-bearing: a page created in this session
    // has no row until the
    // sync creates it, so patching first would 404 and lose the operator's words.
    // Deletions are honoured too — settings for a page removed in this same save have
    // nothing left to attach to.
    const edits = [...settingsEditsRef.current].filter(([id]) => currentIds.has(id));
    if (edits.length > 0) {
      await Promise.all(
        edits.map(([pageId, draft]) =>
          updatePageSettings.mutateAsync({ pageId, settings: draftToPatch(draft) })
        )
      );
    }
    // Cleared only AFTER the patches resolve. Clearing first would mean a failed
    // request threw with the operator's words already discarded — they would reopen the
    // drawer to find their description gone and the error blaming the save.
    for (const [id] of edits) settingsEditsRef.current.delete(id);
    setSettingsDirty(settingsEditsRef.current.size > 0);
  }, [sync, updatePageSettings, savePiece]);

  const onSave = useCallback(async () => {
    try {
      await doSync();
    } catch (error) {
      toast.add({
        title: 'Could not save',
        description: builderErrorMessage(error, 'Nothing was saved. Try again in a moment.'),
        type: 'error',
      });
    }
  }, [doSync, toast]);

  /**
   * Save, then RUN the check. The one place the ordering is stated.
   *
   * The endpoint reads the SAVED draft, so skipping the save would report on the state
   * before the edit the author is about to publish — a check one save behind says
   * "clean" about work it has never seen.
   *
   * This used to be `openCheck`: opening the panel WAS running it, which meant a save
   * plus a full walk of every page's composed document every time someone glanced at a
   * list they had already read. Opening is now free and this is the button.
   */
  const runCheck = useCallback(async () => {
    try {
      await doSync();
    } catch (error) {
      toast.add({
        title: 'Could not save before checking',
        description: builderErrorMessage(
          error,
          'The check reads your saved draft, so it was not run. Try again in a moment.'
        ),
        type: 'error',
      });
      return;
    }
    const { isSuccess } = await check.refetch();
    // Only a report that actually arrived earns the count in the status bar. A failed
    // refetch leaves the previous one marked stale, which is the truth.
    if (isSuccess) setCheckStale(false);
  }, [check, doSync, toast]);

  // silica's own Publish button drives this: persist the current draft first (so
  // the publish reflects the newest edit), then snapshot draft → live.
  //
  // THE CHECK RUNS HERE, AND IT NEVER BLOCKS. It is asked only about things that are
  // BROKEN — a link to a page that does not exist, an image with no file, a page with
  // nothing on it — and only then does it interrupt, once, with a question whose
  // primary answer is "Publish anyway". Warnings and suggestions never interrupt at
  // all; they are what the Check button is for.
  //
  // The friction is deliberately at the moment of decision rather than in a badge
  // somewhere: a badge is something an author can look past for weeks, and "we
  // published a broken link" is the failure this whole wave exists to prevent. But the
  // site belongs to the person who built it — they may be publishing a link to a page
  // that goes live in an hour — so the answer is theirs and the default is yes.
  //
  // A check that FAILS to run (network, a 500) is not a reason to hold up a publish
  // that would otherwise succeed, so it degrades to null and the publish proceeds.
  const onPublish = useCallback(
    async (payload: PublishPayload) => {
      try {
        siteRef.current = payload.site;
        await doSync();

        const report = await getSiteCheck().catch(() => null);
        if (report && report.counts.error > 0) {
          const n = report.counts.error;
          const proceed = await confirm({
            title: `${String(n)} thing${n === 1 ? '' : 's'} on your site ${n === 1 ? 'is' : 'are'} broken`,
            description:
              n === 1
                ? 'One thing on your site would not work for a visitor — a link that goes nowhere, ' +
                  'an image with no picture in it, or a page with nothing on it. You can publish ' +
                  'anyway and fix it after, or look at it first.'
                : `${String(n)} things on your site would not work for a visitor — links that go ` +
                  'nowhere, images with no picture in them, or pages with nothing on them. You can ' +
                  'publish anyway and fix them after, or look at them first.',
            confirmLabel: 'Publish anyway',
            cancelLabel: 'Let me look first',
            color: 'primary',
          });
          if (!proceed) {
            // Seed the cache with the report we ALREADY have. The publish path fetched
            // it imperatively a few lines up, on a draft saved a few lines before that,
            // so the panel opens onto a current list without a second round trip — and
            // without the author having to press Run on a check that just ran.
            queryClient.setQueryData(SITE_CHECK_KEY, report);
            setCheckStale(false);
            setCheckOpen(true);
            return;
          }
        }

        await publish.mutateAsync();
        toast.add({
          title: 'Your site is published',
          description: 'Visitors now see this version.',
          type: 'success',
        });
      } catch (error) {
        toast.add({
          title: 'Could not publish',
          description: builderErrorMessage(error, 'Your draft is still saved. Try again.'),
          type: 'error',
        });
      }
    },
    [confirm, doSync, publish, queryClient, toast]
  );

  const onPreview = useCallback(async () => {
    // Open the tab synchronously (pop-up-blocker-safe), then point it at the
    // draft-preview URL once the token is minted. Save first so the server draft
    // the preview serves reflects the current edits.
    //
    // NO `noopener` / `noreferrer` IN THESE FEATURES, and that is the whole reason this
    // works. Either one makes `window.open` return NULL by specification — so the handle
    // this function is built around was thrown away at birth, and the "pop-up-blocker-safe"
    // promise above became the opposite: the placeholder tab sat at about:blank forever
    // while the fallback `window.open` below ran AFTER two awaits, outside the user
    // gesture, where the pop-up blocker kills it. Every Preview click stranded a blank tab
    // and showed no error, because neither failure branch had run. Found in the browser
    // 2026-08-02 (`/v1/builder/preview-token` returned 200 each time — the token was never
    // the problem).
    //
    // The isolation `noopener` exists for is kept by nulling `opener` on the child instead,
    // which is legal while it is still same-origin `about:blank` and leaves OUR handle
    // intact. Setting `location.href` on it afterwards stays allowed cross-origin.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      if (unsaved) await doSync();
      const [{ token }, target] = await Promise.all([
        previewToken.mutateAsync(),
        siteOrigin.refetch().then((r) => r.data ?? siteOrigin.data ?? null),
      ]);
      if (!target) {
        tab?.close();
        toast.add({
          title: 'No web address yet',
          description: 'Connect a domain to this site to preview it.',
          type: 'warning',
        });
        return;
      }
      // Preview the page the author is LOOKING AT, not always the home page. This
      // always opened `/`, so previewing a change to the About page meant landing on
      // Home and navigating — and on a site whose home is unchanged, reading as
      // "Preview does nothing".
      // `extraQuery` is empty in every deployed environment; in local dev it carries the
      // `?tenant=`/`?property=` the storefront needs to know which site this is, because
      // there is no per-tenant DNS on a developer's machine.
      const url = `${target.origin}${previewPath(activeSlugRef.current, recordSamples.data)}?sparxSitePreview=${encodeURIComponent(token)}${target.extraQuery}`;
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      tab?.close();
      toast.add({ title: 'Could not open preview', type: 'error' });
    }
  }, [unsaved, doSync, previewToken, siteOrigin, recordSamples.data, toast]);

  const status = liveStatus(publishState, unsaved);
  const validPageIds = useMemo(() => new Set(site.pages.map((p) => p.id)), [site]);

  // Which un-appliable remote changes are outstanding (docs/126 §4.5). Owned HERE rather
  // than inside `BuilderLiveSync` because the affordance it drives is a BUTTON, and the
  // live-sync indicators now render in silica's status slot, which must stay free of tab
  // stops (docs/silicaui/01 §13). Accumulated as a SET: two agent writes landing before the
  // operator reacts is one reload, and repeating "the update" twice would suggest
  // otherwise.
  const [reloadHints, setReloadHints] = useState<string[]>([]);
  const onReloadHints = useCallback((hints: string[]) => {
    setReloadHints((prev) => Array.from(new Set([...prev, ...hints])));
  }, []);

  // The other editors in this document (silicaui 0.45 `peers` / docs/silicaui/01 §16).
  //
  // Held HERE for the same structural reason as `reloadHints`: the roster arrives on the
  // socket, which lives inside `<Builder>`, and `peers` is a prop ON `<Builder>`. The
  // studio is the only place that can see both.
  //
  // Two effects, and the engine keeps them apart: a peer's `selection` is DRAWN (a named
  // ring on the canvas, a marker in the Navigator) and a peer's `claim` is ENFORCED (that
  // subtree greys, names its holder, and refuses to be edited here while it stands).
  // Neither is correctness machinery — per-node last-write-wins, the op log and draft
  // history already keep the document right, and a claim is never relayed and never
  // reaches the undo stack, so it cannot be why a remote op was dropped. It exists to
  // stop two people making a mess they then have to untangle by hand.
  //
  // Until this landed, co-editing worked and said nothing: a heading rewrote itself under
  // the operator's cursor with only "3 editing" in the status bar to connect it to a
  // person.
  const [peers, setPeers] = useState<Peer[]>([]);

  // Filled by `<BuilderLiveSync>` with "renew my claim". Called from `onChange` because
  // that is the ONLY place a real edit's ops surface — `editor.subscribe` reports the
  // change but hands over an empty `ops` array, so a claim driven from inside the socket
  // component never fired. Same inversion as `invertRef` in undo-history.
  const localEditRef = useRef<(() => void) | null>(null);

  // ONE toolbar. The status badge + Preview + Save are HOST concerns (silica owns
  // only local edits, not whether our onChange persistence succeeded), so they ride
  // in `toolbarSlot` — silica renders it in the editor header, right before its own
  // Publish button. A separate PaneToolbar above the canvas would just stack a
  // second bar on silica's; the whole point is that the operator sees one row of
  // controls, not two. `ApplyInitialPage` renders nothing and rides along here.
  return (
    <div className="h-full">
      <Builder
        key={propertyId ?? 'site'}
        document={site}
        host={host}
        persistKey={null}
        dataToggle={false}
        peers={peers}
        initialMode={modeParam}
        onModeChange={setMode}
        onChange={onChange}
        onActivePageChange={onActivePageChange}
        onPublish={onPublish}
        // STATE GOES IN THE STATUS BAR (silicaui 0.41 `statusBarSlot` / docs/silicaui/01 §14).
        //
        // It rode in the header first — `toolbarSlot`, then §13's `toolbarStatusSlot` — and
        // the header was the wrong FLOOR, not just the wrong slot. The footer already carries
        // exactly this kind of fact and nothing else: which surface you are on, which device
        // width you are looking at. Two indicators of the same kind up in the toolbar meant a
        // person read the session's state in a bar packed with buttons, next to controls it
        // has nothing to do with. Down here it sits beside `mode` and reads left to right as
        // one sentence about the session: Page · 3 editing · Unsaved changes … Desktop.
        //
        // Non-interactive only, and the engine is stricter about it here than in the header —
        // a 28px strip is no place for a control, and its own two children are plain text. So
        // the live-sync Reload BUTTON stays in the action slot below, driven by the hints this
        // reports up. That split is why there are two components rather than one.
        //
        // No `toolbarStatusSlot` at all now. Splitting the two badges across two floors would
        // be the worst of both: state in two places, and neither of them complete.
        statusBarSlot={
          <div className="flex items-center gap-2">
            {propertyId ? (
              <BuilderLiveSync
                propertyId={propertyId}
                baselineIdsRef={baselineIdsRef}
                ownBatchesRef={ownBatchesRef}
                onRemoteApplied={onRemoteApplied}
                onReloadHints={onReloadHints}
                onPeers={setPeers}
                localEditRef={localEditRef}
              />
            ) : null}
            <Badge color={status.tone} variant="soft" size="sm">
              {status.label}
            </Badge>
            {/* The check, WHOLE, now that a status item may disclose its own detail
                (silicaui 0.45 / docs/silicaui/01 §18). The count and the list used to be
                two floors apart — the number here, the button that opened it up in the
                toolbar — because §14 documented this slot as carrying nothing
                interactive. `StatusItem` moved that line from "nothing interactive" to
                "nothing that ACTS", so the number a person wants to click is the thing
                they click. There is no Check button in the toolbar any more; one target,
                where the fact is. */}
            <SiteCheck
              open={checkOpen}
              onOpenChange={setCheckOpen}
              report={check.data ?? null}
              stale={checkStale}
              running={check.isFetching}
              error={check.error}
              onRun={() => void runCheck()}
            />
          </div>
        }
        toolbarSlot={
          <div className="flex items-center gap-2">
            <CollaborativeHistory
              stacksRef={historyRef}
              invertRef={invertRef}
              revision={historyRev}
              onApplied={onHistoryApplied}
            />
            <BuilderReloadNotice
              hints={reloadHints}
              onReload={() => {
                setReloadHints([]);
                onReload();
              }}
            />
            <Button
              data-tour="builder-preview"
              size="sm"
              variant="outline"
              color="neutral"
              loading={previewToken.isPending}
              onClick={() => {
                void onPreview();
              }}
            >
              <Eye className="size-4" aria-hidden />
              Preview
            </Button>
            <Button
              data-tour="builder-save"
              size="sm"
              color="module"
              disabled={!unsaved || sync.isPending}
              loading={sync.isPending}
              onClick={() => {
                void onSave();
              }}
            >
              <Save className="size-4" aria-hidden />
              {unsaved ? 'Save' : 'Saved'}
            </Button>
            {pageIdParam && validPageIds.has(pageIdParam) ? (
              <ApplyInitialPage pageId={pageIdParam} />
            ) : null}
            {componentIdParam ? <ApplyInitialPiece pieceKey={componentIdParam} /> : null}
          </div>
        }
      />
    </div>
  );
}

/** A page's storefront path for the preview URL. silica stores a slug as `/`, `/shop`
 *  or (older trees) a bare `shop`; the storefront routes on a leading-slash path.
 *
 *  A RECORD PAGE HAS A ROUTE BUT NOT A URL. `/products/:handle` is where the page lives;
 *  a browser sent there gets a 404, because `:handle` is a literal segment as far as the
 *  router is concerned and no product has that handle. So the record page previews at a
 *  REAL record — `samples` carries one live path per record type, resolved server-side
 *  under the storefront's own visibility rules (`recordSampleService`).
 *
 *  Falling back to the route INDEX (`/products`, `/blog`) when the tenant has no record of
 *  that kind yet is the honest answer, not a defect: there is no detail page to show, and
 *  the index is a real page one click from every record. It is also where Preview always
 *  landed before samples existed, so a failed lookup costs nothing. (Before THAT, this
 *  said a collection template "has no route of its own" and opened the home page.) */
function previewPath(
  slug: string | null | undefined,
  samples: Record<string, string> | undefined
): string {
  const address = recordAddressAt(slug);
  if (address) return recordPreviewPath(address, samples);
  const bare = (slug ?? '').trim().replace(/^\/+/, '');
  if (bare === '') return '/';
  return `/${bare}`;
}

/** Silica's engine owns which page is open; this opens the page named by the
 *  `{pageId}` deep link once on mount. Rendered inside `toolbarSlot`, which sits
 *  within the Editor provider, so `useEditor()` resolves. Renders nothing. */
function ApplyInitialPage({ pageId }: { pageId: string }) {
  const editor = useEditor();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    try {
      editor.setActivePage(pageId);
    } catch {
      // The page isn't in the site (a stale link) — leave the engine on its
      // default first page rather than crashing the editor.
    }
  }, [editor, pageId]);
  return null;
}

/** Opens the saved piece named by the `{componentId}` deep link — the other half of
 *  the Saved-pieces pane's "Edit design" button, which has pointed here since it was
 *  written and had nothing listening.
 *
 *  `enterSymbol` is the whole mechanism: the tenant master was materialized into the
 *  document as `tenant:<key>` (`saved-pieces.ts`), so editing the piece IS editing a
 *  silica symbol, and the engine retargets its entire spine — canvas, Navigator,
 *  Inspector — onto that master. Every instance across the site re-renders from it
 *  live, which is what makes the pane's "changes everywhere" claim literally true.
 *
 *  A key that resolves to nothing (deleted since the link was made, or a legacy piece
 *  with no silica master) is a NO-OP by design: `enterSymbol` returns early on an
 *  unknown id, and the author lands on the normal page canvas rather than an empty
 *  editing mode with nothing in it and no way to explain itself. */
function ApplyInitialPiece({ pieceKey }: { pieceKey: string }) {
  const editor = useEditor();
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    editor.enterSymbol(tenantSymbolId(pieceKey));
  }, [editor, pieceKey]);
  return null;
}

/** Map the whole extracted `Site` onto the sync wire shape. The full roster goes every
 *  time (the snapshot stays authoritative, last-write-wins). Deletions are stated
 *  EXPLICITLY via `deletedPageIds` — the server never infers a removal from an absent
 *  page, so a page an agent authored over MCP while this editor was open survives the
 *  save. `ops` (when present) ride ALONGSIDE the snapshot: the server appends them to the
 *  log and relays them, so a co-editor folds this operator's edits in live (docs/126
 *  §4.5) — additive, never a replacement for the authoritative snapshot. */
function toSyncInput(
  site: Site,
  deletedPageIds: string[],
  ops: readonly Op[] = [],
  batchId: string | null = null
): SiteSyncInput {
  // Only the SITE-OWNED symbols persist to this property. A `tenant:*` symbol is a
  // materialized copy of a shared library master (`saved-pieces.ts`) and is sent to
  // the library instead — writing it here as well would fork the master into a
  // per-site copy on first save, and the "change it once, it changes everywhere"
  // promise the Saved-pieces pane makes would quietly stop being true.
  const symbols = partitionSymbols(site.symbols).site;
  return {
    pages: site.pages.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      root: p.root,
      // NO `frameId`. The engine stopped carrying one in 0.45.0, so the only value this
      // could send is the "site default" sentinel — which the sync would apply, resetting
      // every page the author had set to render bare. An ABSENT field is how this says
      // "leave the page's chrome alone" (site-service only writes the column when the
      // field is present), and the Search & sharing panel is what sets it now.
    })),
    pageIds: site.pages.map((p) => p.id),
    ...(deletedPageIds.length > 0 ? { deletedPageIds } : {}),
    ...(ops.length > 0 && batchId
      ? { ops: ops as unknown as SiteSyncInput['ops'], batchId, baseSeq: 0 }
      : {}),
    // The site's ONE shared shell — the header and footer every page wears unless it has
    // been switched off. This is `Site.frame`, which 0.45.0 keeps; Layout mode still
    // edits it and every starter and blueprint seeds one.
    ...(site.frame ? { frame: { root: site.frame.root } } : {}),
    // NO `frames` / `deletedFrameIds`, and the omission is the point. The engine has no
    // `Site.frames` as of 0.45.0, so it can neither report the tenant's named layouts nor
    // notice a new one — and a sync that spoke about them anyway could only ever say
    // "there are none", which the server would honour by deleting the lot. Saying nothing
    // preserves them: they are rows in `builder_layouts`, the active one still wraps every
    // page, and the MCP layout tools still create, publish and switch them.
    // Sent even when EMPTY, unlike the other optional halves: the sync treats an
    // absent `symbols` as "not speaking about symbols" and preserves what is stored
    // (site-service `symbolsUpdateFor`). A site whose only symbols were tenant ones
    // must be able to say "none of mine", or the stale materialized copies stored
    // before this shipped would live in the property row forever.
    symbols,
    ...(site.theme ? { theme: site.theme } : {}),
    ...(site.savedThemes ? { savedThemes: site.savedThemes } : {}),
  };
}

/** The "is this live?" badge — local unsaved work first (the operator's own edit),
 *  then the server's draft-vs-published truth. */
function liveStatus(
  state: SitePublishState,
  dirty: boolean
): { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' } {
  if (dirty) return { label: 'Unsaved changes', tone: 'warning' };
  if (state.neverPublished) return { label: 'Not published yet', tone: 'neutral' };
  if (state.hasUnpublished) return { label: 'Saved · not live yet', tone: 'info' };
  return { label: 'Published', tone: 'success' };
}
