'use client';

import * as React from 'react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, useTheme } from '@sparx/ui';
import { Clock, Moon, Sun } from 'lucide-react';
import { ActionsMenu } from './actions-menu';
import { StarButton } from './star-button';
import type { FavoriteRow } from '../_shell/service';
import type { UserPreferences } from '../_shell/preferences';

// Right-side header controls. Order (left to right): last-activity, ⋯,
// star, theme. See docs/24-dashboard-shell.md §4.5.

interface DashboardHeaderProps {
  favorites: FavoriteRow[];
  preferences: UserPreferences;
}

export function DashboardHeader({ favorites, preferences }: DashboardHeaderProps) {
  return (
    <>
      <LastActivityButton />
      <ActionsMenu favorites={favorites} preferences={preferences} />
      <StarButton favorites={favorites} />
      <ThemeToggleButton />
    </>
  );
}

function LastActivityButton() {
  // TODO(PR-later): wire to current entity's last_modified_at via context.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Last activity" disabled>
          <Clock className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Last activity (coming soon)</TooltipContent>
    </Tooltip>
  );
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;
  const nextLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={nextLabel} onClick={toggleTheme}>
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{nextLabel}</TooltipContent>
    </Tooltip>
  );
}
