'use client';

// The shell — the only chrome the workbench has.
//
// A top toolbar (identity, search, the person) and a thin module rail; nothing
// else. There is no breadcrumb and no sidebar tree, because in this app neither
// can be right: breadcrumbs describe where you are, and here you are in several
// places at once. Orientation comes from the panes themselves and their tabs.
// Every pixel the chrome doesn't take is a pixel the operator's actual work does.
//
// The shell also owns BOOT: the dock cannot mount until the active site is
// known, because layouts are per-site (an invoice pane from Site A must never
// be restored under Site B). The server reads the active-site cookie and hands
// it down as `initialSiteKey`, so a returning operator's dock mounts on the
// first paint with no token round trip; only a genuine first visit (no cookie)
// falls back to the token fetch + sites list, which canonicalize "no cookie
// yet" to the primary site so the layout key is stable ever after.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SidebarProvider } from '@wizeworks/silicaui-react';
import { mintWindowId, openBus } from '../lib/bus';
import { useWorkbenchTheme } from '../lib/use-theme';
import { useActiveSiteId, useSites } from '../lib/api/shell-data';
import { WorkbenchProvider } from '../lib/workbench/context';
import { BackNavigation } from '../lib/workbench/nav-history';
import { readDeepLink, tidyLegacyParams } from '../lib/workbench/deep-link';
import { loadNavState, saveNavState } from '../lib/workbench/persistence';
import { ConsoleDock } from '../lib/dock/console-dock';
import { readWindowMode, writeWindowMode, type WindowMode } from '../lib/window-mode';
import { DEFAULT_ZOOM, readZoom, writeZoom, type ZoomLevel } from '../lib/window-zoom';
import { useIsCompact } from '../lib/use-compact';
import { ChromeBoundary } from './chrome-boundary';
import { MobileShell } from './mobile-shell';
import { Rail } from './rail';
import { StatusBar } from './status-bar';
import { Toolbar } from './toolbar';
import { BillingBanner } from './billing/billing-banner';
import { Launcher } from './launcher';
import { ModulePanel } from './module-panel';
import { RecentsRecorder } from './recents-recorder';
import { SkipToWorkspace, WORKSPACE_ID } from './skip-to-workspace';
import { UpdateNotifier } from './update-notifier';
import { FeedbackProvider } from './feedback/provider';
import { DeepLinkArrival } from './deep-link-arrival';
import { ConsentAsk } from './consent-ask';
import { PaneWaiting } from './pane-waiting';
import { FirstRunTour } from '../lib/tour/first-run-tour';
import { ModuleTourOffers } from '../lib/tour/module-tour-offers';
import type { WorkbenchModule } from './module-scope';
import { useOnboarding } from '../lib/onboarding/api';
import { isOnboardingFinished } from '../lib/onboarding/entry';
import { OnboardingGate } from '../surfaces/onboarding/onboarding-gate';
// Registers every surface. Must be imported before the dock mounts, since a
// restored layout resolves surface keys synchronously while deserializing.
import '../lib/surfaces/catalog';

