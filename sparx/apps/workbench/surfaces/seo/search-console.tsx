'use client';

// Search Console — connect the free tool Google gives you, so the numbers on the
// Search performance screen come from Google itself rather than an estimate.
//
// This is a small state machine, shown in plain language:
//
//   not available → (platform has no Google credentials — nothing to do)
//   not connected → Authorize with Google → pick which site → connected
//   connected     → sync now / disconnect
//   something wrong → the exact problem + reconnect
//
// The authorize step is a Google consent screen. We open it in a small popup so
// the workbench and everything you had arranged stays exactly where it was;
// Google returns to a page on this app that hands the code back to this pane
// (see app/seo/search-console/callback), which then trades it for a stored
// connection. Nothing here leaves the browser data layer.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, LineChart, Link2, Plug, RefreshCw, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { surfaceTitle, type SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  seoErrorMessage,
  useConnectUrl,
  useDisconnectSearchConsole,
  useExchangeCode,
  useSearchConsoleSites,
  useSearchConsoleStatus,
  useSelectSite,
  useSyncSearchConsole,
  type GscSite,
} from './data';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

/** The shape the callback page posts back through `window.opener`. */
interface CallbackMessage {
  source: 'sparx-gsc';
  code?: string;
  state?: string;
  error?: string;
}

function isCallbackMessage(data: unknown): data is CallbackMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === 'sparx-gsc'
  );
}

