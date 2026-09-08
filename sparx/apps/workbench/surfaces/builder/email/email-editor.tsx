'use client';

// The email studio — ONE surface for every email this business sends.
//
// This is the silicaui `<EmailBuilder>`: silica owns the editor chrome (the Insert
// palette, the canvas, the Design inspector) AND the two document-level fields an
// email has that a page doesn't — its subject and its inbox-preview line, edited
// through the canvas's own inspector. What sparx keeps is everything AROUND that,
// in the strip above the engine: WHICH email you're editing (the switcher), the
// email's name, its lifecycle (new · rename · delete · customize-for-this-site ·
// publish), a merge-tag reference, a branded preview, and the unsaved-work net.
//
// There is no separate list. The switcher IS the list — the whole catalog loads
// once (each email carries its own draft document), and switching is in-memory.
//
// EXPLICIT SAVE, on purpose — and this is the one place the workbench deliberately
// DIVERGES from the dashboard's version of this screen, which debounce-autosaves.
// Autosave was removed platform-wide: silica hands back the whole document on every
// edit, we hold it and mark the pane dirty, and nothing reaches the server until
// the operator presses Save. That is why this is a pane — the dirty dot, the
// close-guard and the per-site layout are the safety net a modal would sit outside
// of — and it is why SWITCHING or CREATING with unsaved edits stops to confirm
// rather than quietly flushing the burst the way the dashboard does.
//
// The canvas is a live preview in its own right: silica resolves `{{merge.tags}}`
// against sample data as you type, so a `{{customer.firstName}}` reads as a real
// name on screen, and it renders the send's brand frame (brand bar/wordmark/legal
// footer) as inert chrome around the body (silicaui 0.34).
//
// FALLBACK TOKENS RESOLVE HERE TOO, as of silicaui 0.49 — worth stating because this
// file carried the opposite note for a long time and someone may remember it. silica
// owns one token production, a bare dotted path, and hands every other `{{…}}` body to
// the host's `resolveExpression`; sparx wires that to the SAME evaluator the send uses,
// so `{{customer.firstName ?? "there"}}` reads as "there" on the canvas exactly as it
// will in the inbox. Before the hook there was no seam and the canvas showed raw braces
// for precisely the tokens most worth using — a fallback is what stops a nameless
// customer reading "Hi  — thanks".
//
// The "Preview" below is still the STEP BEYOND the canvas — the final, email-safe
// projected HTML, rendered by the server with real per-recipient data — but it is now a
// step in fidelity rather than a correction of something the canvas got wrong.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@wizeworks/query';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  EmptyState,
  Heading,
  Input,
  NativeSelect,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Eye,
  History,
  Mail,
  Monitor,
  Moon,
  MousePointerClick,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  SplitSquareHorizontal,
  Sun,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  EmailBuilder,
  clearLocalSavedBlocks,
  readLocalSavedBlocks,
} from '@wizeworks/silicaui-builder/email/react';
import type {
  EmailBuilderHost,
  SavedBlock,
  SavedBlockChange,
} from '@wizeworks/silicaui-builder/email/react';
import type {
  EmailColorDefaults,
  EmailDocument,
  EmailProject,
} from '@wizeworks/silicaui-builder/email';
import { THEME_PRESETS, type Theme } from '@wizeworks/silicaui-html';
import {
  compileThemeForTenant,
  compiledToSilicaTheme,
  storedPresetV2,
} from '@wizeworks/site-themes';
import {
  createSilicaResolver,
  defaultSilicaFormat,
  emailMergeTags,
  EMAIL_CONTENT_BLOCKS,
  EMAIL_SOURCES,
  groupMergeTags,
  resolveEmailExpression,
  SAMPLE_EMAIL_DATA,
  toSilicaDataSources,
  type MergeTag,
} from '@wizeworks/builder-schemas';
import { MediaPickerProvider } from '../../cms/media-picker';
import { emailInspectorPanels } from './email-asset-panel';
import { PaneScope } from '../../../lib/dock/window-boundary';
import { useConfirm } from '../../../lib/confirm';
import { useDirtySource } from '../../../lib/workbench/dirty';
import { useActiveSiteId, useSites } from '../../../lib/api/shell-data';
import type { SurfaceContext } from '../../../lib/surfaces/registry';
import {
  effectiveTenantBrand,
  emailErrorMessage,
  emailStatus,
  useCreateEmail,
  useCreateSavedEmailBlock,
  useCustomizeEmailForSite,
  useDeleteEmail,
  useDeleteSavedEmailBlock,
  useEmailChrome,
  useEmails,
  useEmailVersions,
  usePreviewEmail,
  usePublishEmail,
  useRenameEmail,
  useRenameSavedEmailBlock,
  useRestoreEmailVersion,
  useSavedEmailBlocks,
  useSaveEmailDoc,
  useSetEmailCampaign,
  useSendEmailTest,
  useSiteBrandInfos,
  useSiteBuilderConfig,
  useTenantBrand,
  EMAIL_BLOCKS_KEY,
  type EmailCheck,
  type EmailCheckLevel,
  type EmailDesign,
  type EmailPreview,
  type EmailVersion,
  type SavedEmailBlock,
} from './email-data';
import { PaneLoadError } from '../../../components/pane-load-error';

/** The neutral fallback theme — used only until the tenant brand loads, or if the
 *  brand/config read fails. The compiled tenant brand (below) is what normally
 *  seeds the canvas; either way the theme only tints NEW blocks and the SEND
 *  re-resolves the real per-site brand (docs/120), so it never decides the shipped
 *  look. */
const FALLBACK_THEME: Theme = THEME_PRESETS[0]!;

