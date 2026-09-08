'use client';

// Connections — the accounts your posts can go out to, and the ones you could add.
//
// A connection is a durable thing you come back to: to add a destination, to read
// why an account needs reconnecting, to turn one Page off for a while, or to
// remove it. So this is a pane, not a modal. Connecting an account is an OAuth
// consent step that opens in a small popup — the workbench and everything you had
// arranged stays exactly where it was; the platform returns to a page on this app
// that hands the code back to this pane (see app/social/callback), which then
// trades it for a stored, encrypted connection.
//
// The audience owns a business, not a social API. Nothing here says "OAuth
// scope" or "target"; an account is an account and a destination is where a post
// lands — a specific Page, profile or listing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import Image from 'next/image';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Switch,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  faChartLine,
  faLinkSlash,
  faPlug,
  faShareNodes,
  faShieldCheck,
  faUsers,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { useConfirm } from '../../lib/confirm';
import { PlatformMark } from '../../components/platform-mark';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { AccountAvatar } from './post-visuals';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useViewer } from '../../lib/api/shell-data';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  canApprove,
  catalogByPlatform,
  connectionStatusMeta,
  platformName,
  socialErrorMessage,
  useCompleteConnect,
  useConnectUrl,
  useDisconnectPlatform,
  useSocialOverview,
  useSocialReadiness,
  useToggleTarget,
  useUpdateSocialSettings,
  type CatalogEntry,
  type ConnectionReadiness,
  type ReadinessVerdict,
  type SocialConnection,
  type SocialTarget,
} from './data';
import { productCopy } from '../../lib/product';
import { SaveFailure } from '@/components/save-failure';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** Registry module for this pane, so the brand draws Get Seen's own picture rather
 *  than the generic one. */
const MODULE = 'social';

/** The shape the callback page posts back through `window.opener`. */
interface CallbackMessage {
  source: 'piggles-social';
  code?: string;
  state?: string;
  error?: string;
}

function isCallbackMessage(data: unknown): data is CallbackMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === 'piggles-social'
  );
}

/** A small account/destination avatar, or a fallback glyph. Third-party avatar
 *  hosts are not on our optimizer allow-list, so these render unoptimized (same
 *  reasoning as the media picker's cross-origin thumbnails). */
function Avatar({ url, size = 40 }: { url: string | null; size?: number }) {
  const cls = size >= 40 ? 'size-10' : 'size-8';
  if (!url) {
    return (
      <span
        className={`bg-base-200 flex ${cls} shrink-0 items-center justify-center rounded-full`}
        aria-hidden
      >
        <Icon glyph={faUsers} className="size-4" />
      </span>
    );
  }
  return (
    <span className={`bg-base-200 relative ${cls} shrink-0 overflow-hidden rounded-full`}>
      <Image
        src={url}
        alt=""
        fill
        sizes={`${String(size)}px`}
        className="object-cover"
        unoptimized
      />
    </span>
  );
}

/* ── One destination row (a Page / profile / listing) ─────────────────────── */