export function WorkbenchShell({
  userName,
  userEmail,
  initialSiteKey,
  initialCompact,
  arrivalAddress,
}: {
  userName: string;
  userEmail: string;
  /** The active site read from the cookie server-side — the boot key when set,
   *  so the dock mounts without waiting on the token fetch. Null on a first
   *  visit (no cookie), where boot falls back to the token + sites resolution. */
  initialSiteKey: string | null;
  /** The server's read of whether this is a stack-shaped device, so the first
   *  paint is already the right presentation. See lib/compact.ts. */
  initialCompact: boolean;
  /** The address the SERVER matched for this render — the one authority on what
   *  this page load is asking for. See app/workbench-entry.tsx. */
  arrivalAddress: string;
}) {
  // Minted once per window. A popout gets its own id from the popout bootstrap.
  const windowIdRef = useRef<string | null>(null);
  windowIdRef.current ??= mintWindowId();
  const windowId = windowIdRef.current;

  // Light, dark, or the machine's own preference — owned end to end by the
  // hook, in every window. See lib/use-theme.ts for why the resolved theme is
  // read back off the document rather than mirrored in state here.
  const { choice: themeChoice, theme, setChoice: setThemeChoice } = useWorkbenchTheme();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [browsing, setBrowsing] = useState<WorkbenchModule | null>(null);
  // The module the panel RENDERS, which lags `browsing` by design: on close it
  // keeps the last one so the panel still has contents while its width
  // animates shut. Without it the panel blanks the instant you dismiss it and
  // the close reads as a glitch rather than a movement.
  const [panelModule, setPanelModule] = useState<WorkbenchModule>('platform');
  const [pinned, setPinned] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  /**
   * Windows or tabs — NULL until the stored preference has been read.
   *
   * The null state is load-bearing, not defensive. Defaulting to 'tabs' for the
   * one render before localStorage is read would tile a returning windows user's
   * restored floating layout and then re-float it — and the tiled intermediate
   * gets saved over their real arrangement on the way past. A presentation
   * nobody has chosen yet is not 'tabs'; it is unknown.
   */
  const [windowMode, setWindowMode] = useState<WindowMode | null>(null);
  // Unlike the presentation, an unknown zoom is safe to guess at: 100% is what
  // an unzoomed workspace looks like either way.
  const [zoom, setZoom] = useState<ZoomLevel>(DEFAULT_ZOOM);

  // Both in ONE effect, and that matters: the dock is gated on the presentation
  // being known and treats the first zoom it is handed as the one its restored
  // layout was already saved at. Resolving the zoom a render later looks like
  // somebody just zoomed, and every window is scaled a second time. React
  // batches these into one commit. Do not split them.
  useEffect(() => {
    setWindowMode(readWindowMode() ?? 'tabs');
    setZoom(readZoom());
  }, []);

  // The shell owns the CHOICE and nothing else. Acting on it — photographing the
  // arrangement being left, restoring the one returned to — needs the dockview
  // api, the controller and the site key, so it lives in lib/dock/console-dock.tsx
  // and reacts to this prop.
  const onChangeWindowMode = useCallback((next: WindowMode) => {
    setWindowMode(next);
    writeWindowMode(next);
  }, []);

  const onChangeZoom = useCallback((next: ZoomLevel) => {
    setZoom(next);
    writeZoom(next);
  }, []);
  const isCompact = useIsCompact(initialCompact);

  // Capture the address this page load arrived with, HERE, in the outermost
  // render — before anything downstream can rewrite it. The history bridge
  // starts replacing the bar with the focused pane's address as soon as the
  // layout restores, so a link read any later than this is a link already
  // overwritten. The address comes from the SERVER rather than `window.location`
  // (see app/workbench-entry.tsx): a client-side arrival from /sign-in renders
  // this before the bar catches up, and reading the bar there captured the
  // sign-in page itself as the link. The read is PURE and idempotent, and no-ops
  // on the server; the one thing it used to mutate (the legacy `?open=` in the
  // bar) is tidied from the effect below instead, because a render must not
  // rewrite history.
  readDeepLink(arrivalAddress);

  useEffect(() => {
    tidyLegacyParams();
  }, []);

  // ── Boot: resolve the site the whole window operates under ───────────────
  const { data: tokenState } = useActiveSiteId();
  const { data: sites, isError: sitesFailed } = useSites();

  // ── First-run gate: has this tenant finished setup? ──────────────────────
  // Onboarding is tenant-level, not site-level, so this resolves independently
  // of the site key above and gates the entire shell (see the branch below).
  const { data: onboarding, isError: onboardingError } = useOnboarding();

  // The cookie names a site, or nothing. Nothing means api-rest scopes to the
  // primary property, so the primary's id IS the honest key for that state —
  // using it keeps the layout in one slot whether or not the cookie exists yet.
  const siteKey = useMemo(() => {
    // The cookie names a site, and the server already read it (initialSiteKey);
    // /api/token forwards the IDENTICAL cookie as propertyId, so the two are
    // equal whenever both are present — trusting the server value first means
    // the boot key is known on the first render for every returning operator,
    // with nothing to flip once the token fetch confirms it.
    const cookieSite = tokenState?.propertyId ?? initialSiteKey;
    if (cookieSite) return cookieSite;
    // No cookie anywhere: api-rest scopes to the primary property, so the
    // primary's id is the honest, stable key — but resolving it needs the list.
    if (tokenState === undefined) return null; // still booting, and no cookie hint
    if (sites) return sites.find((site) => site.isPrimary)?.id ?? sites[0]?.id ?? 'default';
    return sitesFailed ? 'default' : null; // sites still loading (or unreachable)
  }, [tokenState, sites, sitesFailed, initialSiteKey]);

  // The site a feedback submission is about. Resolved here rather than inside
  // the feedback provider so it rides the same sites query the toolbar already
  // holds, instead of a second fetch for one name.
  const activeSite = useMemo(() => {
    const site = siteKey ? sites?.find((candidate) => candidate.id === siteKey) : undefined;
    return site ? { id: site.id, name: site.name } : null;
  }, [sites, siteKey]);

  // The slug every address is stamped with. Slug rather than id because a link
  // is written to be read — `?site=savory-donuts` says which business this is
  // about, and a uuid says nothing. The matcher accepts either, so a renamed
  // slug degrades to an unreachable-site message rather than to silence.
  const siteSlug = useMemo(() => {
    if (!siteKey) return undefined;
    return sites?.find((candidate) => candidate.id === siteKey)?.slug;
  }, [sites, siteKey]);

  // Restore nav state after mount, not during render — localStorage isn't
  // available on the server and reading it in render would break hydration.
  useEffect(() => {
    const state = loadNavState();
    setPinned(state.pinned);
    setRailExpanded(state.railExpanded);
    // Only reopen the panel automatically if it was pinned. An unpinned panel is
    // transient by definition; restoring one would greet the operator with an
    // overlay they have to dismiss before they can work.
    if (state.pinned && state.module) setBrowsing(state.module as WorkbenchModule);
  }, []);

  useEffect(() => {
    saveNavState({ module: browsing, pinned, railExpanded });
  }, [browsing, pinned, railExpanded]);

  useEffect(() => {
    if (browsing) setPanelModule(browsing);
  }, [browsing]);

  useEffect(() => {
    // Presence only. Appearance travels on this same channel but is handled by
    // useWorkbenchTheme, which opens its own subscription — every window needs
    // it, including the popouts that never mount this shell.
    const bus = openBus(() => undefined);
    bus.post({ type: 'window.hello', id: windowId, role: 'main' });

    const onUnload = () => {
      bus.post({ type: 'window.bye', id: windowId });
    };
    window.addEventListener('pagehide', onUnload);

    return () => {
      window.removeEventListener('pagehide', onUnload);
      bus.close();
    };
  }, [windowId]);

  // Note: ⌘K/Ctrl+K is bound by <CommandPalette> itself (its `hotkey` prop
  // defaults on). Binding it here too would toggle twice per press and the
  // palette would never open.

  const openLauncher = useCallback(() => {
    setLauncherOpen(true);
  }, []);

  // ── First-run gate ────────────────────────────────────────────────────────
  // Until the tenant finishes setup, onboarding owns the WHOLE viewport — there is
  // no dock, rail, or toolbar yet, because there is nothing to arrange until there
  // is a business to arrange. This sits above the compact/desktop split on purpose:
  // the gate is one full-screen flow on every device, and it falls through the
  // instant `finishedAt` lands (the flow invalidates the onboarding query, this
  // re-reads it, and the shell below takes over with no reload). While the state is
  // still loading we hold a neutral screen rather than flash the shell then yank it
  // away from a tenant who has not onboarded. On ERROR we fail OPEN — a hiccup on
  // this one endpoint must never brick the workbench for a tenant who has long
  // since finished; the gate only shows on a state we actually read.
  if (onboarding === undefined && !onboardingError) {
    return <div className="bg-base-300 h-dvh w-full" aria-busy />;
  }
  if (onboarding && !isOnboardingFinished(onboarding)) {
    // No WorkbenchProvider: the gate is not a pane and touches no controller,
    // dock, or per-site layout — it runs on react-query + the root toast/confirm
    // providers alone, so setup never spins up machinery it doesn't use.
    return <OnboardingGate />;
  }

  // Below 64rem the dock is not cramped, it is pointless — so the whole
  // presentation swaps rather than the layout shrinking. Everything below this
  // line is shared: same controller, same registry, same surfaces. Only the
  // PaneHost differs, which is the entire reason full mobile parity was
  // affordable at all. See lib/workbench/pane-host.ts.
  if (isCompact) {
    return (
      <WorkbenchProvider windowId={windowId} role="main">
        <FeedbackProvider theme={theme} activeSite={activeSite}>
          <MobileShell
            userName={userName}
            userEmail={userEmail}
            themeChoice={themeChoice}
            siteKey={siteKey}
            navOpen={navOpen}
            onNavOpenChange={setNavOpen}
            onSetTheme={setThemeChoice}
            onOpenLauncher={openLauncher}
          />
          <ChromeBoundary region="launcher" whatStopped="Search has stopped working." silent>
            <Launcher open={launcherOpen} onOpenChange={setLauncherOpen} />
          </ChromeBoundary>
          {/* Teaches the browser Back button to walk the compact shell's own
              navigation — the nav drawer and launcher close first, then focus
              steps back through the stack — instead of leaving the app. */}
          <BackNavigation
            launcher={launcherOpen}
            module={null}
            nav={navOpen}
            siteSlug={siteSlug}
            onApply={(overlays) => {
              setLauncherOpen(overlays.launcher);
              setNavOpen(overlays.nav);
            }}
          />
          {/* Opens whatever the address bar asked for, once the stack is up and
              the site + module gates have answered. Identical on both shells —
              a link has to work the same on a phone. */}
          <DeepLinkArrival siteKey={siteKey} />
          {/* Inside the provider: the notifier asks the controller what would be
              lost before it offers to reload. */}
          <UpdateNotifier />
          {/* Listens for controller visits and records them to /v1/me/recents. */}
          <RecentsRecorder />
          {/* Renders nothing unless there is NO analytics decision on file — see
              components/consent-ask. On both shells, because the question is
              about the person, not the device. */}
          <ConsentAsk />
        </FeedbackProvider>
      </WorkbenchProvider>
    );
  }

  return (
    <WorkbenchProvider windowId={windowId} role="main">
      <FeedbackProvider theme={theme} activeSite={activeSite}>
        <div className="bg-base-300 flex h-dvh w-full flex-col overflow-hidden">
          <SkipToWorkspace />

          {/* The chrome renders IMMEDIATELY, even before the site key resolves —
            a present toolbar that fills in its workspace name a beat later reads
            as loading; an absent one reads as broken. The switcher self-hides
            until `sites` lands, and the workspace name holds a space until the
            tenant query returns, so nothing here jumps. `default` matches the
            rail's own boot fallback below; on the rare no-cookie first visit the
            real key lands before anything is switchable. */}
          {/* Every chrome region is crash-isolated from the panes and from each
              other. The panes hold the unsaved work; nothing up here is allowed
              to take that down. See components/chrome-boundary.tsx. */}
          <ChromeBoundary
            region="toolbar"
            whatStopped="Search and your account menu have stopped working."
          >
            <Toolbar
              userName={userName}
              userEmail={userEmail}
              themeChoice={themeChoice}
              siteKey={siteKey ?? 'default'}
              onSetTheme={setThemeChoice}
              onOpenLauncher={openLauncher}
              windowMode={windowMode}
              onChangeWindowMode={onChangeWindowMode}
            />
          </ChromeBoundary>

          {/* Billing lifecycle banner (docs/17 §6) — spans the full width beneath the
              toolbar so it shows on every surface. Self-hides for a paid/exempt
              tenant; escalates trial → grace → suspended otherwise. */}
          <ChromeBoundary
            region="billing-banner"
            whatStopped="Notices about your plan and payments have stopped showing."
          >
            <BillingBanner />
          </ChromeBoundary>

          <div className="relative flex min-h-0 flex-1">
            <SidebarProvider
              collapsed={!railExpanded}
              onCollapsedChange={(collapsed) => {
                setRailExpanded(!collapsed);
              }}
            >
              {/* `relative` anchors the rail's own absolutely-positioned bits
                  (active indicator, tooltips) — but NO positive z-index: a raw
                  `z-10` here (vestigial from when the module panel was an
                  overlay) lifts the rail above body-portaled popovers, so the
                  site switcher's dropdown paints BEHIND it. The panel and dock
                  are static and sit below the rail regardless; the dropdown,
                  portaled later in the DOM at the same stacking level, wins. */}
              <div data-tour="module-rail" className={`bg-base-200 relative flex rounded-r-lg p-1`}>
                {/* `compact`: collapsed, the rail is a 48px column with no room
                    for a sentence, so the fallback is the icon and a tooltip. */}
                <ChromeBoundary
                  region="module-rail"
                  whatStopped="The menu down the side has stopped working."
                  compact
                >
                  <Rail
                    browsing={browsing}
                    siteKey={siteKey ?? 'default'}
                    expanded={railExpanded}
                    onBrowse={(module) => {
                      // Clicking the module you're already browsing closes the
                      // panel — the same toggle every icon rail teaches.
                      setBrowsing((current) => (current === module ? null : module));
                    }}
                  />
                </ChromeBoundary>
              </div>
            </SidebarProvider>

            {/* The module panel sits in NORMAL FLOW, so opening it pushes the
              panes right exactly as expanding the rail does — it never covers
              the work. (No overlay means no stacking context and no shadow:
              sparx separates surfaces with real edges and color, never a
              drop shadow.)

              This wrapper owns the open/close animation, not the panel: it
              clips to a width that transitions 0 ⇄ 16rem on the same 200ms
              ease the silica Sidebar uses, so the panel appears to grow out of
              the rail's edge instead of snapping the whole layout sideways.
              The panel therefore stays MOUNTED while closed (a width of zero,
              fully clipped), which is what makes the close animate too — and
              why it must be `inert` when shut, or its links would still be
              reachable by keyboard from inside a zero-width box. */}
            <div
              inert={browsing === null}
              aria-hidden={browsing === null}
              className={`bg-base-200 shrink-0 overflow-hidden rounded-r-xl transition-[width] duration-200 ease-in-out motion-reduce:transition-none ${
                browsing ? 'w-64' : 'w-0'
              }`}
            >
              <ChromeBoundary
                region="module-panel"
                whatStopped="This section's menu has stopped working."
              >
                <ModulePanel
                  // Holds the LAST browsed module so the panel keeps its
                  // contents while animating shut rather than blanking.
                  module={panelModule}
                  pinned={pinned}
                  onTogglePin={() => {
                    setPinned((value) => !value);
                  }}
                  onDismiss={() => {
                    setBrowsing(null);
                  }}
                />
              </ChromeBoundary>
            </div>

            <main
              id={WORKSPACE_ID}
              // `-1` so it can be focused by the skip control without joining
              // the tab order itself, which would put a stop in front of every
              // pane for no gain.
              tabIndex={-1}
              data-tour="dock"
              className="min-w-0 flex-1 p-1 focus:outline-none"
            >
              {/* The dock waits for the site key — restoring Site A's layout and
                then discovering we're on Site B would strand entity panes. With
                the cookie handed down at SSR this is resolved on the first paint
                for returning operators; only a genuine first visit lands here,
                and it gets a spinner rather than an empty void so the shell
                still reads as loading its work, not as broken chrome. */}
              {siteKey && windowMode ? (
                <ConsoleDock
                  siteKey={siteKey}
                  mode={windowMode}
                  zoom={zoom}
                  onChangeZoom={onChangeZoom}
                />
              ) : (
                <PaneWaiting label="Loading your workspace" />
              )}
            </main>
            {/* The launcher is an overlay, so a crash in it renders NOTHING
                rather than a strip — a warning bar floating over the dock with
                no way to dismiss it would be worse than the missing palette,
                which ⌘K simply stops opening. */}
            <ChromeBoundary region="launcher" whatStopped="Search has stopped working." silent>
              <Launcher open={launcherOpen} onOpenChange={setLauncherOpen} />
            </ChromeBoundary>
          </div>

          {/* The live signal strip — connection, activity, unsaved work, and the
            business pulse. Signals only; identity stays in the toolbar. */}
          <ChromeBoundary region="status-bar" whatStopped="Live updates have stopped showing.">
            <StatusBar />
          </ChromeBoundary>

          {/* First-run feature walkthrough — auto-starts once after onboarding is
              finished, and replays on demand from the account menu. Desktop only;
              the compact shell gets its own trimmed set later (docs/132). */}
          <FirstRunTour enabled={isOnboardingFinished(onboarding)} />

          {/* Tier-2: the opt-in deep tour for each module, offered the first time
              an owner lands in that tool and replayable from the module panel.
              Desktop only, like the welcome tour above — the compact shell gets
              its own set later (docs/132 §8). */}
          <ModuleTourOffers enabled={isOnboardingFinished(onboarding)} theme={theme} />

          {/* Teaches the browser Back button to walk the workbench's own
            navigation — an open launcher or module panel closes first, then
            focus steps back through the panes you were looking at — instead of
            walking straight out of the app. */}
          <BackNavigation
            launcher={launcherOpen}
            module={browsing}
            nav={false}
            siteSlug={siteSlug}
            onApply={(overlays) => {
              setLauncherOpen(overlays.launcher);
              setBrowsing((overlays.module as WorkbenchModule | null) ?? null);
            }}
          />

          {/* Opens whatever the address bar asked for, once the dock is up and
            the site + module gates have answered. See components/deep-link-arrival. */}
          <DeepLinkArrival siteKey={siteKey} />

          {/* Inside the provider: the notifier asks the controller what would be
            lost before it offers to reload. */}
          <UpdateNotifier />
          {/* Listens for controller visits and records them to /v1/me/recents. */}
          <RecentsRecorder />
          {/* Renders nothing unless there is NO analytics decision on file. */}
          <ConsentAsk />
        </div>
      </FeedbackProvider>
    </WorkbenchProvider>
  );
}