/** The FIXED semantic status colors the send applies (`@wizeworks/email/silica`
 *  `brand-colors.ts` SEMANTIC) — a success is green for every tenant, a warning
 *  amber, independent of the brand palette. Overlaid onto the canvas theme's own
 *  `--color-{info,success,warning,error}` tokens so silica's live repaint
 *  (`setColorDefaults`) paints the ✓ Confirmed / warning / error cues on the EDIT
 *  canvas with the EXACT hexes the send does — otherwise the compiled theme's own
 *  semantic tokens (a different green) drift the canvas from the Preview.
 *
 *  KEEP IN SYNC with `wizeworks/packages/email/src/silica/brand-colors.ts` SEMANTIC — the two
 *  are the same fixed constants, deliberately duplicated (a client component must
 *  not pull the server email package into its bundle), the same way the builder
 *  live-sync wire contract is duplicated from api-rest. */
const EMAIL_SEMANTIC_TOKENS: Record<string, string> = {
  '--color-info': '#1d4ed8',
  '--color-success': '#15803d',
  '--color-warning': '#b45309',
  '--color-error': '#b91c1c',
};

/** Turn the send's resolved role→hex map (`EmailChrome.colors`, from the server) into
 *  the silica `Theme` the canvas reads. silica's `resolveEmailColorDefaults` pulls each
 *  role straight back off these `--color-*` tokens, so `resolveEmailColorDefaults(theme)`
 *  === the send's map — the canvas repaints every `*Auto` field in EXACTLY the colors
 *  the inbox gets (brand primary/base + the fixed semantics), instead of the site page
 *  theme, which can diverge or fail to resolve and drop the canvas to silica's neutral
 *  defaults (the black button). */
function emailColorsToTheme(c: EmailColorDefaults): Theme {
  return {
    name: 'email-brand',
    mode: 'light',
    tokens: {
      '--color-primary': c.primary,
      '--color-primary-content': c.primaryContent,
      '--color-base-content': c.baseContent,
      '--color-base-100': c.base100,
      '--color-base-200': c.base200,
      '--color-base-300': c.base300,
      '--color-secondary': c.secondary,
      '--color-accent': c.accent,
      '--color-neutral': c.neutral,
      '--color-info': c.info,
      '--color-success': c.success,
      '--color-warning': c.warning,
      '--color-error': c.error,
    },
    dark: {},
  };
}

/** The email binding vocabulary as silica data sources — drives the built-in
 *  binding picker and the inline `{{` autocomplete. Static (the email sources are
 *  code-defined), so built once at module load rather than per render. */
const DATA_SOURCES = toSilicaDataSources(EMAIL_SOURCES);

/** The sparx `EmailBuilderHost`: the SAME resolver the site and the send use,
 *  over the email sample data, so BINDINGS resolve on the canvas as they will in the
 *  inbox. `hideWhenEmpty` matches the send's conditional (a bound block with no value
 *  is dropped, not left showing an empty label).
 *
 *  `resolveExpression` is what makes that claim true for TOKENS as well as bindings, and
 *  it is new (silicaui 0.49). Silica owns one production — a bare dotted path — and hands
 *  every other `{{…}}` body here verbatim, so sparx's `?? "fallback"` grammar is resolved
 *  on the canvas by the SAME evaluator the send uses. Before the hook existed there was
 *  no seam at all and the canvas showed raw braces for exactly the tokens most worth
 *  using. Same evaluator, deliberately: a second one would let the canvas and the inbox
 *  disagree about what a fallback means, which is a worse bug than the one it replaced. */
const HOST: EmailBuilderHost = (() => {
  const resolver = createSilicaResolver({
    root: SAMPLE_EMAIL_DATA,
    format: defaultSilicaFormat,
    hideWhenEmpty: true,
  });
  return {
    resolveBinding: resolver.resolveBinding,
    resolveCollection: resolver.resolveCollection,
    resolveExpression: (expr, scope) =>
      resolveEmailExpression(expr, (path) => resolver.resolveBinding(path, scope)?.value),
    dataSources: () => DATA_SOURCES,
    // Curated content blocks ON TOP of silica's built-in 8 primitives (merge, not
    // replace) — a summary card / CTA / callout an author drops in one move, in the
    // base design language, repainted to the tenant brand on insert.
    catalog: () => ({ extend: EMAIL_CONTENT_BLOCKS }),
    // A picture picker on image/video/section nodes — pick from the media library
    // instead of pasting a URL (needs the MediaPickerProvider wrapping the builder).
    inspectorPanels: emailInspectorPanels,
  };
})();

/** The merge tags an author can drop into copy, grouped by where each comes from.
 *  Static — the flat email token set doesn't change per tenant. */
const MERGE_GROUPS = groupMergeTags(emailMergeTags());

export function EmailEditorSurface({ ctx }: { ctx: SurfaceContext }) {
  return <EmailStudio ctx={ctx} />;
}