function TargetRow({ target, canManage }: { target: SocialTarget; canManage: boolean }) {
  const toast = useToast();
  const toggle = useToggleTarget();

  const onToggle = (next: boolean) => {
    toggle.mutate(
      { id: target.id, enabled: next },
      {
        onError: (error) => {
          toast.add({
            title: 'Could not change that destination',
            description: socialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className="border-base-300 flex items-center gap-3 border-b py-2 last:border-b-0">
      <Avatar url={target.avatarUrl} size={32} />
      <span className="min-w-0 flex-1 truncate font-medium">{target.name}</span>
      {canManage ? (
        <Switch
          color="module"
          checked={target.enabled}
          disabled={toggle.isPending}
          aria-label={
            target.enabled
              ? `${target.name} is on — turn it off to stop posting here`
              : `${target.name} is off — turn it on to post here`
          }
          onCheckedChange={onToggle}
        />
      ) : (
        <Badge color={target.enabled ? 'success' : 'neutral'} variant="soft" size="sm">
          {target.enabled ? 'On' : 'Off'}
        </Badge>
      )}
    </div>
  );
}

/* ── One connected account ────────────────────────────────────────────────── */

function ConnectionCard({
  connection,
  name,
  canManage,
  onDisconnect,
  disconnecting,
}: {
  connection: SocialConnection;
  name: string;
  canManage: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const state = connectionStatusMeta(connection.status);
  const enabledCount = connection.targets.filter((t) => t.enabled).length;

  return (
    <div className="border-base-300 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* The same overlapping pair the Posts list and the composer use. Every card
            already names the platform in its meta line, but a name is read and a logo is
            SEEN — with five accounts connected, the logos are what let someone find the
            right card without reading any of them. */}
        <AccountAvatar
          platform={connection.platform}
          name={connection.displayName ?? name}
          src={connection.avatarUrl}
          title={connection.displayName ?? name}
          size="md"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Text as="span" className="font-semibold">
              {connection.displayName ?? name}
            </Text>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
          </div>
          <Text className="text-sm">
            {name} · connected <Timestamp value={connection.connectedAt} format="relative" />
          </Text>
        </div>
        {canManage ? (
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            loading={disconnecting}
            onClick={onDisconnect}
          >
            <Icon glyph={faLinkSlash} className="size-4" aria-hidden />
            Disconnect
          </Button>
        ) : null}
      </div>

      {connection.status === 'expired' ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>This account needs reconnecting</AlertTitle>
            <AlertDescription>
              Its permission has run out, so posts to it will not go through. Connect {name} again
              below to fix it — nothing already posted is affected.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {connection.targets.length === 0 ? (
        <Text className="text-sm">
          No destinations were found on this account. Try disconnecting and connecting it again.
        </Text>
      ) : (
        <div className="flex flex-col">
          <Text className="pb-1 text-sm font-medium">
            Where posts land ({enabledCount} of {connection.targets.length} on)
          </Text>
          {connection.targets.map((target) => (
            <TargetRow key={target.id} target={target} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── A platform you could connect ─────────────────────────────────────────── */

function CatalogRow({
  entry,
  canManage,
  connecting,
  onConnect,
}: {
  entry: CatalogEntry;
  canManage: boolean;
  connecting: boolean;
  onConnect: () => void;
}) {
  const available = entry.availability === 'available';
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-3 border-b pb-3 last:border-b-0 last:pb-0">
      {/* Nothing is connected here yet, so there is no face to wear the badge — the
          platform's own mark IS the avatar, at the same size the connected rows use so
          the two lists read as one column. Full color even for "coming soon": the badge
          beside it already says so, and fading the logo would say it twice. */}
      <PlatformMark platform={entry.platform} className="size-10" label={entry.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text as="span" className="font-medium">
          {entry.name}
        </Text>
        <Text className="text-sm">{entry.blurb}</Text>
      </div>
      {available ? (
        canManage ? (
          <Button
            size="sm"
            color="module"
            variant="outline"
            loading={connecting}
            onClick={onConnect}
          >
            <Icon glyph={faPlug} className="size-4" aria-hidden />
            Connect
          </Button>
        ) : (
          <Badge color="success" variant="soft" size="sm">
            Available
          </Badge>
        )
      ) : (
        <Badge color="neutral" variant="soft" size="sm">
          Coming soon
        </Badge>
      )}
    </div>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

/** Status color for a readiness verdict. `unverifiable` is `info`, not neutral: it is a
 *  real finding ("nobody can tell you from here"), not an absence of one. */
function readinessTone(verdict: ReadinessVerdict): 'success' | 'warning' | 'error' | 'info' {
  switch (verdict) {
    case 'ready':
      return 'success';
    case 'awaiting_review':
      return 'warning';
    case 'reconnect_required':
    case 'permissions_missing':
      return 'error';
    case 'unverifiable':
      return 'info';
  }
}

function ReadinessRow({ result, name }: { result: ConnectionReadiness; name: string }) {
  return (
    <div className="border-base-300 flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformMark platform={result.platform} className="size-5" />
        <Text className="font-medium">{result.displayName ?? name}</Text>
        <Text className="text-sm">{name}</Text>
        <Badge color={readinessTone(result.verdict)} variant="soft" size="sm" className="ml-auto">
          {result.headline}
        </Badge>
      </div>
      <Text className="text-sm">{result.detail}</Text>
      {result.missing.length > 0 ? (
        <Text className="text-sm">Not granted: {result.missing.join(', ')}</Text>
      ) : null}
      {result.caveat ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>This result cannot be trusted</AlertTitle>
            <AlertDescription>{result.caveat}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
    </div>
  );
}

/** The permission check. Collapsed until asked for, because running it calls out to every
 *  platform in turn — this is the thing you open when a post failed for no visible reason
 *  or when you are waiting on a platform to finish reviewing sparx, not something the
 *  Connections list should pay for on every open. */
function PermissionCheck({ catalogMap }: { catalogMap: Map<string, CatalogEntry> }) {
  const [open, setOpen] = useState(false);
  const readiness = useSocialReadiness(open);
  const results = readiness.data?.connections ?? [];

  return (
    <FormSection
      title="Permission check"
      description={productCopy(
        'social.permissions.description',
        'Each platform decides what Piggles is allowed to do with your account. This compares what they granted against what posting, reading comments and reading your numbers actually need.'
      )}
    >
      {!open ? (
        <Button
          size="sm"
          color="module"
          variant="outline"
          onClick={() => {
            setOpen(true);
          }}
        >
          Check my accounts
        </Button>
      ) : readiness.isPending ? (
        <Text className="text-sm" role="status">
          Asking each platform…
        </Text>
      ) : readiness.isError ? (
        <Alert color="error">
          <AlertContent>
            <AlertTitle>Could not run the check</AlertTitle>
            <AlertDescription>
              {socialErrorMessage(readiness.error, 'Your connected accounts are unaffected.')}
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : results.length === 0 ? (
        <Text className="text-sm">There are no connected accounts to check yet.</Text>
      ) : (
        <div className="flex flex-col gap-3">
          {results.map((result) => (
            <ReadinessRow
              key={result.connectionId}
              result={result}
              name={platformName(result.platform, catalogMap)}
            />
          ))}
          <div className="flex items-center gap-2">
            <RefreshButton
              isFetching={readiness.isFetching}
              updatedAt={readiness.dataUpdatedAt}
              onRefresh={() => {
                void readiness.refetch();
              }}
            />
          </div>
        </div>
      )}
    </FormSection>
  );
}

export function SocialConnectionsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const viewer = useViewer();
  const overview = useSocialOverview();

  const connectUrl = useConnectUrl();
  const completeConnect = useCompleteConnect();
  const disconnect = useDisconnectPlatform();
  const updateSettings = useUpdateSocialSettings();

  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [connectFailure, setConnectFailure] = useState<string | null>(null);

  useEffect(() => {
    ctx.setTitle('Connections');
  }, [ctx]);

  const canManage = canApprove(viewer.data?.role);
  const data = overview.data;
  const catalogMap = useMemo(() => catalogByPlatform(data?.catalog ?? []), [data]);

  const connections = data?.connections ?? [];
  const available = (data?.catalog ?? []).filter((c) => c.availability === 'available');
  const comingSoon = (data?.catalog ?? []).filter((c) => c.availability !== 'available');

  // Finish a connect once the popup posts the code back.
  const runComplete = useCallback(
    (code: string, state: string) => {
      completeConnect.mutate(
        { code, state },
        {
          onSuccess: (result) => {
            setConnectingPlatform(null);
            const name = platformName(result.platform, catalogMap);
            toast.add({
              title: `${name} connected`,
              description:
                result.targets.length > 0
                  ? 'Choose which destinations to post to below.'
                  : 'No destinations were found — try again if this looks wrong.',
              type: 'success',
            });
          },
          onError: (error) => {
            setConnectingPlatform(null);
            setConnectFailure(
              socialErrorMessage(error, 'Could not finish connecting. Nothing was changed.')
            );
          },
        }
      );
    },
    [completeConnect, toast, catalogMap]
  );

  const completeRef = useRef(runComplete);
  completeRef.current = runComplete;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isCallbackMessage(event.data)) return;
      if (event.data.error) {
        setConnectingPlatform(null);
        setConnectFailure(
          event.data.error === 'access_denied'
            ? 'You cancelled the sign-in, so nothing was connected.'
            : `The platform reported a problem: ${event.data.error}`
        );
        return;
      }
      if (event.data.code && event.data.state) {
        completeRef.current(event.data.code, event.data.state);
      }
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const connect = (platform: string) => {
    setConnectFailure(null);
    setConnectingPlatform(platform);
    // Open the popup synchronously in the click handler so the browser does not
    // treat it as an unsolicited pop-up; point it at the platform once resolved.
    const popup = window.open('', 'piggles-social-connect', 'width=560,height=680');
    const redirectUri = `${window.location.origin}/social/callback`;
    connectUrl.mutate(
      { platform, redirectUri },
      {
        onSuccess: ({ url }) => {
          if (popup) popup.location.href = url;
          else window.location.href = url;
        },
        onError: (error) => {
          popup?.close();
          setConnectingPlatform(null);
          setConnectFailure(
            socialErrorMessage(error, 'Could not start the connection. Try again shortly.')
          );
        },
      }
    );
  };

  const onDisconnect = (platform: string) => {
    const name = platformName(platform, catalogMap);
    void (async () => {
      const ok = await confirm({
        title: `Disconnect ${name}?`,
        description: `Posts will stop going out to ${name} and its destinations. Anything already posted stays live on ${name} itself. You can connect it again any time. This cannot be undone.`,
        confirmLabel: 'Disconnect it',
        cancelLabel: 'Keep it connected',
        color: 'danger',
      });
      if (!ok) return;
      disconnect.mutate(platform, {
        onSuccess: () => {
          toast.add({ title: `Disconnected ${name}`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not disconnect that account',
            description: socialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  const onApprovalChange = (next: boolean) => {
    updateSettings.mutate(
      { requireApproval: next },
      {
        onSuccess: () => {
          toast.add({
            title: next ? 'Approval is now required' : 'Approval is now off',
            description: next
              ? 'Posts wait for an admin before they go live.'
              : 'Posts can be scheduled and published without a separate approval.',
            type: 'success',
          });
        },
        onError: (error: unknown) => {
          toast.add({
            title: 'Could not change that setting',
            description: socialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onTrackLinksChange = (next: boolean) => {
    updateSettings.mutate(
      { trackLinks: next },
      {
        onSuccess: () => {
          toast.add({
            title: next ? 'Link tracking is on' : 'Link tracking is off',
            description: next
              ? 'Visits from your posts now show up in your traffic reports.'
              : 'Links go out exactly as you write them.',
            type: 'success',
          });
        },
        onError: (error: unknown) => {
          toast.add({
            title: 'Could not change that setting',
            description: socialErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const connecting = connectUrl.isPending || completeConnect.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Connections controls"
        status={
          connections.length > 0 ? (
            <Badge color="success" variant="soft" size="sm">
              {connections.length === 1 ? '1 connected' : `${String(connections.length)} connected`}
            </Badge>
          ) : null
        }
        refresh={
          <RefreshButton
            isFetching={overview.isFetching}
            updatedAt={data ? overview.dataUpdatedAt : undefined}
            onRefresh={() => {
              void overview.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* Both non-ready states are carded, matching the branch beside them — a
              stack of FormSections, each already a card. */}
          {overview.isError ? (
            <Card>
              <PaneLoadError
                module={MODULE}
                icon={<Icon glyph={faShareNodes} className="size-6" aria-hidden />}
                title="Could not load your connections"
                description={socialErrorMessage(
                  overview.error,
                  'This is a problem reaching the server. Your connected accounts are unaffected.'
                )}
                onRetry={() => {
                  void overview.refetch();
                }}
              />
            </Card>
          ) : overview.isPending || !data ? (
            <Card>
              <PaneWaiting module={MODULE} />
            </Card>
          ) : (
            <>
              <Text>
                Connect the social accounts your business already has, then write once and post to
                all of them. You choose exactly which pages and profiles each post lands on.
              </Text>

              <SaveFailure title="Could not connect" message={connectFailure} />

              {/* Before posts go live — the approval gate. Admin-only to change;
                  everyone else sees where it stands. */}
              <FormSection title="Before posts go live">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Icon glyph={faShieldCheck} className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <Text className="text-sm">
                      Posts need an admin&rsquo;s approval before they go live. This keeps anything
                      drafted — by a teammate or automatically — from reaching your real accounts
                      until someone signs off.
                    </Text>
                  </div>
                  {canManage ? (
                    <Switch
                      color="module"
                      checked={data.settings.requireApproval}
                      disabled={updateSettings.isPending}
                      aria-label="Require approval before posts go live"
                      onCheckedChange={onApprovalChange}
                    />
                  ) : (
                    <Badge
                      color={data.settings.requireApproval ? 'success' : 'neutral'}
                      variant="soft"
                      size="sm"
                    >
                      {data.settings.requireApproval ? 'Required' : 'Off'}
                    </Badge>
                  )}
                </div>

                {/* Link tracking. On by default, because an untagged link makes social
                    look like it drives nothing; off is a real choice, because the tag is
                    visible in the address a customer sees. */}
                <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <Icon glyph={faChartLine} className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <Text className="text-sm">
                      Add tracking to links in your posts, so the visits and sales they bring show
                      up in your reports alongside every other way people find you. It adds a short
                      tag to the end of the address.
                    </Text>
                  </div>
                  {canManage ? (
                    <Switch
                      color="module"
                      checked={data.settings.trackLinks}
                      disabled={updateSettings.isPending}
                      aria-label="Track links in posts"
                      onCheckedChange={onTrackLinksChange}
                    />
                  ) : (
                    <Badge
                      color={data.settings.trackLinks ? 'success' : 'neutral'}
                      variant="soft"
                      size="sm"
                    >
                      {data.settings.trackLinks ? 'On' : 'Off'}
                    </Badge>
                  )}
                </div>
              </FormSection>

              <FormSection title="Connected accounts">
                {connections.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={<Icon glyph={faShareNodes} className="size-6" aria-hidden />}
                    title="No accounts connected yet"
                    description="Connect an account below and it appears here, with each page or profile you can post to."
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    {connections.map((connection) => (
                      <ConnectionCard
                        key={connection.id}
                        connection={connection}
                        name={platformName(connection.platform, catalogMap)}
                        canManage={canManage}
                        disconnecting={
                          disconnect.isPending && disconnect.variables === connection.platform
                        }
                        onDisconnect={() => {
                          onDisconnect(connection.platform);
                        }}
                      />
                    ))}
                  </div>
                )}
              </FormSection>

              {canManage && connections.length > 0 ? (
                <PermissionCheck catalogMap={catalogMap} />
              ) : null}

              {available.length > 0 ? (
                <FormSection
                  title="Ready to connect"
                  description={
                    canManage
                      ? 'Sign in to one of these to start posting to it.'
                      : 'These accounts can be connected by an admin.'
                  }
                >
                  <div className="flex flex-col gap-3">
                    {available.map((entry) => (
                      <CatalogRow
                        key={entry.platform}
                        entry={entry}
                        canManage={canManage}
                        connecting={connecting && connectingPlatform === entry.platform}
                        onConnect={() => {
                          connect(entry.platform);
                        }}
                      />
                    ))}
                  </div>
                </FormSection>
              ) : null}

              {comingSoon.length > 0 ? (
                <FormSection
                  title="On the way"
                  description="These platforms are not ready to connect yet — they will light up here when they are, with nothing for you to do."
                >
                  <div className="flex flex-col gap-3">
                    {comingSoon.map((entry) => (
                      <CatalogRow
                        key={entry.platform}
                        entry={entry}
                        canManage={canManage}
                        connecting={false}
                        onConnect={() => undefined}
                      />
                    ))}
                  </div>
                </FormSection>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SocialConnectionsSurface;
