'use client';

// Security — sign-in rules, what is known about how you work, the devices
// currently signed in, and a record of who did what.
//
// One centred column, deliberately NOT EditorLayout: this is not a form with a
// summary rail, it is self-contained concerns stacked in reading order. The
// column runs "how you get in" → "what is known about you" → "who is in right
// now" → "what has been done": the password, two-step verification, the
// analytics answer, the devices, the history. Each is its own card; none is a
// KPI worth a rail.
//
// The queries the toolbar's Refresh reloads (devices + activity) are owned HERE
// and passed down, so one control refreshes the whole pane rather than each card
// growing its own. Password change and two-step verification are mutations with
// no list to refresh, so they stay entirely inside their cards.
//
// Two-step verification sits directly under the password because it is the same
// question — how you prove it is you — and reads as the answer to the weakness
// the card above it has.

import { useEffect, useState } from 'react';
import { Heading, Text } from '@wizeworks/silicaui-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PasswordCard } from './password-card';
import { TwoFactorCard } from './two-factor-card';
import { AnalyticsCard } from './analytics-card';
import { SessionsCard } from './sessions-card';
import { ActivityCard } from './activity-card';
import { ACTIVITY_PAGE, useActivity, useSessions, useSignInMethods } from './security-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function SecuritySurface({ ctx }: { ctx: SurfaceContext }) {
  const [activityLimit, setActivityLimit] = useState(ACTIVITY_PAGE);

  const sessions = useSessions();
  const activity = useActivity(activityLimit);

  // Whether two-step verification is on is read from the console's own account
  // route. It used to come off Better Auth's `useSession()`, whose user object
  // carries `twoFactorEnabled` only until the session is next re-issued — and on
  // the Piggles console, which does not serve /api/auth/get-session at all, it
  // resolved to undefined and the card's badge read a flat "Off" on accounts
  // that had it switched on. See app/api/account/shared.ts.
  const signIn = useSignInMethods();
  const twoFactorEnabled = signIn.data?.twoFactorEnabled === true;

  useEffect(() => {
    ctx.setTitle('Security');
  }, [ctx]);

  const refreshAll = () => {
    void sessions.refetch();
    void activity.refetch();
  };
  const isFetching = sessions.isFetching || activity.isFetching;
  const updatedAt = Math.max(sessions.dataUpdatedAt, activity.dataUpdatedAt) || undefined;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Security actions"
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={updatedAt}
            onRefresh={refreshAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Security
            </Heading>
            <Text>
              How you sign in, what is measured about how you work, the devices signed in right now,
              and a record of what has been done in your account.
            </Text>
          </div>

          <PasswordCard />

          <TwoFactorCard enabled={twoFactorEnabled} />

          {/* Under the two proof-of-identity cards and above the device list:
              the column runs from "how you get in" to "what is known about how
              you work", and this is the first beat of the second half. */}
          <AnalyticsCard />

          <SessionsCard
            sessions={sessions.data}
            isPending={sessions.isPending}
            isError={sessions.isError}
            refetch={() => {
              void sessions.refetch();
            }}
          />

          <ActivityCard
            entries={activity.data}
            isPending={activity.isPending}
            isError={activity.isError}
            isFetching={activity.isFetching}
            limit={activityLimit}
            refetch={() => {
              void activity.refetch();
            }}
            onShowMore={() => {
              setActivityLimit((prev) => prev + ACTIVITY_PAGE);
            }}
          />
        </div>
      </div>
    </div>
  );
}