function EmailStudio({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: emails, isPending, isError, refetch } = useEmails();
  const { data: sites } = useSites();
  const { data: activeSite } = useActiveSiteId();

  // Everything the canvas needs to render the email as it SHIPS, resolved server-side
  // from the active site's EMAIL brand (docs/impl transactional-email §7): the inert
  // `frame` (brand bar/wordmark/legal footer, silicaui 0.34) AND the exact `colors`
  // map the send paints with. Feeding `colors` to the canvas theme is what makes the
  // edit canvas match the inbox — silica's `setColorDefaults` repaints every `*Auto`
  // block from it, in the brand primary/base + fixed semantics the send uses, instead
  // of the site PAGE theme (which for some sites resolves to nothing and drops the
  // canvas to silica's neutral defaults — the black button).
  const chrome = useEmailChrome();
  const chromeSettled = !chrome.isLoading;

  // The site page theme + brand — the FALLBACK color source, used only until the
  // chrome read settles or if it fails. (Left in place so a chrome hiccup degrades to
  // the previous behaviour rather than a bare canvas.)
  const brand = useTenantBrand();
  const siteConfig = useSiteBuilderConfig();
  const siteBrands = useSiteBrandInfos();
  const brandSettled = !brand.isLoading && !siteConfig.isLoading;

  const canvasTheme = useMemo<Theme>(() => {
    // The real thing: the send's own resolved color map → the canvas repaints in
    // exactly the inbox colors. Everything below is the fallback for before this
    // settles / if it failed.
    if (chrome.data?.colors) return emailColorsToTheme(chrome.data.colors);
    if (!brand.data || !siteConfig.data) return FALLBACK_THEME;
    try {
      const property = siteBrands.data?.find((s) => s.id === activeSite?.propertyId);
      const effective = effectiveTenantBrand(brand.data, property?.brandOverride);
      const compiled = compileThemeForTenant({
        // The site's OWN theme under the brand — so the email canvas paints in the
        // same palette as the site it is sent from. `themeKey` used to be passed
        // instead, which resolved one of six legacy presets and matched nothing a
        // tenant could pick, so every canvas fell back to the platform base.
        preset: storedPresetV2(siteConfig.data.draftSettings?.themePreset),
        brand: effective,
        presentation: siteConfig.data.draftSettings?.presentation ?? null,
      });
      const silica = compiledToSilicaTheme(compiled, siteConfig.data.themeKey);
      // Overlay the send's FIXED semantic status colors so the canvas repaints the
      // status cues exactly as the Preview/send does (the compiled theme carries its
      // own, differing, semantic tokens).
      return { ...silica, tokens: { ...silica.tokens, ...EMAIL_SEMANTIC_TOKENS } };
    } catch {
      return FALLBACK_THEME;
    }
  }, [chrome.data, brand.data, siteConfig.data, siteBrands.data, activeSite?.propertyId]);

  // The email being edited. Starts unresolved; an effect settles it once the
  // catalog loads — to the deep-linked id, else the first email. `{id:'new'}`
  // deep-links into the "create one now" path instead.
  const paramId = typeof ctx.params.id === 'string' ? ctx.params.id : undefined;
  const [activeId, setActiveId] = useState<string | null>(null);
  const openedNewRef = useRef(false);

  // The live document for the active email. Seeded from the catalog EXACTLY ONCE
  // per email (guarded by the id it was seeded for), then owned by silica's
  // onChange — so a background refetch never overwrites unsaved edits, and Save /
  // Publish read the CURRENT document.
  const docRef = useRef<EmailDocument | null>(null);
  const seededForId = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rendered, setRendered] = useState<EmailPreview | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Bumped on a version restore to force `<EmailBuilder>` to remount on the reseeded
  // draft — the active email id alone doesn't change, so it can't drive the remount.
  const [remountKey, setRemountKey] = useState(0);

  const active: EmailDesign | null = activeId
    ? (emails?.find((e) => e.id === activeId) ?? null)
    : null;

  // The one-time-per-email seed. Done in render (not an effect) so the document is
  // in place on the SAME render the switcher remounts `<EmailBuilder>` (via its
  // `key`) — an effect would remount with the previous email's document first.
  // Guarded by `seededForId`, so it runs once per email; the render-phase state
  // reset is the supported "adjust state when the key changes" pattern.
  if (active && seededForId.current !== active.id) {
    seededForId.current = active.id;
    docRef.current = active.silicaDoc as EmailDocument;
    setDirty(false);
  }

  const create = useCreateEmail();
  const targetId = activeId ?? '';
  const rename = useRenameEmail(targetId);
  const save = useSaveEmailDoc(targetId);
  const publish = usePublishEmail(targetId);
  const preview = usePreviewEmail(targetId);
  const remove = useDeleteEmail(targetId);
  const sendTest = useSendEmailTest(targetId);
  const customize = useCustomizeEmailForSite();
  const restore = useRestoreEmailVersion(targetId);
  const versions = useEmailVersions(targetId, historyOpen);

  // ── Saved blocks (docs/impl transactional-email Slice 9) ──────────────────────
  // silica's `savedBlocks` controlled prop: THIS is the source of truth (an
  // account-level, server-backed library shared tenant-wide) instead of silica's
  // browser-localStorage default. We render the server list and, on each author
  // action, optimistically write silica's `next` into the cache (instant palette
  // feedback) then fire the matching mutation — which refetches on settle, so a
  // save's temp id is replaced by the real server id and a failed write rolls back.
  const queryClient = useQueryClient();
  const savedBlocks = useSavedEmailBlocks();
  const createBlock = useCreateSavedEmailBlock();
  const renameBlock = useRenameSavedEmailBlock();
  const deleteBlock = useDeleteSavedEmailBlock();

  const onBlockError = useCallback(
    (error: unknown) => {
      toast.add({
        title: 'Could not update your saved blocks',
        description: emailErrorMessage(error, 'Nothing was changed. Try again.'),
        type: 'error',
      });
    },
    [toast]
  );

  const onSavedBlocksChange = useCallback(
    (next: SavedBlock[], change: SavedBlockChange) => {
      // Render silica's next list immediately so the palette updates without a
      // round-trip; the mutation's settle-refetch reconciles it with server truth.
      queryClient.setQueryData<SavedEmailBlock[]>(EMAIL_BLOCKS_KEY, next);
      switch (change.type) {
        case 'save':
          createBlock.mutate(
            { name: change.block.name, node: change.block.node },
            { onError: onBlockError }
          );
          break;
        case 'rename':
          renameBlock.mutate({ id: change.id, name: change.name }, { onError: onBlockError });
          break;
        case 'delete':
          deleteBlock.mutate(change.id, { onError: onBlockError });
          break;
      }
    },
    [queryClient, createBlock, renameBlock, deleteBlock, onBlockError]
  );

  // One-time migration off silica's browser-local library: the first time the
  // server list settles, adopt any blocks an author saved BEFORE the host owned the
  // library (they'd otherwise be orphaned the moment `savedBlocks` is supplied) —
  // upload each, then clear local so this never runs twice (a later mount reads an
  // empty local list). Guarded by a ref so React's double-invoke in dev is a no-op.
  const migratedLocalRef = useRef(false);
  useEffect(() => {
    if (migratedLocalRef.current || !savedBlocks.isSuccess) return;
    migratedLocalRef.current = true;
    const local = readLocalSavedBlocks();
    if (local.length === 0) return;
    void (async () => {
      for (const block of local) {
        try {
          await createBlock.mutateAsync({ name: block.name, node: block.node });
        } catch {
          // A single failed adoption shouldn't abandon the rest or re-orphan the
          // batch; skip it and keep going. The rest still migrate.
        }
      }
      clearLocalSavedBlocks();
      void queryClient.invalidateQueries({ queryKey: EMAIL_BLOCKS_KEY });
    })();
  }, [savedBlocks.isSuccess, createBlock, queryClient]);

  const createNew = useCallback(async () => {
    try {
      const email = await create.mutateAsync({ name: 'Untitled email' });
      setActiveId(email.id);
      // Land straight in rename: a fresh email's first job is a name.
      setNameDraft(email.name);
      setRenaming(true);
    } catch (error) {
      toast.add({
        title: 'Could not create an email',
        description: emailErrorMessage(error, 'Nothing was changed. Try again.'),
        type: 'error',
      });
    }
  }, [create, toast]);

  // Settle the active email once the catalog loads.
  useEffect(() => {
    if (!emails) return;
    if (paramId === 'new' && !openedNewRef.current) {
      openedNewRef.current = true;
      void createNew();
      return;
    }
    if (activeId && emails.some((e) => e.id === activeId)) return;
    const deep = paramId && paramId !== 'new' ? emails.find((e) => e.id === paramId) : undefined;
    setActiveId(deep?.id ?? emails[0]?.id ?? null);
  }, [emails, paramId, activeId, createNew]);

  // Keep the tab label in step with the active email.
  useEffect(() => {
    ctx.setTitle(active ? active.name : 'Emails');
  }, [ctx, active]);

  // Focus + select the name on entering rename mode (rather than autoFocus, which
  // trips a11y and can steal focus on mount).
  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  useDirtySource(dirty, 'This email has unsaved changes. Close it anyway?');

  const onChange = useCallback((project: EmailProject) => {
    const doc = project.templates[0]?.document;
    if (!doc) return;
    docRef.current = doc;
    setDirty(true);
  }, []);

  const onSave = useCallback(async () => {
    const doc = docRef.current;
    if (!doc || !activeId) return;
    try {
      await save.mutateAsync(doc);
      setDirty(false);
    } catch (error) {
      toast.add({
        title: 'Could not save',
        description: emailErrorMessage(error, 'Nothing was saved. Try again.'),
        type: 'error',
      });
    }
  }, [activeId, save, toast]);

  /** True if it's safe to leave the current email — clean, or the operator chose to
   *  discard. This is what stands in for the dashboard's silent autosave-on-switch:
   *  we never lose a burst without asking. */
  const confirmLeave = useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: 'Discard unsaved changes?',
      description: `“${active?.name ?? 'This email'}” has changes you haven't saved. Leaving loses them — save first if you want to keep them.`,
      confirmLabel: 'Discard and continue',
      cancelLabel: 'Keep editing',
      color: 'warning',
    });
  }, [active?.name, confirm, dirty]);

  const attemptSwitch = async (nextId: string) => {
    if (nextId === activeId) return;
    if (!(await confirmLeave())) return;
    setRenaming(false);
    setActiveId(nextId);
  };

  const onNewEmail = async () => {
    if (!(await confirmLeave())) return;
    await createNew();
  };

  // silica's own "Send test" — it hands back the HTML it projected, but we ignore
  // it and let the SERVER render: only the send path applies the real brand,
  // composes the wordmark/legal frame, and resolves real data. Save first so the
  // server renders the current draft, not the last-saved one.
  const onSendTest = useCallback(
    async ({ to }: { to: string }) => {
      await onSave();
      try {
        await sendTest.mutateAsync(to);
      } catch (error) {
        // Thrown so it surfaces inside silica's own send-test dialog.
        throw new Error(emailErrorMessage(error, 'Test send failed.'));
      }
      // SUCCESS NEEDS A WORD, and it had none: the dialog simply closed, which is the
      // same thing it does when you press Escape. The only honest read of a send that
      // says nothing is "nothing happened", so the next move is to press it again —
      // which is exactly what happened when this was tested, three times.
      //
      // It says QUEUED rather than sent, because that is what the server returned. The
      // send goes through Pub/Sub to email-worker and then to the provider, so delivery
      // is genuinely not known yet, and a mail that bounces after a cheerful "Sent!" is
      // a worse lie than a slightly duller truth. It also names the address back — the
      // dialog keeps whatever was typed last, so confirming WHERE it went is the part
      // that catches a stale value.
      toast.add({
        title: `Test email queued for ${to}`,
        description:
          'It sends the same way a real one does, so give it a minute. If it never lands, check the spam folder before assuming it failed.',
        type: 'success',
      });
    },
    [onSave, sendTest, toast]
  );

  const commitName = () => {
    setRenaming(false);
    const next = nameDraft.trim();
    if (!active || next === '' || next === active.name) return;
    ctx.setTitle(next);
    rename.mutate(next, {
      onError: (error) => {
        toast.add({
          title: 'Could not rename',
          description: emailErrorMessage(error, 'The name was left as it was.'),
          type: 'error',
        });
      },
    });
  };

  const onPreview = async () => {
    await onSave();
    try {
      const result = await preview.mutateAsync();
      setRendered(result);
      setPreviewOpen(true);
    } catch (error) {
      toast.add({
        title: 'Could not build a preview',
        description: emailErrorMessage(error, 'Try again in a moment.'),
        type: 'error',
      });
    }
  };

  const onPublish = async () => {
    if (!active) return;
    const ok = await confirm({
      title: `Publish “${active.name}”?`,
      description:
        'Publishing makes this exact design the one your customers receive from now on. Your current draft is saved and captured as the live version.',
      confirmLabel: 'Save and publish',
      cancelLabel: 'Keep editing',
      color: 'warning',
    });
    if (!ok) return;
    await onSave();
    publish.mutate(undefined, {
      onSuccess: () => {
        toast.add({
          title: `${active.name} published`,
          description: 'Recipients now get this version.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not publish',
          description: emailErrorMessage(error, 'Your draft is still saved. Try again.'),
          type: 'error',
        });
      },
    });
  };

  const onRestore = async (version: EmailVersion) => {
    if (!active || version.current) return;
    const when = new Date(version.createdAt).toLocaleString();
    const ok = await confirm({
      title: 'Restore this version?',
      description: `This replaces what's on the canvas with the version published ${when}. Your current draft is overwritten, but nothing goes live until you Publish — so you can review it first.`,
      confirmLabel: 'Restore to canvas',
      cancelLabel: 'Cancel',
      color: 'warning',
    });
    if (!ok) return;
    try {
      await restore.mutateAsync(version.id);
      // The server rewrote the draft; reseed the canvas from it and remount so the
      // restored content replaces what silica currently holds.
      seededForId.current = null;
      setRemountKey((k) => k + 1);
      setDirty(false);
      setHistoryOpen(false);
      toast.add({
        title: 'Version restored',
        description: 'Review it on the canvas, then Publish to make it live.',
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Could not restore',
        description: emailErrorMessage(error, 'Nothing was changed. Try again.'),
        type: 'error',
      });
    }
  };

  const onDelete = async () => {
    if (!active) return;
    const ok = await confirm({
      title: `Delete “${active.name}”?`,
      description:
        'This permanently removes the email and everything in it. This cannot be undone.',
      confirmLabel: 'Delete email',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    const removedId = active.id;
    remove.mutate(undefined, {
      onSuccess: () => {
        setDirty(false);
        // Move to another email rather than closing the studio — this is the whole
        // module, not one document's pane.
        const next = (emails ?? []).find((e) => e.id !== removedId);
        setActiveId(next?.id ?? null);
        toast.add({ title: `${active.name} deleted`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete',
          description: emailErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onCustomize = async () => {
    if (!active?.key || !activeSite?.propertyId) return;
    const key = active.key;
    try {
      const override = await customize.mutateAsync({ propertyId: activeSite.propertyId, key });
      setActiveId(override.id);
      toast.add({
        title: 'Made a version for this site',
        description: 'Changes here now apply to this site only.',
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: 'Could not customize for this site',
        description: emailErrorMessage(error, 'Nothing was changed.'),
        type: 'error',
      });
    }
  };

  // A failed load replaces the studio — never an empty canvas beside dead controls.
  if (isError) {
    return (
      <PaneLoadError
        title="Could not load your emails"
        description="This is a problem reaching the server, or the site builder is switched off for this account. Your emails are unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  // The catalog seeds defaults on first read, so an empty result is a genuine
  // "none exist" — offer the first one rather than a dead screen.
  if (!isPending && emails?.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={<Mail className="size-6" aria-hidden />}
          title="No emails yet"
          description="Create your first email — it opens straight into the editor."
          actions={
            <Button
              size="sm"
              color="module"
              loading={create.isPending}
              onClick={() => {
                void createNew();
              }}
            >
              <Plus className="size-4" aria-hidden />
              New email
            </Button>
          }
        />
      </div>
    );
  }

  const doc = docRef.current;
  // Also wait for the canvas colors to settle so the editor opens in the send's real
  // colors from first paint — never a flash of silica's neutral defaults that then
  // repaints. "Settled" is loaded-or-failed for BOTH the chrome (colors + frame) and
  // the fallback brand read, so an errored read falls straight through to the fallback
  // rather than hanging the studio.
  if (isPending || !emails || !active || !doc || !chromeSettled || !brandSettled) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const status = emailStatus(active);
  const isCustom = active.key === null;
  const multiSite = (sites?.length ?? 0) > 1;
  const canCustomize = multiSite && active.scope === 'tenant' && active.key !== null;
  const busy =
    save.isPending ||
    publish.isPending ||
    preview.isPending ||
    create.isPending ||
    remove.isPending ||
    customize.isPending ||
    restore.isPending;

  // ONE toolbar — the same move the site Editor makes (studio-surface.tsx). The
  // switcher, its lifecycle (rename/new/delete/customize), the status badge, and the
  // editor actions (merge tags/Preview/Publish/Save) are all HOST concerns silica
  // knows nothing about, so they ride in `toolbarSlot` — silica renders them in its
  // own editor header, right before its Send-test/Export buttons, instead of a
  // second bar stacked above the canvas. `flex-wrap` lets a narrow pane drop to a
  // second line rather than crush the switcher.
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {renaming ? (
        <Input
          ref={renameInputRef}
          color="module"
          size="sm"
          className="w-44 @lg:w-56"
          aria-label="Email name"
          value={nameDraft}
          onChange={(event) => {
            setNameDraft(event.target.value);
          }}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setNameDraft(active.name);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <NativeSelect
          color="module"
          size="sm"
          className="w-44 @lg:w-56"
          aria-label="Which email"
          value={active.id}
          disabled={busy}
          onChange={(event) => {
            void attemptSwitch(event.target.value);
          }}
        >
          {emails.map((email) => (
            <option key={email.id} value={email.id}>
              {/* WHICH ONE ACTUALLY SENDS. A `key` means sparx's automations reach this
                  row by name — `welcome-customer` IS the welcome mail a new customer
                  gets. Every other row called "Welcome" is a copy somebody made, and
                  the list gave them all the identical label.

                  That is not hypothetical: this tenant holds FOUR rows named "Welcome",
                  and the one at the top of this list is an unpublished draft of demo
                  salon copy. It was sent as a test, arrived saying "Welcome to Maren &
                  Wilde" to a WizeWorks account, and read exactly like a platform bug —
                  by the person who wrote this file. The real default was three rows
                  down, correct, and invisible.

                  A native <option> renders text and nothing else — no badge, no color —
                  so the marker has to BE text. It goes after the name so the names still
                  align and the list stays scannable. */}
              {email.name}
              {email.key ? ' — sent automatically' : ''}
            </option>
          ))}
        </NativeSelect>
      )}
      <Button
        size="sm"
        variant="ghost"
        color="neutral"
        shape="square"
        aria-label="Rename this email"
        title="Rename this email"
        disabled={busy || renaming}
        onClick={() => {
          setNameDraft(active.name);
          setRenaming(true);
        }}
      >
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        color="neutral"
        shape="square"
        aria-label="New email"
        title="New email"
        disabled={busy}
        onClick={() => {
          void onNewEmail();
        }}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
      {isCustom ? (
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          shape="square"
          aria-label="Delete this email"
          title="Delete this email"
          loading={remove.isPending}
          disabled={busy}
          onClick={() => {
            void onDelete();
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : null}

      <Badge color={status.tone} variant="soft" size="sm">
        {status.label}
      </Badge>
      {active.hasUnpublishedChanges ? (
        <Badge
          color="warning"
          variant="soft"
          size="sm"
          title="You've saved changes that aren't live yet — Publish to send them to recipients."
        >
          Unpublished changes
        </Badge>
      ) : null}
      {active.scope === 'site' ? (
        <Badge color="module" variant="soft" size="sm">
          This site only
        </Badge>
      ) : canCustomize ? (
        <Button
          size="sm"
          variant="outline"
          color="neutral"
          loading={customize.isPending}
          disabled={busy}
          title={`Make a version of this email just for ${sites?.find((s) => s.id === activeSite?.propertyId)?.name ?? 'this site'}`}
          onClick={() => {
            void onCustomize();
          }}
        >
          <SplitSquareHorizontal className="size-4" aria-hidden />
          <span className="hidden @lg:inline">Customize for this site</span>
        </Button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <MergeTagsMenu />
        <TrackingMenu
          emailId={active.id}
          emailName={active.name}
          campaign={active.trackingCampaign}
        />
        {active.published ? (
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            disabled={busy}
            title="Publish history"
            onClick={() => {
              setHistoryOpen(true);
            }}
          >
            <History className="size-4" aria-hidden />
            <span className="hidden @lg:inline">History</span>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          color="neutral"
          loading={preview.isPending}
          disabled={busy}
          onClick={() => {
            void onPreview();
          }}
        >
          <Eye className="size-4" aria-hidden />
          <span className="hidden @md:inline">Preview</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          color="neutral"
          loading={publish.isPending}
          disabled={busy}
          onClick={() => {
            void onPublish();
          }}
        >
          <Upload className="size-4" aria-hidden />
          <span className="hidden @md:inline">Publish</span>
        </Button>
        <Button
          size="sm"
          color="module"
          disabled={!dirty || busy}
          loading={save.isPending}
          onClick={() => {
            void onSave();
          }}
        >
          <Save className="size-4" aria-hidden />
          {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>
    </div>
  );

  // silica fills the pane — its editor header (carrying `toolbar`), Insert palette,
  // canvas, and Design inspector are the whole surface, exactly like the site
  // Editor's `<Builder>`. `key` remounts the engine when the switcher moves to
  // another email so it loads that document.
  return (
    // MediaPickerProvider makes the shared picture browser available to the host's
    // inspector panel (email-asset-panel) — uploads from here file under "Marketing".
    <MediaPickerProvider source="marketing">
      <div className="h-full">
        <EmailBuilder
          key={`${active.id}:${remountKey}`}
          document={doc}
          host={HOST}
          theme={canvasTheme}
          frame={chrome.data?.frame ?? undefined}
          onChange={onChange}
          onSendTest={onSendTest}
          persistKey={null}
          savedBlocks={(savedBlocks.data ?? []) as unknown as SavedBlock[]}
          onSavedBlocksChange={onSavedBlocksChange}
          toolbarSlot={toolbar}
        />

        {rendered ? (
          <PreviewDialog
            open={previewOpen}
            preview={rendered}
            onOpenChange={(next) => {
              setPreviewOpen(next);
            }}
          />
        ) : null}

        <HistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          versions={versions.data ?? null}
          loading={versions.isPending && versions.fetchStatus !== 'idle'}
          restoringId={restore.isPending ? (restore.variables ?? null) : null}
          onRestore={onRestore}
        />
      </div>
    </MediaPickerProvider>
  );
}

/** The merge-tag reference — the vocabulary of `{{tokens}}` an author can drop into
 *  copy, grouped by where each comes from, each copyable. Insertion itself is
 *  native: typing `{{` in any text block on the canvas autocompletes from the same
 *  set. This is the discoverable index of what's available. */
function MergeTagsMenu() {
  return (
    <PaneScope>
      <Popover>
        <PopoverTrigger>
          <Button size="sm" variant="outline" color="neutral">
            <Tags className="size-4" aria-hidden />
            <span className="hidden @md:inline">Merge tags</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex max-h-96 w-80 flex-col overflow-hidden p-0">
          <div className="border-base-300 border-b px-3 py-2">
            <Heading level={2} className="text-sm font-semibold">
              Personalize with merge tags
            </Heading>
            <Text className="text-sm">
              Type <code className="bg-base-200 rounded px-1 font-mono text-xs">{'{{'}</code> in any
              text to insert one, or copy a tag below.
            </Text>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {MERGE_GROUPS.map((group) => (
              <div key={group.source.key} className="px-3 py-2">
                <Text className="text-xs font-semibold">{group.source.label}</Text>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {group.tags.map((tag) => (
                    <MergeTagItem key={tag.token} tag={tag} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </PaneScope>
  );
}

function MergeTagItem({ tag }: { tag: MergeTag }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tag.token);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      toast.add({
        title: 'Could not copy',
        description: 'Select the tag and copy it manually.',
        type: 'error',
      });
    }
  };

  return (
    <li>
      <button
        type="button"
        className="hover:bg-base-200 flex w-full items-center gap-2 rounded px-2 py-1 text-left"
        onClick={() => {
          void copy();
        }}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <code className="font-mono text-sm break-all">{tag.token}</code>
          {tag.sample ? <span className="text-xs">e.g. {tag.sample}</span> : null}
        </span>
        {copied ? (
          <Check className="size-4 shrink-0" aria-hidden />
        ) : (
          <Copy className="size-4 shrink-0" aria-hidden />
        )}
      </button>
    </li>
  );
}

/** Link-tracking control (docs/impl transactional-email Slice 10). Every on-site link in
 *  an email is tracked automatically at send, so this popover is REASSURANCE + one lever:
 *  it explains, in plain language, that clicks show up in the owner's reports, and lets
 *  them name the campaign those clicks group under (the email's name by default). Saved
 *  immediately on blur/Enter, like a rename — not part of the doc Save. */
function TrackingMenu({
  emailId,
  emailName,
  campaign,
}: {
  emailId: string;
  emailName: string;
  campaign: string | null;
}) {
  const toast = useToast();
  const setCampaign = useSetEmailCampaign(emailId);
  const [draft, setDraft] = useState(campaign ?? '');

  // Re-seed when switching emails (the component stays mounted across the switcher).
  useEffect(() => {
    setDraft(campaign ?? '');
  }, [campaign, emailId]);

  const commit = () => {
    const next = draft.trim() === '' ? null : draft.trim();
    if (next === (campaign ?? null)) return;
    setCampaign.mutate(next, {
      onError: (error) => {
        setDraft(campaign ?? '');
        toast.add({
          title: 'Could not update tracking',
          description: emailErrorMessage(error, 'The campaign name was left as it was.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <PaneScope>
      <Popover>
        <PopoverTrigger>
          <Button size="sm" variant="outline" color="neutral">
            <MousePointerClick className="size-4" aria-hidden />
            <span className="hidden @md:inline">Tracking</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-80 flex-col gap-3 p-3">
          <div className="flex flex-col gap-1">
            <Heading level={2} className="text-sm font-semibold">
              Click tracking
            </Heading>
            <Text className="text-sm">
              Links in this email that go to your own site are tracked automatically, so clicks —
              and any sales that follow — show up in your reports. Links to other websites can’t be
              tracked.
            </Text>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Campaign name</span>
            <Input
              size="sm"
              color="module"
              value={draft}
              placeholder={emailName}
              aria-label="Campaign name"
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setDraft(campaign ?? '');
              }}
            />
            <Text className="text-xs">
              How these clicks appear in your reports. Leave blank to use the email’s name
              {emailName ? ` (“${emailName}”)` : ''}.
            </Text>
          </label>
        </PopoverContent>
      </Popover>
    </PaneScope>
  );
}

/** The severity → Badge color + label for the checklist summary. `pass` never shows a
 *  summary badge (the summary is the green "Ready" state itself). */
const CHECK_TONE: Record<EmailCheckLevel, 'success' | 'warning' | 'danger'> = {
  pass: 'success',
  warning: 'warning',
  error: 'danger',
};

/** One row of the pre-send checklist: a severity icon + the category and its plain-
 *  language finding. A green check for a pass, an amber/red triangle for a finding. */
function CheckRow({ check }: { check: EmailCheck }) {
  const tone =
    check.level === 'pass'
      ? 'text-success'
      : check.level === 'warning'
        ? 'text-warning'
        : 'text-danger';
  return (
    <li className="flex items-start gap-2">
      {check.level === 'pass' ? (
        <Check className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
      ) : (
        <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{check.title}</span>
        <span className="text-sm">{check.detail}</span>
      </span>
    </li>
  );
}

/** The pre-send checklist — a collapsible confidence panel above the preview. Auto-open
 *  when anything needs attention, collapsed to a single green line when the email is
 *  clean. The summary badge is the at-a-glance verdict; the list is the detail. */
function PreviewChecks({ checks }: { checks: EmailCheck[] }) {
  const errorCount = checks.filter((c) => c.level === 'error').length;
  const issueCount = checks.filter((c) => c.level !== 'pass').length;
  const [open, setOpen] = useState(issueCount > 0);

  const summaryTone: EmailCheckLevel = errorCount ? 'error' : issueCount ? 'warning' : 'pass';
  const summary = errorCount
    ? `${issueCount} thing${issueCount === 1 ? '' : 's'} to fix before sending`
    : issueCount
      ? `${issueCount} suggestion${issueCount === 1 ? '' : 's'}`
      : 'Ready to send — every check passed';
  const badgeLabel = errorCount ? 'Action needed' : issueCount ? 'Review' : 'Ready';

  return (
    <div className="border-base-300 rounded-md border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <Badge color={CHECK_TONE[summaryTone]} variant="soft" size="sm">
          {badgeLabel}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-medium">{summary}</span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="border-base-300 flex flex-col gap-2.5 border-t px-3 py-3">
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A two-option segmented toggle built from silica Buttons — the active option is a
 *  solid module button, the other a ghost. Used for the device + view switches. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="border-base-300 flex items-center gap-1 rounded-md border p-0.5">
      {options.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          color={opt.value === value ? 'module' : 'neutral'}
          variant={opt.value === value ? 'soft' : 'ghost'}
          onClick={() => {
            onChange(opt.value);
          }}
        >
          {opt.icon}
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

/** The iframe document for the visual preview at a chosen color scheme. The send's
 *  `@media (prefers-color-scheme: dark)` block is stripped first so the toggle is
 *  DETERMINISTIC regardless of the viewer's OS (an iframe can't be told to report a dark
 *  preference); then, for dark, the same rules are injected UNGATED so they apply
 *  unconditionally — showing the exact dark theme a dark-mode client would render. */
function previewSrcDoc(html: string, darkCss: string, scheme: 'light' | 'dark'): string {
  const light = html.replace(/@media \(prefers-color-scheme:dark\)\{[\s\S]*?\}\}/, '');
  if (scheme === 'light' || !darkCss) return light;
  const style = `<style>${darkCss}</style>`;
  return light.includes('</head>') ? light.replace('</head>', `${style}</head>`) : style + light;
}

/** The final, email-safe render of the draft — what a recipient actually receives,
 *  brand frame and all — PLUS the pre-send checklist. The visual view is an isolated
 *  iframe (so the email's own inline styles can't leak into, or be broken by, the app's)
 *  shown at a real desktop (600px) or mobile (375px) width, in light or (when the brand
 *  has one) its dark theme; the plain-text view shows the alternative body every client
 *  falls back to. A read-only view that holds no work, so a dialog is right: abandoning
 *  it loses nothing. */
function PreviewDialog({
  open,
  preview,
  onOpenChange,
}: {
  open: boolean;
  preview: EmailPreview;
  onOpenChange: (next: boolean) => void;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [view, setView] = useState<'visual' | 'text'>('visual');
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');
  const hasDark = preview.darkCss.trim() !== '';

  return (
    <PaneScope>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[calc(100%-2rem)] max-w-3xl flex-col gap-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Preview &amp; check</DialogTitle>
            <DialogClose>
              <Button size="sm" variant="ghost" color="neutral" shape="square" aria-label="Close">
                <X className="size-4" aria-hidden />
              </Button>
            </DialogClose>
          </div>

          <div className="flex flex-col gap-0.5">
            <Text className="text-xs">What lands in the inbox as</Text>
            <Text className="font-medium">
              {preview.subject.trim() === '' ? 'No subject line' : preview.subject}
            </Text>
          </div>

          <PreviewChecks checks={preview.checks} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'visual', label: 'Visual' },
                { value: 'text', label: 'Plain text' },
              ]}
            />
            {view === 'visual' ? (
              <div className="flex flex-wrap items-center gap-2">
                {hasDark ? (
                  <Segmented
                    value={scheme}
                    onChange={setScheme}
                    options={[
                      {
                        value: 'light',
                        label: 'Light',
                        icon: <Sun className="size-4" aria-hidden />,
                      },
                      {
                        value: 'dark',
                        label: 'Dark',
                        icon: <Moon className="size-4" aria-hidden />,
                      },
                    ]}
                  />
                ) : null}
                <Segmented
                  value={device}
                  onChange={setDevice}
                  options={[
                    {
                      value: 'desktop',
                      label: 'Desktop',
                      icon: <Monitor className="size-4" aria-hidden />,
                    },
                    {
                      value: 'mobile',
                      label: 'Mobile',
                      icon: <Smartphone className="size-4" aria-hidden />,
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>

          {view === 'visual' ? (
            <div className="bg-base-200 min-h-0 flex-1 overflow-auto rounded-md p-4">
              <div
                className={`mx-auto h-full max-w-full ${device === 'mobile' ? 'w-[375px]' : 'w-[600px]'}`}
              >
                <iframe
                  title="Email preview"
                  srcDoc={previewSrcDoc(preview.html, preview.darkCss, scheme)}
                  className="bg-base-100 h-full w-full rounded border-0"
                />
              </div>
            </div>
          ) : (
            <div className="bg-base-200 min-h-0 flex-1 overflow-auto rounded-md p-4">
              <pre className="bg-base-100 rounded-md p-4 font-mono text-sm break-words whitespace-pre-wrap">
                {preview.text.trim() === '' ? 'No plain-text body.' : preview.text}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

/** The publish history — every version this email was published as, newest first, each
 *  restorable to the canvas. Restore is non-destructive (it loads the version onto the
 *  DRAFT for review; nothing goes live until the author Publishes), so this is a pane-
 *  adjacent dialog: it holds no unsaved work of its own. */
function HistoryDialog({
  open,
  onOpenChange,
  versions,
  loading,
  restoringId,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  versions: EmailVersion[] | null;
  loading: boolean;
  restoringId: string | null;
  onRestore: (version: EmailVersion) => void;
}) {
  return (
    <PaneScope>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-lg flex-col gap-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <DialogTitle>Publish history</DialogTitle>
              <Text className="text-sm">
                Every version you’ve published. Restore one to bring it back to the canvas — nothing
                goes live until you Publish it again.
              </Text>
            </div>
            <DialogClose>
              <Button size="sm" variant="ghost" color="neutral" shape="square" aria-label="Close">
                <X className="size-4" aria-hidden />
              </Button>
            </DialogClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm" role="status">
                Loading…
              </p>
            ) : !versions || versions.length === 0 ? (
              <p className="p-4 text-sm">
                No published versions yet. Each time you publish, a version is saved here so you can
                roll back.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="border-base-300 flex items-center gap-3 rounded-md border px-3 py-2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{new Date(v.createdAt).toLocaleString()}</span>
                      {v.subject.trim() !== '' ? (
                        <span className="truncate text-sm">{v.subject}</span>
                      ) : null}
                    </span>
                    {v.current ? (
                      <Badge color="success" variant="soft" size="sm">
                        Live now
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        color="neutral"
                        loading={restoringId === v.id}
                        disabled={restoringId !== null}
                        onClick={() => {
                          onRestore(v);
                        }}
                      >
                        <RotateCcw className="size-4" aria-hidden />
                        Restore
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}