function statusBadge(status: string): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'info';
} {
  if (status === 'connected') return { label: 'Connected', tone: 'success' };
  if (status === 'needs_site') return { label: 'Almost there', tone: 'warning' };
  if (status === 'error') return { label: 'Needs attention', tone: 'error' };
  return { label: 'Not connected', tone: 'info' };
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ── Site picker (needs_site) ────────────────────────────────────────────── */

function SitePicker({
  sites,
  pendingSite,
  onPick,
}: {
  sites: GscSite[];
  pendingSite: string | null;
  onPick: (siteUrl: string) => void;
}) {
  if (sites.length === 0) {
    return (
      <Alert color="warning">
        <AlertContent>
          <AlertTitle>No verified sites on that Google account</AlertTitle>
          <AlertDescription>
            The Google account you signed in with has not verified any sites in Search Console.
            Verify your site with Google first, then connect it here.
          </AlertDescription>
        </AlertContent>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Text className="text-sm">
        Choose which of your verified sites the numbers should come from.
      </Text>
      <ul className="flex flex-col gap-2">
        {sites.map((site) => (
          <li key={site.siteUrl}>
            <Button
              variant="outline"
              color="neutral"
              className="w-full justify-between"
              loading={pendingSite === site.siteUrl}
              disabled={pendingSite !== null}
              onClick={() => {
                onPick(site.siteUrl);
              }}
            >
              <span className="truncate font-mono text-sm">{site.siteUrl}</span>
              <Link2 className="size-4 shrink-0" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── The surface ─────────────────────────────────────────────────────────── */

function SearchConsole({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const status = useSearchConsoleStatus();

  const connectUrl = useConnectUrl();
  const exchange = useExchangeCode();
  const loadSites = useSearchConsoleSites();
  const selectSite = useSelectSite();
  const sync = useSyncSearchConsole();
  const disconnect = useDisconnectSearchConsole();

  const [sites, setSites] = useState<GscSite[] | null>(null);
  const [pendingSite, setPendingSite] = useState<string | null>(null);
  const [connectFailure, setConnectFailure] = useState<string | null>(null);

  // The other screen's name in THIS console's words. Read from the registry rather
  // than typed, because the brand renames it there ("How people find you") and a
  // sentence pointing at a name nobody sees is worse than no pointer at all.
  const performanceTitle = surfaceTitle('seo.performance') ?? 'Search performance';

  const connection = status.data?.connection ?? null;
  const configured = status.data?.configured ?? false;
  const state = connection?.status ?? 'disconnected';

  const runExchange = useCallback(
    (code: string, oauthState: string) => {
      exchange.mutate(
        { code, state: oauthState },
        {
          onSuccess: (result) => {
            if (result.connection?.status === 'connected') {
              setSites(null);
              toast.add({ title: 'Connected to Search Console', type: 'success' });
            } else {
              // Several verified sites — let them pick which one.
              setSites(result.sites);
              toast.add({
                title: 'Choose which site to use',
                description: 'Your Google account has more than one verified site.',
                type: 'info',
              });
            }
          },
          onError: (error) => {
            setConnectFailure(
              seoErrorMessage(error, 'Could not finish connecting. Nothing was changed.')
            );
          },
        }
      );
    },
    [exchange, toast]
  );

  // Keep a live handle to the exchange runner so the message listener — which is
  // registered once — always calls the current one without re-binding on every
  // render (which would drop an in-flight Google popup's message).
  const exchangeRef = useRef(runExchange);
  exchangeRef.current = runExchange;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isCallbackMessage(event.data)) return;
      if (event.data.error) {
        setConnectFailure(
          event.data.error === 'access_denied'
            ? 'You cancelled the Google sign-in, so nothing was connected.'
            : `Google reported a problem: ${event.data.error}`
        );
        return;
      }
      if (event.data.code && event.data.state) {
        exchangeRef.current(event.data.code, event.data.state);
      }
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const connect = () => {
    setConnectFailure(null);
    // Open the popup synchronously in the click handler so the browser does not
    // treat it as an unsolicited pop-up; point it at Google once the URL resolves.
    const popup = window.open('', 'sparx-gsc-connect', 'width=560,height=680');
    const redirectUri = `${window.location.origin}/seo/search-console/callback`;
    connectUrl.mutate(redirectUri, {
      onSuccess: ({ url }) => {
        if (popup) popup.location.href = url;
        else window.location.href = url;
      },
      onError: (error) => {
        popup?.close();
        setConnectFailure(
          seoErrorMessage(error, 'Could not start the connection. Try again shortly.')
        );
      },
    });
  };

  const choosePickList = () => {
    loadSites.mutate(undefined, {
      onSuccess: (result) => {
        setSites(result.sites);
      },
      onError: (error) => {
        toast.add({
          title: 'Could not load your sites',
          description: seoErrorMessage(error, 'Try again shortly.'),
          type: 'error',
        });
      },
    });
  };

  const pick = (siteUrl: string) => {
    setPendingSite(siteUrl);
    selectSite.mutate(siteUrl, {
      onSettled: () => {
        setPendingSite(null);
      },
      onSuccess: () => {
        setSites(null);
        toast.add({ title: 'Connected to Search Console', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not connect that site',
          description: seoErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const runSync = () => {
    sync.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title: 'Latest numbers pulled in',
          description: `${result.sync.days} ${result.sync.days === 1 ? 'day' : 'days'} · ${result.sync.queries} ${result.sync.queries === 1 ? 'search term' : 'search terms'} updated.`,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not refresh the numbers',
          description: seoErrorMessage(error, 'Try again shortly.'),
          type: 'error',
        });
      },
    });
  };

  const onDisconnect = async () => {
    const ok = await confirm({
      title: 'Disconnect Search Console?',
      description:
        'We will stop pulling in search numbers from Google for this site. The figures already collected are kept, and you can connect again any time.',
      confirmLabel: 'Disconnect',
      cancelLabel: 'Keep it connected',
      color: 'danger',
    });
    if (!ok) return;
    disconnect.mutate(undefined, {
      onSuccess: () => {
        setSites(null);
        toast.add({ title: 'Search Console disconnected', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not disconnect',
          description: seoErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const badge = statusBadge(state);
  const showPicker = state === 'needs_site' || sites !== null;
  const connecting = connectUrl.isPending || exchange.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Search Console actions"
        controls={
          <>
            {status.data ? (
              <Badge color={configured ? badge.tone : 'info'} variant="soft" size="sm">
                {configured ? badge.label : 'Not available'}
              </Badge>
            ) : null}
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              shape="square"
              aria-label="Check the connection again"
              title="Check the connection again"
              loading={status.isFetching}
              onClick={() => {
                void status.refetch();
              }}
            >
              <RefreshCw className="size-4" aria-hidden />
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status.isPending ? (
          <p className="p-4 text-sm" role="status">
            Checking the connection…
          </p>
        ) : status.isError ? (
          <div className="flex h-full items-center justify-center p-8">
            <Alert color="error" className="max-w-md">
              <AlertContent>
                <AlertTitle>Could not check the connection</AlertTitle>
                <AlertDescription>
                  This is a problem reaching the server. Any existing connection is unaffected.
                </AlertDescription>
              </AlertContent>
            </Alert>
          </div>
        ) : (
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Search Console
              </Heading>
              <Text>
                Search Console is a free tool from Google. Connecting it lets us show you the real
                numbers Google records — how many people saw your site in search results, and how
                many clicked through — instead of an estimate.
              </Text>
            </div>

            {!configured ? (
              /* "Your account" was doing real damage here. Whether this connection
                 works is a PLATFORM setting — an OAuth client on the server — and
                 has nothing to do with the tenant, the plan or anything a person
                 can reach. The old sentence read "not switched on for your account
                 yet", which sends a shop owner to check her settings, then her
                 plan, then support, for a thing none of them control. Say whose
                 side it is on, say there is nothing to do, and hand her the screen
                 that does work today. */
              <>
                <Alert color="info">
                  <AlertContent>
                    <AlertTitle>Not ready here yet</AlertTitle>
                    <AlertDescription>
                      This one is on our side, not yours. Nothing in your account, your plan or your
                      settings is holding it up, and there is nothing for you to switch on or ask
                      for. When it is ready, you will be able to link Google from this screen.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
                <FormSection
                  title="What you can see today"
                  description={`Google's own figures are the only part missing. Everything measured here — how each page scores, and what is worth fixing — is on ${performanceTitle}, and it is up to date.`}
                >
                  <div>
                    <Button
                      size="sm"
                      color="module"
                      onClick={(event) => {
                        ctx.open(
                          'seo.performance',
                          {},
                          { target: event.altKey ? 'window' : event.shiftKey ? 'beside' : 'tab' }
                        );
                      }}
                    >
                      <LineChart className="size-4" aria-hidden />
                      Open {performanceTitle}
                    </Button>
                  </div>
                </FormSection>
              </>
            ) : state === 'connected' ? (
              <FormSection title="Connected">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color="success" variant="soft" size="sm">
                    <Check className="size-3.5" aria-hidden />
                    Connected
                  </Badge>
                  {connection?.siteUrl ? (
                    <Text className="min-w-0 font-mono text-sm break-all">
                      {connection.siteUrl}
                    </Text>
                  ) : null}
                </div>
                <Text className="text-sm">
                  Google updates these figures with a day or two&apos;s delay, and we pull them in
                  automatically each night. Last pulled in:{' '}
                  {formatWhen(connection?.lastSyncAt ?? null)}.
                </Text>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    color="module"
                    variant="outline"
                    loading={sync.isPending}
                    onClick={runSync}
                  >
                    <RefreshCw className="size-4" aria-hidden />
                    Pull in the latest now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="danger"
                    loading={disconnect.isPending}
                    onClick={() => {
                      void onDisconnect();
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Disconnect
                  </Button>
                </div>
              </FormSection>
            ) : showPicker ? (
              <FormSection title="Choose your site">
                {sites !== null ? (
                  <SitePicker sites={sites} pendingSite={pendingSite} onPick={pick} />
                ) : (
                  <>
                    <Text className="text-sm">
                      You are signed in with Google. Pick which of your verified sites the numbers
                      should come from.
                    </Text>
                    <Button
                      size="sm"
                      color="module"
                      className="self-start"
                      loading={loadSites.isPending}
                      onClick={choosePickList}
                    >
                      <Link2 className="size-4" aria-hidden />
                      Choose a site
                    </Button>
                  </>
                )}
              </FormSection>
            ) : (
              <FormSection title="Connect Google">
                {state === 'error' && connection?.lastError ? (
                  <Alert color="error">
                    <AlertContent>
                      <AlertTitle>The last connection ran into a problem</AlertTitle>
                      <AlertDescription>{connection.lastError}</AlertDescription>
                    </AlertContent>
                  </Alert>
                ) : null}
                <Text className="text-sm">
                  We will send you to Google to sign in and give permission. It opens in a small
                  window, so everything you have open here stays put. You will only be asked to
                  share the search figures for a site you already own.
                </Text>
                <Button
                  size="sm"
                  color="module"
                  className="self-start"
                  loading={connecting}
                  onClick={connect}
                >
                  <Plug className="size-4" aria-hidden />
                  {state === 'error' ? 'Reconnect Google' : 'Connect Google'}
                </Button>
              </FormSection>
            )}

            <SaveFailure title="Could not connect" message={connectFailure} />
          </div>
        )}
      </div>
    </div>
  );
}

export function SearchConsoleSurface({ ctx }: { ctx: SurfaceContext }) {
  return <SearchConsole ctx={ctx} />;
}
