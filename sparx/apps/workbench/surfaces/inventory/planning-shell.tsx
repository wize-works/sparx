'use client';

// The chrome every planning surface shares — and the reason there are several
// surfaces rather than one tabbed screen.
//
// ── Why this is not a tab strip ───────────────────────────────────────────
//
// Planning answers five questions, and the first shape it took was one surface
// with five tabs. In the workbench that is tabs on tabs: the pane strip along
// the top of the window is ALREADY a tab bar, so a second row of tabs three
// pixels below it asks the eye to work out which of two identical controls it is
// looking at. Worse, it fights the app — a pane strip tab can be torn off, docked
// beside another, deep-linked and remembered per site, and an in-surface tab can
// do none of that. "At risk beside Not selling" is a thing a buyer genuinely
// wants, and the tabbed version made it impossible.
//
// So each question is its own surface, and the pane strip is the tab strip. What
// they share is this file: the same location filter, the same "when was this last
// worked out", the same one button that works it out, and the same banner for the
// state where nothing has been measured yet.

import { useState, type ReactNode } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  NativeSelect,
  Text,
  Timestamp,
  ToolbarSeparator,
  useToast,
} from '@wizeworks/silicaui-react';
import { Calculator } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { OpenTarget } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage, useStockLocations } from './data';
import { usePlanningPolicy, useRecomputePlanning } from './planning-data';

/** Shift opens alongside, alt tears off into its own window, plain replaces. */
export function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

interface PlanningShellProps {
  /** ARIA label for the toolbar, e.g. "At risk controls". */
  label: string;
  /**
   * Tenant-wide surfaces (settings) hide the location filter rather than showing
   * one that changes nothing — a control that does not control anything is worse
   * than an absent one.
   */
  scope?: 'location' | 'tenant';
  /**
   * A surface's own search box and filters, rendered INSIDE the one toolbar
   * ahead of the location picker (search leads, selects follow — the ordering
   * every other list in the app uses).
   *
   * This slot exists because the alternative is what "What matters" shipped as:
   * a row of filter controls floating above the table, three pixels under the
   * real toolbar, reading as a second toolbar. A pane gets ONE bar of controls.
   * Hoisting the state up to the surface to fill this slot is a small cost for
   * that.
   */
  filters?: ReactNode;
  isFetching: boolean;
  updatedAt?: number | undefined;
  onRefresh: () => void;
  /** Rendered with the chosen location — '' means every location. */
  children: (locationId: string) => ReactNode;
}

export function PlanningShell({
  label,
  scope = 'location',
  filters,
  isFetching,
  updatedAt,
  onRefresh,
  children,
}: PlanningShellProps) {
  const [locationId, setLocationId] = useState('');

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);

  const policy = usePlanningPolicy();
  const recompute = useRecomputePlanning();
  const toast = useToast();

  const lastSweepAt = policy.data?.lastSweepAt ?? null;

  const onRecompute = () => {
    recompute.mutate(
      { ...(locationId ? { warehouseId: locationId } : {}) },
      {
        onSuccess: (result) => {
          const failed = result.stages.filter((s) => !s.ok);
          afterCommit(() => {
            toast.add({
              title: failed.length === 0 ? 'Numbers brought up to date' : 'Finished with problems',
              description:
                failed.length === 0
                  ? `${plural(result.levelsPlanned, 'stock line', 'stock lines')} re-measured.`
                  : `${plural(failed.length, 'step', 'steps')} could not finish — those figures are from the last good run.`,
              type: failed.length === 0 ? 'success' : 'warning',
            });
          });
        },
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not work the numbers out',
              description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={label}
        status={
          <Text className="hidden text-sm @2xl:block">
            {lastSweepAt ? (
              <>
                Worked out <Timestamp value={lastSweepAt} format="relative" />
              </>
            ) : (
              'Not worked out yet'
            )}
          </Text>
        }
        primary={
          <Button
            className="ml-auto"
            size="sm"
            color="module"
            loading={recompute.isPending}
            onClick={onRecompute}
          >
            <Calculator className="size-4" aria-hidden />
            Work it out now
          </Button>
        }
        controls={
          <>
            {filters}
            {scope === 'location' ? (
              <>
                <NativeSelect
                  size="sm"
                  className="max-w-48 shrink"
                  aria-label="Plan for stock kept at"
                  value={locationId}
                  onChange={(event) => {
                    setLocationId(event.target.value);
                  }}
                >
                  <option value="">Every location</option>
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>

                <ToolbarSeparator className="hidden @xl:block" />
              </>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={updatedAt} onRefresh={onRefresh} />
        }
      />

      {/* Worth more than any figure below it: with no run behind them, the
          numbers on these screens are ABSENT rather than wrong, and saying so
          beats a screen full of dashes. */}
      {policy.data && !lastSweepAt ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>Nothing has been measured yet</AlertTitle>
            <AlertDescription>
              Planning works from your own sales history and your own deliveries, so it needs one
              pass over them before it can say anything. That happens overnight — or press “Work it
              out now”.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">{children(locationId)}</div>
    </div>
  );
}

/**
 * Has a sweep ever run? Every planning surface needs this to tell "there is
 * nothing to report" apart from "nobody has looked yet" — two empty lists that
 * mean opposite things, and reporting the reassuring one when the truth is the
 * other is the worst thing any of these screens could do.
 */
export function useHasBeenMeasured(): boolean {
  const policy = usePlanningPolicy();
  return Boolean(policy.data?.lastSweepAt);
}
