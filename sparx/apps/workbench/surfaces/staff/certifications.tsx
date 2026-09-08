'use client';

// CERTIFICATIONS — everything expiring, soonest first (docs/149 §5).
//
// This is the surface that earns the module for a regulated trade. A licence
// that lapsed is a van that cannot leave the yard, an inspection that cannot be
// signed off, an insurance claim that gets refused — and nobody finds out from a
// spreadsheet, because a spreadsheet cannot tell you it is Tuesday.
//
// COLOR IS THE SCREEN. Expired is `danger` and SOLID; inside the warning window
// is `warning`; anything else is quiet. Rendering these three the same grey
// would be a failed screen, not a safe one (DESIGN.md RULE #4) — the whole point
// is that a glance answers "is anyone not currently qualified?".
//
// AND "NO EXPIRY" IS A REAL ANSWER. A qualification that never lapses is not a
// missing date: it must never sort to the top of a list whose job is showing
// what needs attention, and it must never wear a warning color.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useCertifications } from './data';
import { certificationLabel, formatDate } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

const HORIZONS = [
  { value: 'attention', label: 'Needs attention' },
  { value: '90', label: 'Next 90 days' },
  { value: 'all', label: 'Everything' },
] as const;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CertificationsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [horizon, setHorizon] = useState<string>('attention');

  // Always fetch the lot. The API sorts soonest-first and the counts have to
  // describe the WHOLE picture, not the current filter — "0 expired" while a
  // 90-day filter hides two lapsed licences is the worst possible answer.
  const certs = useCertifications({});
  const loaded = certs.data?.items;
  const all = useMemo(() => loaded ?? [], [loaded]);

  const rows = useMemo(() => {
    if (horizon === 'attention') {
      return all.filter((cert) => cert.state === 'expired' || cert.state === 'expiring');
    }
    if (horizon === '90') {
      return all.filter((cert) => cert.daysUntilExpiry !== null && cert.daysUntilExpiry <= 90);
    }
    return all;
  }, [all, horizon]);

  const expired = certs.data?.expiredCount ?? 0;
  const expiring = certs.data?.expiringCount ?? 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Certification controls"
        controls={
          <>
            <Filter
              color="module"
              value={horizon}
              onValueChange={(next) => {
                setHorizon(typeof next === 'string' ? next : 'attention');
              }}
              showReset={false}
              aria-label="How far ahead to look"
            >
              {HORIZONS.map((option) => (
                <FilterItem key={option.value} value={option.value}>
                  {option.label}
                </FilterItem>
              ))}
            </Filter>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={certs.isFetching}
            updatedAt={certs.data ? certs.dataUpdatedAt : undefined}
            onRefresh={() => {
              void certs.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {certs.isError ? (
          <EmptyState
            icon={<ShieldCheck className="size-6" aria-hidden />}
            title="Could not load qualifications"
            description="The server could not be reached. Nothing on file is affected."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void certs.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : certs.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : all.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<ShieldCheck className="size-6" aria-hidden />}
              title="Nothing recorded yet"
              description="If the people who work for you need licences, tickets or certificates, record them on each person and sparx will warn you before any of them run out — with as much notice as you ask for."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    ctx.open('staff.people', {});
                  }}
                >
                  Open the roster
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {expired > 0 ? (
              // Solid `error`, not a soft tint: somebody is not currently
              // qualified for work they may be about to be assigned.
              <Card className="bg-error text-error-content flex flex-col gap-1 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-5" aria-hidden />
                  <Heading level={2} className="text-lg font-semibold">
                    {expired === 1
                      ? 'One qualification has expired'
                      : `${String(expired)} qualifications have expired`}
                  </Heading>
                </div>
                <Text className="text-sm">
                  Whoever holds these is not currently qualified. Check before you put them on a job
                  that needs it.
                </Text>
              </Card>
            ) : expiring > 0 ? (
              <Card className="p-4">
                <Heading level={2} className="text-lg font-semibold">
                  {expiring === 1
                    ? 'One renewal is coming up'
                    : `${String(expiring)} renewals are coming up`}
                </Heading>
                <Text className="mt-1 text-sm">
                  Still valid — but inside the notice window you set for each one.
                </Text>
              </Card>
            ) : (
              <Card className="p-4">
                <Heading level={2} className="text-lg font-semibold">
                  Everyone is current
                </Heading>
                <Text className="mt-1 text-sm">
                  Nothing on file has expired or is inside its notice window.
                </Text>
              </Card>
            )}

            {rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<ShieldCheck className="size-6" aria-hidden />}
                  title="Nothing in this window"
                  description="Switch to Everything to see the full list, including qualifications that do not expire."
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table size="sm" hover>
                  <thead>
                    <tr>
                      <th>Qualification</th>
                      <th>Who holds it</th>
                      <th className="hidden @lg:table-cell">Expires</th>
                      <th className="text-right">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((cert) => {
                      const state = certificationLabel(cert.state, cert.daysUntilExpiry);
                      const open = (event: { shiftKey: boolean; altKey: boolean }) => {
                        ctx.open(
                          'staff.person',
                          { id: cert.staffMemberId },
                          { target: targetFor(event) }
                        );
                      };
                      return (
                        <tr
                          key={cert.id}
                          className="cursor-pointer"
                          tabIndex={0}
                          role="button"
                          onClick={open}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            open(event);
                          }}
                        >
                          <td className="max-w-56 min-w-0">
                            <div className="truncate font-medium">{cert.name}</div>
                            {cert.issuer ? (
                              <div className="truncate text-sm">{cert.issuer}</div>
                            ) : null}
                          </td>
                          <td className="max-w-40 truncate">{cert.staffMemberName}</td>
                          <td className="hidden text-sm whitespace-nowrap @lg:table-cell">
                            {cert.expiresOn ? formatDate(cert.expiresOn) : 'Never'}
                          </td>
                          <td className="text-right">
                            <Badge
                              color={state.tone}
                              variant={cert.state === 'expired' ? 'solid' : 'soft'}
                              size="sm"
                            >
                              {state.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
            )}

            <RowOpenHint what="a row to open the person who holds it" />
          </div>
        )}
      </div>
    </div>
  );
}
