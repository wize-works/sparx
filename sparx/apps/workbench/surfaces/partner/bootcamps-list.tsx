'use client';

// Bootcamps — the training cohorts you host on sparx.
//
// A host's own list. On-platform sign-ups land as leads in the host's CRM;
// Registered partners can build drafts, and Certified partners can publish them to
// the public sparx directory. Creating and managing a bootcamp is ONE surface in
// two states, so "New bootcamp" and clicking a row both open the same detail pane
// — never a separate create modal.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { GraduationCap, Plus } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useBootcamps, usePartnerProfile, type Bootcamp } from './data';
import { bootcampState, formatDate, formatLabel } from './format';
import { PartnerLoadError, PartnerLoading } from './gate';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function seatsLabel(bootcamp: Bootcamp): string {
  if (bootcamp.seatsTotal == null) return `${String(bootcamp.seatsFilled)} signed up`;
  return `${String(bootcamp.seatsFilled)} of ${String(bootcamp.seatsTotal)} seats`;
}

function BootcampRow({
  bootcamp,
  onOpen,
}: {
  bootcamp: Bootcamp;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = bootcampState(bootcamp.status);
  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(event);
      }}
    >
      <td className="align-top font-medium">{bootcamp.title}</td>
      <td className="hidden align-top whitespace-nowrap @lg:table-cell">
        {formatDate(bootcamp.startsAt)}
      </td>
      <td className="hidden align-top @xl:table-cell">{formatLabel(bootcamp.format)}</td>
      <td className="hidden align-top whitespace-nowrap tabular-nums @2xl:table-cell">
        {seatsLabel(bootcamp)}
      </td>
      <td className="align-top">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
    </tr>
  );
}

export function BootcampsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const profile = usePartnerProfile();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch, error } = useBootcamps();
  const bootcamps = data ?? [];
  const canHost = profile.data?.status === 'active';

  const openNew = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('partner.bootcamp.detail', { id: 'new' }, { target: targetFor(event) });
  };
  const openBootcamp = (bootcamp: Bootcamp, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('partner.bootcamp.detail', { id: bootcamp.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Bootcamps list controls"
        status={
          <Text className="text-sm whitespace-nowrap">
            {bootcamps.length === 1 ? '1 bootcamp' : `${String(bootcamps.length)} bootcamps`}
          </Text>
        }
        controls={
          <>
            {canHost ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto shrink-0 whitespace-nowrap"
                title="New bootcamp — hold Shift to open alongside, Alt for a new window"
                onClick={openNew}
              >
                <Plus className="size-4" aria-hidden />
                New bootcamp
              </Button>
            ) : (
              <span className="ml-auto" />
            )}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {isError ? (
        <PartnerLoadError
          section="bootcamps"
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : isPending ? (
        <PartnerLoading />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {!canHost && profile.data ? (
              <Alert color="info">
                <AlertContent>
                  <AlertTitle>Hosting unlocks when your account is active</AlertTitle>
                  <AlertDescription>
                    Your partner application is in review. Once you’re an active partner you’ll be
                    able to create and run bootcamps here.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {bootcamps.length === 0 ? (
              <EmptyState
                icon={<GraduationCap className="size-6" aria-hidden />}
                title="No bootcamps yet"
                description={
                  canHost
                    ? 'Create your first cohort. Save it as a draft, then publish it when you’re ready to take sign-ups.'
                    : 'Once your partner account is active, the cohorts you create will appear here.'
                }
                actions={
                  canHost ? (
                    <Button size="sm" color="module" onClick={openNew}>
                      <Plus className="size-4" aria-hidden />
                      New bootcamp
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <section className="card bg-base-100 overflow-hidden">
                <div className="px-2">
                  <Table size="sm" hover>
                    <thead>
                      <tr>
                        <th>Bootcamp</th>
                        <th className="hidden @lg:table-cell">Starts</th>
                        <th className="hidden @xl:table-cell">Format</th>
                        <th className="hidden @2xl:table-cell">Sign-ups</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bootcamps.map((bootcamp) => (
                        <BootcampRow
                          key={bootcamp.id}
                          bootcamp={bootcamp}
                          onOpen={(event) => {
                            openBootcamp(bootcamp, event);
                          }}
                        />
                      ))}
                    </tbody>
                  </Table>
                </div>
              </section>
            )}
          </div>

          <RowOpenHint what="a bootcamp to manage it" />
        </div>
      )}
    </div>
  );
}
